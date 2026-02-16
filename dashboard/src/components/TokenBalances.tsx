import { Contract, formatUnits } from "ethers";
import { useEffect, useState } from "react";
import { useWalletContext } from "../hooks/WalletProvider";
import { ERC20_ABI, TOKEN_A, TOKEN_B } from "../web3/constants";

function BalanceRow({
  label,
  balance,
  decimals,
}: {
  label: string;
  balance?: bigint;
  decimals?: number;
}) {
  return (
    <div>
      <p className="label">{label}</p>
      <p className="stat">
        {balance ? formatUnits(balance, decimals ?? 18) : "0"}
      </p>
    </div>
  );
}

export default function TokenBalances() {
  const { wallet, provider } = useWalletContext();
  const [tokenABalance, setTokenABalance] = useState<bigint | undefined>();
  const [tokenBBalance, setTokenBBalance] = useState<bigint | undefined>();
  const [tokenADecimals, setTokenADecimals] = useState<number | undefined>();
  const [tokenBDecimals, setTokenBDecimals] = useState<number | undefined>();
  const [balanceError, setBalanceError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;

    const loadBalances = async () => {
      if (!provider || !wallet.address || wallet.chainId !== 11155111) {
        setTokenABalance(undefined);
        setTokenBBalance(undefined);
        setTokenADecimals(undefined);
        setTokenBDecimals(undefined);
        setBalanceError(null);
        return;
      }

      const tokenA = new Contract(TOKEN_A, ERC20_ABI, provider);
      const tokenB = new Contract(TOKEN_B, ERC20_ABI, provider);

      try {
        const [a, b, decA, decB] = await Promise.all([
          tokenA.balanceOf(wallet.address),
          tokenB.balanceOf(wallet.address),
          tokenA.decimals(),
          tokenB.decimals(),
        ]);
        if (!active) return;
        setTokenABalance(a);
        setTokenBBalance(b);
        setTokenADecimals(Number(decA));
        setTokenBDecimals(Number(decB));
        setBalanceError(null);
      } catch {
        if (!active) return;
        setBalanceError("Failed to refresh balances");
      }
    };

    loadBalances();
    timer = window.setInterval(loadBalances, 10000);

    return () => {
      active = false;
      if (timer) {
        window.clearInterval(timer);
      }
    };
  }, [provider, wallet.address, wallet.chainId]);

  if (!wallet.connected) {
    return <p className="muted">Connect wallet to see balances.</p>;
  }

  if (wallet.chainId !== 11155111) {
    return <p className="muted">Switch to Sepolia to load token balances.</p>;
  }

  return (
    <div className="stats">
      <BalanceRow label="ROB balance" balance={tokenABalance} decimals={tokenADecimals} />
      <BalanceRow label="RUB balance" balance={tokenBBalance} decimals={tokenBDecimals} />
      {balanceError ? <p className="error">{balanceError}</p> : null}
    </div>
  );
}
