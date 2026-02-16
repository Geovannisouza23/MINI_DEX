/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_POOL_ADDRESS?: string;
  readonly VITE_TOKEN_A?: string;
  readonly VITE_TOKEN_B?: string;
  readonly VITE_WALLETCONNECT_PROJECT_ID?: string;
  readonly VITE_RPC_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  interface Window {
    ethereum?: import("ethers").Eip1193Provider & {
      on?: (event: string, handler: (...args: any[]) => void) => void;
      removeAllListeners?: (event?: string) => void;
    };
  }
}

export {};
