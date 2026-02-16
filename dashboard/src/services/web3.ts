import { BrowserProvider, formatUnits } from "ethers";

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
