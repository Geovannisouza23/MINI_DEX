import { useWalletContext } from "../hooks/WalletProvider";

export default function ConnectWallet() {
  const {
    wallet,
    isConnecting,
    error,
    hasWalletConnect,
    connectMetaMask,
    connectWalletConnect,
    disconnect,
    refreshBalance,
    switchToSepolia,
  } = useWalletContext();

  if (wallet.connected) {
    const needsSepolia = wallet.chainId !== 11155111;
    return (
      <div className="wallet">
        <div>
          <p className="label">Connected</p>
          <p className="mono">{wallet.address}</p>
          <p className="muted">
            {wallet.network} · {wallet.balance} {wallet.nativeSymbol}
          </p>
          <p className="muted">Chain ID: {wallet.chainId ?? "-"}</p>
          <p className="muted">Connector: {wallet.connector}</p>
          {needsSepolia ? (
            <p className="error">Switch to Sepolia to swap and view balances.</p>
          ) : null}
        </div>
        <div className="wallet-actions">
          {needsSepolia ? (
            <button className="button ghost" onClick={switchToSepolia}>
              Switch to Sepolia
            </button>
          ) : null}
          <button className="button ghost" onClick={refreshBalance}>
            Refresh
          </button>
          <button className="button ghost" onClick={() => disconnect()}>
            Disconnect
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="wallet">
      <div className="wallet-actions">
        <button
          className="button primary"
          onClick={connectMetaMask}
          disabled={isConnecting}
        >
          {isConnecting ? "Connecting..." : "MetaMask"}
        </button>
        <button
          className="button ghost"
          onClick={connectWalletConnect}
          disabled={isConnecting || !hasWalletConnect}
        >
          WalletConnect
        </button>
      </div>
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
