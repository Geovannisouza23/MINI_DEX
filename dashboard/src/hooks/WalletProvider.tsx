import { createContext, useContext } from "react";
import useWallet from "./useWallet";

type WalletContextValue = ReturnType<typeof useWallet>;

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const wallet = useWallet();
  return <WalletContext.Provider value={wallet}>{children}</WalletContext.Provider>;
}

export function useWalletContext() {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error("WalletProvider missing in component tree");
  }
  return ctx;
}
