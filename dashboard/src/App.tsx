import { useEffect, useMemo, useState } from "react";
import { fetchLatestSwap, fetchSwaps } from "./api";
import ConnectWallet from "./components/ConnectWallet";
import SwapForm from "./components/SwapForm";
import TokenBalances from "./components/TokenBalances";
import type { SwapRow } from "./types";

const short = (value: string, size = 4) =>
  `${value.slice(0, 2 + size)}...${value.slice(-size)}`;

function formatAmount(value: string) {
  const big = BigInt(value);
  const whole = big / 10n ** 18n;
  const fraction = (big % 10n ** 18n) / 10n ** 14n;
  return `${whole}.${fraction.toString().padStart(4, "0")}`;
}

export default function App() {
  const [swaps, setSwaps] = useState<SwapRow[]>([]);
  const [latest, setLatest] = useState<SwapRow | null>(null);
  const [status, setStatus] = useState("connecting");
  const [error, setError] = useState<string | null>(null);

  const totalVolume = useMemo(() => {
    return swaps.reduce((acc, swap) => acc + BigInt(swap.amount_in), 0n);
  }, [swaps]);

  useEffect(() => {
    let active = true;
    let socket: WebSocket | null = null;

    const load = async () => {
      try {
        setStatus("syncing");
        const [latestSwap, swapList] = await Promise.all([
          fetchLatestSwap(),
          fetchSwaps(50),
        ]);
        if (!active) return;
        setLatest(latestSwap);
        setSwaps(swapList);
        setError(null);
        setStatus("live");
      } catch (err) {
        if (!active) return;
        setStatus("error");
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    };

    const connectStream = () => {
      const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:3001";
      const wsUrl = apiUrl.replace(/^http/, "ws");
      socket = new WebSocket(`${wsUrl}/swaps/ws`);

      socket.onopen = () => {
        setStatus("live");
        setError(null);
      };

      socket.onerror = () => {
        setStatus("error");
        setError("Live stream disconnected");
      };

      socket.onmessage = (event) => {
        if (!active) return;
        try {
          const payload = JSON.parse(event.data) as SwapRow;
          setLatest(payload);
          setSwaps((prev) => {
            const seen = new Set(prev.map((swap) => `${swap.tx_hash}-${swap.log_index}`));
            if (seen.has(`${payload.tx_hash}-${payload.log_index}`)) {
              return prev;
            }
            return [payload, ...prev].slice(0, 50);
          });
        } catch (err) {
          console.error(err);
        }
      };
    };

    load();
    connectStream();

    return () => {
      active = false;
      socket?.close();
    };
  }, []);

  return (
    <div className="app">
      <header className="hero">
        <div>
          <p className="badge">Sepolia Live</p>
          <h1>Mini DEX Pulse</h1>
          <p className="subtitle">
            Real-time swaps and liquidity from your Sepolia pool, delivered in a
            clean operator view.
          </p>
        </div>
        <div className="status">
          <span className={`dot ${status}`} />
          <div>
            <strong>Status</strong>
            <p>{status === "live" ? "Streaming" : status}</p>
          </div>
        </div>
      </header>

      <section className="grid">
        <div className="card">
          <h2>Wallet</h2>
          <ConnectWallet />
          <div className="divider" />
          <TokenBalances />
        </div>
        <div className="card highlight">
          <SwapForm />
        </div>
      </section>

      <section className="grid">
        <div className="card highlight">
          <h2>Latest Swap</h2>
          {latest ? (
            <div className="latest">
              <div>
                <p className="label">Trader</p>
                <p>{short(latest.user_address, 6)}</p>
              </div>
              <div>
                <p className="label">Token In</p>
                <p>{short(latest.token_in, 6)}</p>
              </div>
              <div>
                <p className="label">Amount In</p>
                <p>{formatAmount(latest.amount_in)}</p>
              </div>
              <div>
                <p className="label">Amount Out</p>
                <p>{formatAmount(latest.amount_out)}</p>
              </div>
            </div>
          ) : (
            <p className="muted">Waiting for first swap...</p>
          )}
        </div>

        <div className="card">
          <h2>Session Stats</h2>
          <div className="stats">
            <div>
              <p className="label">Swaps tracked</p>
              <p className="stat">{swaps.length}</p>
            </div>
            <div>
              <p className="label">Total in (approx)</p>
              <p className="stat">{formatAmount(totalVolume.toString())}</p>
            </div>
            <div>
              <p className="label">Poll interval</p>
              <p className="stat">Live SSE</p>
            </div>
          </div>
        </div>
      </section>

      <section className="card table-card">
        <div className="table-header">
          <h2>Recent Swaps</h2>
          {error ? <span className="error">{error}</span> : null}
        </div>
        <div className="table">
          <div className="table-row table-head">
            <span>Block</span>
            <span>Trader</span>
            <span>Token In</span>
            <span>Amount In</span>
            <span>Amount Out</span>
            <span>Tx</span>
          </div>
          {swaps.map((swap) => (
            <div className="table-row" key={`${swap.tx_hash}-${swap.log_index}`}>
              <span>{swap.block_number}</span>
              <span>{short(swap.user_address, 6)}</span>
              <span>{short(swap.token_in, 6)}</span>
              <span>{formatAmount(swap.amount_in)}</span>
              <span>{formatAmount(swap.amount_out)}</span>
              <span className="mono">{short(swap.tx_hash, 6)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
