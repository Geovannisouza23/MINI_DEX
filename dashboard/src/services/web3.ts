import { BrowserProvider, FallbackProvider, JsonRpcProvider, formatUnits } from "ethers";

type NetworkInfo = {
  chainId: number;
  name: string;
  symbol: string;
};

const NETWORKS: Record<number, NetworkInfo> = {
  1: { chainId: 1, name: "Ethereum", symbol: "ETH" },
  10: { chainId: 10, name: "Optimism", symbol: "ETH" },
  137: { chainId: 137, name: "Polygon", symbol: "MATIC" },
  8453: { chainId: 8453, name: "Base", symbol: "ETH" },
  42161: { chainId: 42161, name: "Arbitrum", symbol: "ETH" },
  11155111: { chainId: 11155111, name: "Sepolia", symbol: "ETH" },
};

const RPC_URLS = [
  import.meta.env.VITE_ALCHEMY_RPC,
  import.meta.env.VITE_INFURA_RPC,
  import.meta.env.VITE_PUBLIC_RPC,
].filter(Boolean);

let readProvider: JsonRpcProvider | FallbackProvider | null = null;
const cache = new Map<string, { expiresAt: number; value: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

export function getReadProvider() {
  if (readProvider) return readProvider;
  if (!RPC_URLS.length) return null;

  const providers = RPC_URLS.map((url) => new JsonRpcProvider(url));
  readProvider = new FallbackProvider(providers);
  return readProvider;
}

export async function cachedCall<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) {
    return hit.value as T;
  }

  const existing = inflight.get(key);
  if (existing) {
    return existing as Promise<T>;
  }

  const promise = loader()
    .then((value) => {
      cache.set(key, { expiresAt: now + ttlMs, value });
      inflight.delete(key);
      return value;
    })
    .catch((err) => {
      inflight.delete(key);
      throw err;
    });

  inflight.set(key, promise);
  return promise as Promise<T>;
}

export function getNetworkInfo(chainId: number): NetworkInfo {
  return NETWORKS[chainId] ?? {
    chainId,
    name: "Unknown",
    symbol: "ETH",
  };
}

export async function getBalance(provider: BrowserProvider, address: string) {
  return provider.getBalance(address);
}

export function formatBalance(value: bigint, decimals = 18, precision = 4) {
  const formatted = formatUnits(value, decimals);
  const [whole, fraction = ""] = formatted.split(".");
  return `${whole}.${fraction.padEnd(precision, "0").slice(0, precision)}`;
}
