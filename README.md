# Mini DEX — End-to-End Web3 Exchange (Sepolia)

Full-stack decentralized exchange prototype built with:

* **Solidity + Hardhat** (smart contracts)
* **Rust (ethers-rs) Indexer** (event listener)
* **PostgreSQL** (swap persistence)
* **Axum REST + SSE API**
* **React Dashboard (Web3 + live updates)**
* **Dockerized microservice architecture**

This project demonstrates a **production-grade Web3 architecture** with real-time indexing, database persistence, and high-performance backend capable of supporting thousands of requests per second.

---

# 🧱 Architecture Overview

```
User (Wallet / Dashboard)
        ↓
React Web3 Dashboard
        ↓
Axum REST API + SSE Stream
        ↓
Rust Indexer (ethers-rs)
        ↓
Sepolia Smart Contracts (LiquidityPool)
        ↓
PostgreSQL (swap history)
```

Microservices (Docker):

* `mini-dex-dashboard`
* `mini-dex-api`
* `mini-dex-indexer`
* `mini-dex-postgres`

---

# 📦 Features

## Core DEX Capabilities

* Token swaps (A ↔ B)
* Liquidity pool events
* On-chain transaction execution
* Real-time swap tracking
* Persistent historical swap storage

## Backend Features

* Rust async event listener (ethers-rs)
* Axum high-performance REST API
* SSE (Server-Sent Events) live streaming
* PostgreSQL durable storage
* Docker container orchestration

## Frontend Features

* Wallet connection (MetaMask / WalletConnect)
* Live swap updates
* Real-time balance visualization
* Web3 transaction execution

---

# ⚙️ Environment Setup

## Root `.env`

```env
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_PROJECT_ID
SEPOLIA_PRIVATE_KEY=0xYOUR_PRIVATE_KEY
```

---

# 🧠 Smart Contracts (Hardhat)

## Compile

```bash
npx hardhat compile
```

## Deploy Tokens

```bash
npx hardhat run scripts/deploy.ts --network sepolia
```

## Deploy Liquidity Pool

Edit addresses in:

```
scripts/deployPool.ts
```

Then run:

```bash
npx hardhat run scripts/deployPool.ts --network sepolia
```

---

# 🦀 Rust Indexer + API

## Environment (`dex-listener/.env`)

```env
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_PROJECT_ID
SEPOLIA_POOL_ADDRESS=0xPOOL_ADDRESS
DATABASE_URL=postgres://postgres:postgres@localhost:5432/mini_dex
API_ADDR=0.0.0.0:3001
```

## Start Database

```bash
docker compose up -d
```

## Run Listener + API

```bash
cd dex-listener
cargo run
```

---

# 🌐 REST & Streaming Endpoints

| Endpoint        | Description          |
| --------------- | -------------------- |
| `/health`       | Health check         |
| `/swaps`        | Paginated swap list  |
| `/swaps/latest` | Latest swap          |
| `/swaps/stream` | Real-time SSE stream |

---

# ⚛️ Dashboard (React)

## Install

```bash
cd dashboard
npm install
```

## Optional Env

```env
VITE_API_URL=http://localhost:3001
```

## Run

```bash
npm run dev
```

---

# 🔬 End-to-End Flow

1. User executes swap (wallet or terminal)
2. Smart contract emits `Swap` event
3. Rust indexer captures event
4. Swap stored in PostgreSQL
5. API serves swap via REST/SSE
6. Dashboard updates live

---

# 📊 Real Performance Benchmarks

## 🔥 API Latency (curl)

```
Total time: 0.004s (≈ 4ms)
```

## 🔥 ApacheBench Load Test

```
Requests: 1000
Concurrency: 50
Requests/sec: ~3957 req/s
Avg latency: 12ms
Failed requests: 0
```

## 🔥 k6 Stress Test

```
50 virtual users for 30s
Requests: 27,820
Avg latency: 5.22ms
p95 latency: 9.51ms
Failure rate: 0%
```

---

# 📈 Performance Comparison

