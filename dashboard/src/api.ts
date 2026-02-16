import type { SwapRow } from "./types";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
const DEFAULT_TIMEOUT_MS = 8000;

async function fetchJson<T>(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Failed to load (${res.status})`);
    }
    return (await res.json()) as T;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function fetchSwaps(limit = 50): Promise<SwapRow[]> {
  return fetchJson<SwapRow[]>(`${API_URL}/swaps?limit=${limit}&offset=0`);
}

export async function fetchLatestSwap(): Promise<SwapRow | null> {
  return fetchJson<SwapRow | null>(`${API_URL}/swaps/latest`);
}
