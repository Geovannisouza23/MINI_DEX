import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserProvider, type Eip1193Provider } from "ethers";
import { EthereumProvider } from "@walletconnect/ethereum-provider";
import { formatBalance, getBalance, getNetworkInfo } from "../services/web3";

const WALLETCONNECT_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;
const RPC_URL = import.meta.env.VITE_RPC_URL || "https://rpc.sepolia.org";
const SEPOLIA_CHAIN_ID = "0xaa36a7";
const SEPOLIA_ID = 11155111;
const CONNECTOR_KEY = "mini_dex_connector";
type WalletConnectProvider = InstanceType<typeof EthereumProvider>;

let wcInitPromise: Promise<WalletConnectProvider> | null = null;
let reconnecting = false;

const isWalletConnectSessionError = (message: string) =>
  /missing or invalid session|request expired/i.test(message);

const clearWalletConnectStorage = () => {
  Object.keys(localStorage).forEach((key) => {
    if (key.startsWith("wc@") || key.toLowerCase().includes("walletconnect")) {
      localStorage.removeItem(key);
    }
  });
  localStorage.removeItem(CONNECTOR_KEY);
};

const initialState = {
  connected: false,
  address: "",
  chainId: null as number | null,
  network: "Unknown",
  balance: "0.0000",
  nativeSymbol: "ETH",
  connector: "None",
};

const buildWalletConnectProvider = async () => {
  if (!WALLETCONNECT_PROJECT_ID) {
    throw new Error("WalletConnect Project ID not configured");
  }

  if (!wcInitPromise) {
    wcInitPromise = EthereumProvider.init({
    projectId: WALLETCONNECT_PROJECT_ID,
    chains: [SEPOLIA_ID],
    rpcMap: {
      [SEPOLIA_ID]: RPC_URL,
    },
    showQrModal: true,
    methods: ["eth_requestAccounts", "eth_sendTransaction", "personal_sign"],
    events: ["accountsChanged", "chainChanged", "disconnect"],
    metadata: {
      name: "Mini DEX Pulse",
      description: "Simple on-chain swap dashboard",
      url: window.location.origin,
      icons: [],
    },
    });
  }

  return wcInitPromise;
};