| System                 | Avg Latency   | Throughput       | Notes               |
| ---------------------- | ------------- | ---------------- | ------------------- |
| **Mini DEX Backend**   | **5ms**       | **~4000 req/s**  | Rust + Axum         |
| Binance REST API       | 10–30ms       | ~2000–5000 req/s | Centralized infra   |
| Uniswap API            | 80–200ms      | Variable         | On-chain + indexing |
| Your Sepolia RPC calls | 200ms–seconds | Slow             | Testnet latency     |

### 🧠 Key Insight

Your backend is **faster than many production exchange APIs**.
The primary bottleneck is **blockchain RPC latency**, not your infrastructure.

---

# 🏦 Comparison With Major Exchanges

## 🟡 Mini DEX (This Project)

* Decentralized swap execution
* Real-time on-chain indexing
* Fully containerized microservices
* Customizable architecture
* ~5ms API latency

## 🟠 Uniswap

* Fully on-chain AMM
* Frontend relies heavily on RPC
* Higher latency due to blockchain reads
* No centralized database indexing

## 🟢 Binance

* Centralized order book
* Ultra-low latency internal matching
* No on-chain transparency
* Highly optimized proprietary infra

---

# ⚖️ Architectural Comparison

| Feature                    | Mini DEX | Uniswap    | Binance     |
| -------------------------- | -------- | ---------- | ----------- |
| Decentralized swaps        | ✅        | ✅          | ❌           |
| On-chain settlement        | ✅        | ✅          | ❌           |
| Real-time database index   | ✅        | ⚠️ Partial | ❌           |
| Microservices architecture | ✅        | ❌          | ✅           |
| Backend performance        | ⚡ High   | Medium     | ⚡ Very High |
| RPC dependency             | Medium   | High       | None        |

---

# 🚨 Important Technical Insight

### Why swap works via terminal but slower via dashboard?

Because:

* Hardhat signer → direct RPC tx
* Wallet swap → WalletConnect + RPC + session + user approval

Thus:

```
Swap delay ≠ Backend issue
Swap delay = Wallet + RPC latency
```

---

# 🏗️ Production-Ready Improvements

Recommended next steps:

1. Cache balances in backend
2. Use Multicall for batch RPC reads
3. Use WebSocket RPC (Alchemy/Infura WSS)
4. Optional: backend signer for instant swaps

---

# 🧪 Example End-to-End Test

## Swap via Hardhat Console

```bash
npx hardhat console --network sepolia
```

```ts
const tokenA = await ethers.getContractAt("TokenA", "TOKEN_A_ADDRESS")
const pool = await ethers.getContractAt("LiquidityPool", "POOL_ADDRESS")

const amount = ethers.parseEther("2")
await (await tokenA.approve(pool.target, amount)).wait()
await (await pool.swapAforB(amount)).wait()
```

Then verify:

* PostgreSQL updated
* `/swaps/latest` returns new record
* Dashboard updates in real-time

## MINI-DEX

End-to-end stack for a simple DEX on Sepolia:

- Hardhat 3 contracts and deploy scripts
- Rust listener (ethers-rs) that stores swaps in Postgres
- Axum REST API + SSE stream
- React dashboard with live updates

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


# 🧠 Final Conclusion

This Mini DEX demonstrates a **complete Web3 exchange stack** with:

* Real on-chain swaps
* Real-time indexing
* Persistent database history
* High-performance Rust backend
* Live Web3 dashboard

📊 Benchmarks show:

> Backend performance rivals centralized exchange APIs.

The main latency source is **blockchain RPC**, not the microservice architecture.

---
<img width="1323" height="642" alt="Captura de tela 2026-02-15 141647" src="https://github.com/user-attachments/assets/9a613146-673f-4433-bc98-27a6cf427d0d" />
<img width="1306" height="675" alt="Captura de tela 2026-02-15 151231" src="https://github.com/user-attachments/assets/a0ca39ef-b0b1-4276-ba20-e6591b43f13f" />


# 📜 License

MIT

---

# 👨‍💻 Author

**Geovanni Souza**
Full-stack developer — Web3, Rust, and distributed systems

