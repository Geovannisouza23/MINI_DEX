import type { SwapRow } from "./types";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export async function fetchSwaps(limit = 50): Promise<SwapRow[]> {
  const res = await fetch(`${API_URL}/swaps?limit=${limit}&offset=0`);
  if (!res.ok) {
    throw new Error(`Failed to load swaps (${res.status})`);
  }
  return res.json();
}

export async function fetchLatestSwap(): Promise<SwapRow | null> {
  const res = await fetch(`${API_URL}/swaps/latest`);
  if (!res.ok) {
    throw new Error(`Failed to load latest swap (${res.status})`);
  }
  return res.json();
}
