use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::sse::{Event, KeepAlive, Sse},
    routing::get,
    Json, Router,
};
use chrono::{DateTime, Utc};
use dotenv::dotenv;
use ethers::contract::LogMeta;
use ethers::prelude::*;
use ethers::providers::{Http, Provider};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sqlx::{postgres::PgPoolOptions, PgPool};
use std::convert::Infallible;
use std::env;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::broadcast;
use tokio_stream::wrappers::BroadcastStream;
use tower_http::cors::{Any, CorsLayer};

abigen!(
    LiquidityPool,
    r#"[
        event Swap(address indexed user, address tokenIn, uint256 amountIn, uint256 amountOut)
        event LiquidityAdded(address indexed provider, uint256 amountA, uint256 amountB)
    ]"#,
);

#[tokio::main]
async fn main() -> eyre::Result<()> {
    dotenv().ok();

    let rpc_url = env::var("SEPOLIA_RPC_URL")?;
    let pool_address: Address = env::var("SEPOLIA_POOL_ADDRESS")?.parse()?;
    let database_url = env::var("DATABASE_URL")?;
    let api_addr: SocketAddr = env::var("API_ADDR")
        .unwrap_or_else(|_| "0.0.0.0:3001".to_string())
        .parse()?;

    let db = PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await?;
    init_db(&db).await?;

    let provider = Provider::<Http>::try_from(rpc_url)?
        .interval(Duration::from_millis(2000));
    let provider = Arc::new(provider);

    let (swap_tx, _) = broadcast::channel(256);

    let listener_db = db.clone();
    let listener_tx = swap_tx.clone();
    tokio::spawn(async move {
        if let Err(err) = listen_swaps(provider, pool_address, listener_db, listener_tx).await {
            eprintln!("Listener error: {:?}", err);
        }
    });

    let app = Router::new()
        .route("/health", get(health))
        .route("/swaps", get(list_swaps))
        .route("/swaps/latest", get(latest_swap))
        .route("/swaps/stream", get(stream_swaps))
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

fn internal_error(err: impl std::fmt::Display) -> (StatusCode, String) {
    (StatusCode::INTERNAL_SERVER_ERROR, err.to_string())
}

async fn init_db(db: &PgPool) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS swaps (
            id BIGSERIAL PRIMARY KEY,
            tx_hash TEXT NOT NULL,
            log_index BIGINT NOT NULL,
            block_number BIGINT NOT NULL,
            user_address TEXT NOT NULL,
            token_in TEXT NOT NULL,
            amount_in TEXT NOT NULL,
            amount_out TEXT NOT NULL,
            observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        "#,
    )
    .execute(db)
    .await?;

    sqlx::query(
        r#"
        CREATE UNIQUE INDEX IF NOT EXISTS swaps_tx_log_idx
        ON swaps (tx_hash, log_index)
        "#,
    )
    .execute(db)
    .await?;

    Ok(())
}

async fn listen_swaps(
    provider: Arc<Provider<Http>>,
    pool_address: Address,
    db: PgPool,
    swap_tx: broadcast::Sender<SwapRow>,
) -> eyre::Result<()> {
    loop {
        println!("Connecting to Sepolia RPC...");

        let pool = LiquidityPool::new(pool_address, provider.clone());
        println!("Listening for Swap and LiquidityAdded events...\n");

        let swap_events = pool.event::<SwapFilter>().from_block(BlockNumber::Latest);

        let liquidity_events = pool
            .event::<LiquidityAddedFilter>()
            .from_block(BlockNumber::Latest);

        let mut swap_stream = swap_events.stream_with_meta().await?.fuse();
        let mut liquidity_stream = liquidity_events.stream().await?.fuse();

        loop {
            tokio::select! {
                Some(event) = swap_stream.next() => {
                    match event {
                        Ok((ev, meta)) => {
                            if let Err(err) = store_swap(&db, &swap_tx, ev, meta).await {
                                eprintln!("Swap storage error: {:?}", err);
                            }
                        }
                        Err(e) => {
                            println!("Swap stream error: {:?}", e);
                            break;
                        }
                    }
                }

                Some(event) = liquidity_stream.next() => {
                    match event {
                        Ok(ev) => {
                            println!("Liquidity Added: provider={:?} amountA={} amountB={}", ev.provider, ev.amount_a, ev.amount_b);
                        }
                        Err(e) => {
                            println!("Liquidity stream error: {:?}", e);
                            break;
                        }
                    }
                }
            }
        }

        println!("Reconnecting in 3 seconds...\n");
        tokio::time::sleep(Duration::from_secs(3)).await;
    }
}

async fn store_swap(
    db: &PgPool,
    swap_tx: &broadcast::Sender<SwapRow>,
    ev: SwapFilter,
    meta: LogMeta,
) -> Result<(), sqlx::Error> {
    let swap = SwapRow {
        tx_hash: format!("{:#x}", meta.transaction_hash),
        log_index: meta.log_index.as_u64() as i64,
        block_number: meta.block_number.as_u64() as i64,
        user_address: format!("{:#x}", ev.user),
        token_in: format!("{:#x}", ev.token_in),
        amount_in: ev.amount_in.to_string(),
        amount_out: ev.amount_out.to_string(),
        observed_at: Utc::now(),
    };

    sqlx::query(
        r#"
        INSERT INTO swaps (
            tx_hash,
            log_index,
            block_number,
            user_address,
            token_in,
            amount_in,
            amount_out,
            observed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (tx_hash, log_index) DO NOTHING
        "#,
    )
    .bind(&swap.tx_hash)
    .bind(swap.log_index)
    .bind(swap.block_number)
    .bind(&swap.user_address)
    .bind(&swap.token_in)
    .bind(&swap.amount_in)
    .bind(&swap.amount_out)
    .bind(swap.observed_at)
    .execute(db)
    .await?;

    let _ = swap_tx.send(swap);

    Ok(())
}
