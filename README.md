# Mini DEX

End-to-end stack for a simple DEX on Sepolia:

- Hardhat 3 contracts and deploy scripts
- Rust listener (ethers-rs) that stores swaps in Postgres
- Axum REST API + SSE stream
- React dashboard with live updates

## Architecture

High-level view of components and data flow:

```mermaid
flowchart LR
	U[User / Wallet] -->|swap| C[Contracts (Hardhat)
LiquidityPool.sol]
	C -->|events| I[Indexer (Rust / ethers-rs)]
	I -->|INSERT| P[(Postgres)]
	A[API (Rust / Axum)] -->|SELECT| P
	A -->|SSE / REST| D[Dashboard (React)]
	U -->|consulta| D
```

Flow summary:

1) User swaps on the pool contract.
2) The indexer listens to on-chain events and writes to Postgres.
3) The API serves REST and SSE for the dashboard.
4) The dashboard shows history and real-time updates.

## Project structure

- contracts/: Solidity contracts + tests (Hardhat)
- scripts/: deploy and network utilities
- dex-indexer/: event listener (Rust + ethers-rs)
- dex-api/: REST + SSE API (Rust + Axum)
- database/: Postgres schema.sql
- dashboard/: React front-end (Vite)
- docs/: docs and notes

## Prereqs

- Node.js 18+
- Rust 1.75+
- Docker (for local Postgres)
- Sepolia ETH for deploys

## Contracts (Hardhat)

### Env

Create a `.env` in the repo root:

```env
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_PROJECT_ID
SEPOLIA_PRIVATE_KEY=0xYOUR_PRIVATE_KEY_HEX_64_CHARS
```

If you have 0 ETH on Sepolia, use a faucet before deploying.

### Compile

```shell
npx hardhat compile
```

### Deploy tokens

```shell
npx hardhat run scripts/deploy.ts --network sepolia
```

### Deploy pool

Edit token addresses in [scripts/deployPool.ts](scripts/deployPool.ts) and run:

```shell
npx hardhat run scripts/deployPool.ts --network sepolia
```

## Services (Rust)

### Env

Create/update [dex-indexer/.env](dex-indexer/.env):

```env
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_PROJECT_ID
SEPOLIA_POOL_ADDRESS=0xPOOL_ADDRESS
DATABASE_URL=postgres://postgres:postgres@localhost:5432/mini_dex
```

Create/update [dex-api/.env](dex-api/.env):

```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/mini_dex
API_ADDR=0.0.0.0:3001
```

### Postgres

```shell
docker compose up -d
```

### Run (local)

```shell
cd dex-indexer
cargo run
```

In another terminal:

```shell
cd dex-api
cargo run
```

### REST + SSE (dex-api)

- `GET /health`
- `GET /swaps?limit=100&offset=0`
- `GET /swaps/latest`
- `GET /swaps/stream` (SSE)

## Dashboard (React)

### Install

```shell
cd dashboard
npm install
```

### Env (optional)

Create [dashboard/.env](dashboard/.env) if your API is not local:

```env
VITE_API_URL=http://localhost:3001
```

### Run

```shell
npm run dev
```

Open the URL printed by Vite to see live swaps.

## Docker Compose (isolated services)

Create the env files:

- [dex-indexer/.env](dex-indexer/.env)
- [dex-api/.env](dex-api/.env)
- [dashboard/.env](dashboard/.env)

Then run:

```shell
docker compose up --build
```