const useWallet = () => {
  const [wallet, setWallet] = useState(initialState);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState("");
  const providerRef = useRef<BrowserProvider | null>(null);
  const eipProviderRef = useRef<Eip1193Provider | null>(null);
  const connectorRef = useRef("");
  const wcProviderRef = useRef<WalletConnectProvider | null>(null);

  const updateWalletState = useCallback(async (provider: BrowserProvider, addressOverride?: string) => {
    const signer = await provider.getSigner();
    const address = addressOverride ?? (await signer.getAddress());
    const network = await provider.getNetwork();
    const chainId = Number(network.chainId);
    const balanceRaw = await getBalance(provider, address);
    const networkInfo = getNetworkInfo(chainId);

    setWallet({
      connected: true,
      address,
      chainId,
      network: networkInfo.name,
      balance: formatBalance(balanceRaw),
      nativeSymbol: networkInfo.symbol,
      connector: connectorRef.current || "Wallet",
    });
  }, []);

  const refreshProvider = useCallback(
    async (source?: Eip1193Provider, addressOverride?: string) => {
      const providerSource = source ?? eipProviderRef.current;
      if (!providerSource) {
        return;
      }
      const nextProvider = new BrowserProvider(providerSource);
      providerRef.current = nextProvider;
      eipProviderRef.current = providerSource;
      await updateWalletState(nextProvider, addressOverride);
    },
    [updateWalletState],
  );

  const disconnect = useCallback(async () => {
    if (wcProviderRef.current?.disconnect) {
      await wcProviderRef.current.disconnect();
    }

    if (window.ethereum?.removeAllListeners) {
      window.ethereum.removeAllListeners("accountsChanged");
      window.ethereum.removeAllListeners("chainChanged");
      window.ethereum.removeAllListeners("disconnect");
    }

    const eipProvider = eipProviderRef.current as
      | (Eip1193Provider & { removeAllListeners?: () => void })
      | null;
    if (eipProvider?.removeAllListeners) {
      eipProvider.removeAllListeners();
    }

    providerRef.current = null;
    eipProviderRef.current = null;
    connectorRef.current = "";
    wcProviderRef.current = null;
    if (connectorRef.current === "WalletConnect" || wcProviderRef.current) {
      clearWalletConnectStorage();
    } else {
      localStorage.removeItem(CONNECTOR_KEY);
    }
    setWallet(initialState);
    setError("");
  }, []);

  const connectMetaMask = useCallback(async () => {
    setIsConnecting(true);
    setError("");

    try {
      const ethereum = window.ethereum;
      if (!ethereum) {
        throw new Error("MetaMask not found");
      }

      const provider = new BrowserProvider(ethereum as Eip1193Provider);
      await provider.send("eth_requestAccounts", []);
      connectorRef.current = "MetaMask";
      providerRef.current = provider;
      eipProviderRef.current = ethereum as Eip1193Provider;
      wcProviderRef.current = null;
      localStorage.setItem(CONNECTOR_KEY, "metamask");
      await updateWalletState(provider);

      ethereum.on?.("accountsChanged", (accounts: string[]) => {
        if (!accounts.length) {
          disconnect();
          return;
        }
        refreshProvider(ethereum as Eip1193Provider, accounts[0]);
      });

      ethereum.on?.("chainChanged", () => {
        refreshProvider(ethereum as Eip1193Provider);
      });

      ethereum.on?.("disconnect", () => {
        disconnect();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect MetaMask");
      await disconnect();
    } finally {
      setIsConnecting(false);
    }
  }, [disconnect, updateWalletState]);

  const connectWalletConnect = useCallback(async () => {
    setIsConnecting(true);
    setError("");

    try {
      const wcProvider = await buildWalletConnectProvider();
      await wcProvider.connect();

      const provider = new BrowserProvider(wcProvider as unknown as Eip1193Provider);
      connectorRef.current = "WalletConnect";
      providerRef.current = provider;
      eipProviderRef.current = wcProvider as unknown as Eip1193Provider;
      wcProviderRef.current = wcProvider;
      localStorage.setItem(CONNECTOR_KEY, "walletconnect");
      await updateWalletState(provider);

      const network = await provider.getNetwork();
      if (Number(network.chainId) !== SEPOLIA_ID) {
        try {
          await switchToSepolia();
        } catch (switchErr) {
          setError(switchErr instanceof Error ? switchErr.message : "Switch to Sepolia to continue");
        }
        const afterSwitch = await provider.getNetwork();
        if (Number(afterSwitch.chainId) !== SEPOLIA_ID) {
          setError("WalletConnect is on mainnet. Switch to Sepolia to continue.");
        }
      }

      wcProvider.on("accountsChanged", (accounts: string[]) => {
        if (!accounts.length) {
          disconnect();
          return;
        }
        refreshProvider(wcProvider as unknown as Eip1193Provider, accounts[0]);
      });

      wcProvider.on("chainChanged", () => {
        refreshProvider(wcProvider as unknown as Eip1193Provider);
      });

      wcProvider.on("disconnect", () => {
        disconnect();
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to connect WalletConnect";
      if (isWalletConnectSessionError(message)) {
        clearWalletConnectStorage();
        wcInitPromise = null;
      }
      setError(message);
      await disconnect();
    } finally {
      setIsConnecting(false);
    }
  }, [disconnect, updateWalletState]);

  const refreshBalance = useCallback(async () => {
    if (!providerRef.current || !wallet.address) {
      return;
    }

    try {
      const balanceRaw = await getBalance(providerRef.current, wallet.address);
      setWallet((prev) => ({
        ...prev,
        balance: formatBalance(balanceRaw),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh balance");
    }
  }, [wallet.address]);

  const switchToSepolia = useCallback(async () => {
    if (!eipProviderRef.current?.request) {
      throw new Error("Wallet does not support chain switching");
    }

    try {
      await eipProviderRef.current.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: SEPOLIA_CHAIN_ID }],
      });
    } catch (err) {
      const error = err as { code?: number };
      if (error.code !== 4902) {
        throw err;
      }

      await eipProviderRef.current.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: SEPOLIA_CHAIN_ID,
            chainName: "Sepolia",
            nativeCurrency: {
              name: "Sepolia ETH",
              symbol: "ETH",
              decimals: 18,
            },
            rpcUrls: [RPC_URL],
            blockExplorerUrls: ["https://sepolia.etherscan.io"],
          },
        ],
      });
    }
    await refreshProvider(eipProviderRef.current as Eip1193Provider);
  }, [refreshProvider]);

  useEffect(() => {
    let active = true;

    const reconnect = async () => {
      if (reconnecting) return;
      const last = localStorage.getItem(CONNECTOR_KEY);
      if (!last || isConnecting) return;

      reconnecting = true;

      try {
        if (last === "walletconnect") {
          const wcProvider = await buildWalletConnectProvider();
          if (!wcProvider.session) {
            clearWalletConnectStorage();
            wcInitPromise = null;
            return;
          }
          const provider = new BrowserProvider(wcProvider as unknown as Eip1193Provider);
          connectorRef.current = "WalletConnect";
          providerRef.current = provider;
          eipProviderRef.current = wcProvider as unknown as Eip1193Provider;
          wcProviderRef.current = wcProvider;
          await updateWalletState(provider);
        } else if (last === "metamask" && window.ethereum) {
          const provider = new BrowserProvider(window.ethereum as Eip1193Provider);
          connectorRef.current = "MetaMask";
          providerRef.current = provider;
          eipProviderRef.current = window.ethereum as Eip1193Provider;
          wcProviderRef.current = null;
          await updateWalletState(provider);
        }
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to restore session");
      } finally {
        reconnecting = false;
      }
    };

    reconnect();

    return () => {
      active = false;
    };
  }, [isConnecting, updateWalletState]);

  const hasWalletConnect = Boolean(WALLETCONNECT_PROJECT_ID);

  return {
    wallet,
    isConnecting,
    error,
    hasWalletConnect,
    connectMetaMask,
    connectWalletConnect,
    disconnect,
    refreshBalance,
    switchToSepolia,
    provider: providerRef.current,
  };
};

export default useWallet;
