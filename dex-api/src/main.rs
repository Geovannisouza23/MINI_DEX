use axum::{
    extract::{ws::{Message, WebSocket, WebSocketUpgrade}, Query, State},
    http::StatusCode,
    response::sse::{Event, KeepAlive, Sse},
    routing::get,
    Json, Router,
};
use chrono::{DateTime, Utc};
use dotenv::dotenv;
use serde::{Deserialize, Serialize};
use sqlx::{postgres::PgListener, postgres::PgPoolOptions, PgPool};
use std::convert::Infallible;
use std::env;
use std::net::SocketAddr;
use std::time::Duration;
use tokio::sync::broadcast;
use futures_util::StreamExt;
use tokio_stream::wrappers::BroadcastStream;
use tower_http::cors::{Any, CorsLayer};

#[tokio::main]
async fn main() -> eyre::Result<()> {
    dotenv().ok();

    let database_url = env::var("DATABASE_URL")?;
    let api_addr: SocketAddr = env::var("API_ADDR")
        .unwrap_or_else(|_| "0.0.0.0:3001".to_string())
        .parse()?;

    let db = PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await?;

    let (swap_tx, _) = broadcast::channel(512);
    let listener_db = db.clone();
    let listener_tx = swap_tx.clone();
    tokio::spawn(async move {
        if let Err(err) = listen_swaps(listener_db, listener_tx, &database_url).await {
            eprintln!("listener error: {}", err);
        }
    });

    let app = Router::new()
        .route("/health", get(health))
        .route("/swaps", get(list_swaps))
        .route("/swaps/latest", get(latest_swap))
        .route("/swaps/stream", get(stream_swaps))
        .route("/swaps/ws", get(ws_swaps))
        .layer(CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any))
        .with_state(AppState { db, swap_tx });

    println!("API listening on {}", api_addr);
    axum::serve(tokio::net::TcpListener::bind(api_addr).await?, app).await?;

    Ok(())
}

#[derive(Clone)]
struct AppState {
    db: PgPool,
    swap_tx: broadcast::Sender<SwapRow>,
}

#[derive(Clone, Debug, Serialize, sqlx::FromRow)]
struct SwapRow {
    id: i64,
    tx_hash: String,
    log_index: i64,
    block_number: i64,
    user_address: String,
    token_in: String,
    amount_in: String,
    amount_out: String,
    observed_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
struct Pagination {
    limit: Option<i64>,
    offset: Option<i64>,
}

async fn health() -> StatusCode {
    StatusCode::OK
}

async fn list_swaps(
    State(state): State<AppState>,
    Query(params): Query<Pagination>,
) -> Result<Json<Vec<SwapRow>>, (StatusCode, String)> {
    let limit = params.limit.unwrap_or(100).clamp(1, 1000);
    let offset = params.offset.unwrap_or(0).max(0);

    let rows = sqlx::query_as::<_, SwapRow>(
        r#"
        SELECT
            id,
            tx_hash,
            log_index,
            block_number,
            user_address,
            token_in,
            amount_in,
            amount_out,
            observed_at
        FROM swaps
        ORDER BY block_number DESC, log_index DESC
        LIMIT $1 OFFSET $2
        "#,
    )
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.db)
    .await
    .map_err(internal_error)?;

    Ok(Json(rows))
}

async fn latest_swap(
    State(state): State<AppState>,
) -> Result<Json<Option<SwapRow>>, (StatusCode, String)> {
    let row = sqlx::query_as::<_, SwapRow>(
        r#"
        SELECT
            id,
            tx_hash,
            log_index,
            block_number,
            user_address,
            token_in,
            amount_in,
            amount_out,
            observed_at
        FROM swaps
        ORDER BY block_number DESC, log_index DESC
        LIMIT 1
        "#,
    )
    .fetch_optional(&state.db)
    .await
    .map_err(internal_error)?;

    Ok(Json(row))
}

async fn stream_swaps(
    State(state): State<AppState>,
) -> Sse<impl futures_util::Stream<Item = Result<Event, Infallible>>> {
    let rx = state.swap_tx.subscribe();
    let stream = BroadcastStream::new(rx).filter_map(|msg| async move {
        match msg {
            Ok(swap) => {
                let data = match serde_json::to_string(&swap) {
                    Ok(payload) => payload,
                    Err(_) => return None,
                };
                Some(Ok(Event::default().event("swap").data(data)))
            }
            Err(_) => None,
        }
    });

    Sse::new(stream).keep_alive(
        KeepAlive::new()
            .interval(Duration::from_secs(15))
            .text("keep-alive"),
    )
}

async fn ws_swaps(
    State(state): State<AppState>,
    ws: WebSocketUpgrade,
) -> axum::response::Response {
    ws.on_upgrade(move |socket| handle_ws(socket, state.swap_tx.subscribe()))
}

async fn handle_ws(mut socket: WebSocket, mut rx: broadcast::Receiver<SwapRow>) {
    while let Ok(swap) = rx.recv().await {
        if let Ok(payload) = serde_json::to_string(&swap) {
            if socket.send(Message::Text(payload)).await.is_err() {
                break;
            }
        }
    }
}

fn internal_error(err: impl std::fmt::Display) -> (StatusCode, String) {
    (StatusCode::INTERNAL_SERVER_ERROR, err.to_string())
}

#[derive(Deserialize)]
struct SwapNotification {
    tx_hash: String,
    log_index: i64,
}

async fn listen_swaps(
    db: PgPool,
    swap_tx: broadcast::Sender<SwapRow>,
    database_url: &str,
) -> Result<(), sqlx::Error> {
    loop {
        let mut listener = match PgListener::connect(database_url).await {
            Ok(listener) => listener,
            Err(err) => {
                eprintln!("listener connect error: {}", err);
                tokio::time::sleep(Duration::from_secs(2)).await;
                continue;
            }
        };

        if let Err(err) = listener.listen("swaps_channel").await {
            eprintln!("listener subscribe error: {}", err);
            tokio::time::sleep(Duration::from_secs(2)).await;
            continue;
        }

        loop {
            let notification = match listener.recv().await {
                Ok(notification) => notification,
                Err(err) => {
                    eprintln!("listener error: {}", err);
                    break;
                }
            };
            let payload = notification.payload();
            let parsed: SwapNotification = match serde_json::from_str(payload) {
                Ok(value) => value,
                Err(_) => continue,
            };

            if let Some(row) = sqlx::query_as::<_, SwapRow>(
                r#"
                SELECT
                    id,
                    tx_hash,
                    log_index,
                    block_number,
                    user_address,
                    token_in,
                    amount_in,
                    amount_out,
                    observed_at
                FROM swaps
                WHERE tx_hash = $1 AND log_index = $2
                LIMIT 1
                "#,
            )
            .bind(parsed.tx_hash)
            .bind(parsed.log_index)
            .fetch_optional(&db)
            .await?
            {
                let _ = swap_tx.send(row);
            }
        }

        tokio::time::sleep(Duration::from_secs(2)).await;
    }
}
