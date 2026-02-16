use dotenv::dotenv;
use ethers::abi::RawLog;
use ethers::contract::LogMeta;
use ethers::prelude::*;
use ethers::providers::{Http, Provider, Ws};
use ethers::types::{Filter, H256, U64};
use ethers::utils::keccak256;
use futures_util::StreamExt;
use sqlx::{postgres::PgPoolOptions, PgPool};
use std::env;
use std::sync::Arc;
use std::time::Duration;

abigen!(
    LiquidityPool,
    r#"[
        event Swap(address indexed user, address tokenIn, uint256 amountIn, uint256 amountOut)
        event LiquidityAdded(address indexed provider, uint256 amountA, uint256 amountB)
    ]"#,
);

const STARTUP_BACKFILL_BLOCKS: u64 = 2000;

#[tokio::main]
async fn main() -> eyre::Result<()> {
    dotenv().ok();

    let rpc_url = env::var("WS_RPC_URL")?;
    let http_rpc_url = env::var("HTTP_RPC_URL").ok();
    let pool_address: Address = env::var("SEPOLIA_POOL_ADDRESS")?.parse()?;
    let database_url = env::var("DATABASE_URL")?;

    let db = PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await?;

    let http_provider = match http_rpc_url {
        Some(url) => Some(Provider::<Http>::try_from(url)?),
        None => None,
    };

    let mut backoff = Duration::from_secs(1);
    let max_backoff = Duration::from_secs(30);
    let mut last_block: Option<U64> = None;

    loop {
        match connect_ws(&rpc_url).await {
            Ok(provider) => {
                backoff = Duration::from_secs(1);
                let provider = Arc::new(provider);
                if let Err(err) = listen_swaps_ws(
                    provider,
                    pool_address,
                    &db,
                    &mut last_block,
                    http_provider.clone(),
                )
                .await
                {
                    eprintln!("WS listener error: {:?}", err);
                }
            }
            Err(err) => {
                eprintln!("WS connect error: {:?}", err);
            }
        }

        if let Some(provider) = http_provider.as_ref() {
            if let Err(err) = backfill_swaps_http(provider, pool_address, &db, &mut last_block).await
            {
                eprintln!("HTTP backfill error: {:?}", err);
            }
        }

        tokio::time::sleep(backoff).await;
        backoff = std::cmp::min(backoff * 2, max_backoff);
    }
}

async fn connect_ws(rpc_url: &str) -> eyre::Result<Provider<Ws>> {
    let ws = tokio::time::timeout(Duration::from_secs(20), Ws::connect(rpc_url)).await??;
    Ok(Provider::new(ws))
}

async fn listen_swaps_ws(
    provider: Arc<Provider<Ws>>,
    pool_address: Address,
    db: &PgPool,
    last_block: &mut Option<U64>,
    http_provider: Option<Provider<Http>>,
) -> eyre::Result<()> {
    println!("Subscribing to Swap events in realtime...");

    let swap_sig = H256::from_slice(keccak256("Swap(address,address,uint256,uint256)").as_slice());
    let filter = Filter::new().address(pool_address).topic0(swap_sig);
    let mut stream = provider.subscribe_logs(&filter).await?;
    let mut backfill_interval = tokio::time::interval(Duration::from_secs(10));

    loop {
        tokio::select! {
            maybe_log = stream.next() => {
                let log = match maybe_log {
                    Some(log) => log,
                    None => return Ok(()),
                };

                if let Some(block_number) = log.block_number {
                    *last_block = Some(block_number);
                }

                let raw_log = RawLog {
                    topics: log.topics.clone(),
                    data: log.data.to_vec(),
                };

                match LiquidityPoolEvents::decode_log(&raw_log) {
                    Ok(LiquidityPoolEvents::SwapFilter(ev)) => {
                        let meta = LogMeta::from(&log);
                        println!("Swap log received: {:?}", meta.transaction_hash);
                        if let Err(err) = store_swap(db, ev, meta).await {
                            eprintln!("Swap storage error: {:?}", err);
                        }
                    }
                    Ok(_) => {}
                    Err(err) => {
                        eprintln!("Swap decode error: {:?}", err);
                    }
                }
            }
            _ = backfill_interval.tick() => {
                if let Some(provider) = http_provider.as_ref() {
                    if let Err(err) = backfill_swaps_http(provider, pool_address, db, last_block).await {
                        eprintln!("HTTP backfill error: {:?}", err);
                    }
                }
            }
        }
    }
}

async fn backfill_swaps_http(
    provider: &Provider<Http>,
    pool_address: Address,
    db: &PgPool,
    last_block: &mut Option<U64>,
) -> eyre::Result<()> {
    let latest_block = provider.get_block_number().await?;
    let mut from_block = match last_block {
        Some(block) => *block + U64::from(1u64),
        None => {
            let latest_u64 = latest_block.as_u64();
            let start_u64 = latest_u64.saturating_sub(STARTUP_BACKFILL_BLOCKS);
            U64::from(start_u64)
        }
    };

    if from_block > latest_block {
        return Ok(());
    }

    let pool = LiquidityPool::new(pool_address, Arc::new(provider.clone()));
    let max_range = U64::from(10u64);

    while from_block <= latest_block {
        let mut to_block = from_block + max_range - U64::from(1u64);
        if to_block > latest_block {
            to_block = latest_block;
        }

        let mut attempts = 0u32;
        loop {
            let events_result = pool
                .event::<SwapFilter>()
                .from_block(from_block)
                .to_block(to_block)
                .query_with_meta()
                .await;

            match events_result {
                Ok(events) => {
                    for (ev, meta) in events {
                        if let Err(err) = store_swap(db, ev, meta).await {
                            eprintln!("Swap storage error: {:?}", err);
                        }
                    }
                    *last_block = Some(to_block);
                    break;
                }
                Err(err) => {
                    attempts += 1;
                    eprintln!(
                        "Swap backfill error (attempt {}/3, blocks {}-{}): {:?}",
                        attempts, from_block, to_block, err
                    );
                    if attempts >= 3 {
                        return Err(err.into());
                    }
                    tokio::time::sleep(Duration::from_secs(2)).await;
                }
            }
        }

        from_block = to_block + U64::from(1u64);
    }

    Ok(())
}

async fn store_swap(db: &PgPool, ev: SwapFilter, meta: LogMeta) -> Result<(), sqlx::Error> {
    let tx_hash = format!("{:#x}", meta.transaction_hash);
    let log_index = meta.log_index.as_u64() as i64;

    sqlx::query(
        r#"
        INSERT INTO swaps (
            tx_hash,
            log_index,
            block_number,
            user_address,
            token_in,
            amount_in,
            amount_out
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (tx_hash, log_index) DO NOTHING
        "#,
    )
    .bind(&tx_hash)
    .bind(log_index)
    .bind(meta.block_number.as_u64() as i64)
    .bind(format!("{:#x}", ev.user))
    .bind(format!("{:#x}", ev.token_in))
    .bind(ev.amount_in.to_string())
    .bind(ev.amount_out.to_string())
    .execute(db)
    .await?;

    let payload = format!(r#"{{"tx_hash":"{}","log_index":{}}}"#, tx_hash, log_index);
    sqlx::query("SELECT pg_notify('swaps_channel', $1)")
        .bind(payload)
        .execute(db)
        .await?;

    Ok(())
}
