use dotenv::dotenv;
use ethers::contract::LogMeta;
use ethers::prelude::*;
use ethers::providers::{Http, Provider};
use ethers::types::U64;
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

#[tokio::main]
async fn main() -> eyre::Result<()> {
    dotenv().ok();

    let rpc_url = env::var("SEPOLIA_RPC_URL")?;
    let pool_address: Address = env::var("SEPOLIA_POOL_ADDRESS")?.parse()?;
    let database_url = env::var("DATABASE_URL")?;

    let db = PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await?;

    let provider = Provider::<Http>::try_from(rpc_url)?.interval(Duration::from_millis(2000));
    let provider = Arc::new(provider);

    loop {
        if let Err(err) = listen_swaps(provider.clone(), pool_address, &db).await {
            eprintln!("Listener error: {:?}", err);
        }
        tokio::time::sleep(Duration::from_secs(3)).await;
    }
}

async fn listen_swaps(
    provider: Arc<Provider<Http>>,
    pool_address: Address,
    db: &PgPool,
) -> eyre::Result<()> {
    println!("Connecting to Sepolia RPC...");
    let pool = LiquidityPool::new(pool_address, provider.clone());
    let mut last_block = provider.get_block_number().await?;

    loop {
        let latest_block = provider.get_block_number().await?;
        if latest_block > last_block {
            let from_block = last_block + U64::from(1u64);
            let to_block = latest_block;
            let events = pool
                .event::<SwapFilter>()
                .from_block(from_block)
                .to_block(to_block)
                .query_with_meta()
                .await?;

            for (ev, meta) in events {
                if let Err(err) = store_swap(db, ev, meta).await {
                    eprintln!("Swap storage error: {:?}", err);
                }
            }

            last_block = latest_block;
        }

        tokio::time::sleep(Duration::from_secs(2)).await;
    }
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
