import { Contract, formatUnits, parseUnits } from "ethers";
import { useEffect, useMemo, useState } from "react";
import { useWalletContext } from "../hooks/WalletProvider";
import { ERC20_ABI, POOL_ABI, POOL_ADDRESS, TOKEN_A, TOKEN_B } from "../web3/constants";

const DIRECTION = {
  A_TO_B: "A_TO_B",
  B_TO_A: "B_TO_A",
} as const;

type Direction = (typeof DIRECTION)[keyof typeof DIRECTION];

function formatAmount(value?: bigint) {
  if (value === undefined) return "0";
  return formatUnits(value, 18);
}

export default function SwapForm() {
  const { wallet, provider, switchToSepolia, disconnect, error } = useWalletContext();

  const [direction, setDirection] = useState<Direction>(DIRECTION.A_TO_B);
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [preview, setPreview] = useState<bigint | undefined>();

  const amountParsed = useMemo(() => {
    if (!amount) return null;
    try {
      return parseUnits(amount, 18);
    } catch {
      return null;
    }
  }, [amount]);

  const tokenIn = direction === DIRECTION.A_TO_B ? TOKEN_A : TOKEN_B;
  const tokenOut = direction === DIRECTION.A_TO_B ? TOKEN_B : TOKEN_A;

  useEffect(() => {
    let active = true;

    const loadPreview = async () => {
      if (!provider || !amountParsed || wallet.chainId !== 11155111) {
        setPreview(undefined);
        return;
      }

      const pool = new Contract(POOL_ADDRESS, POOL_ABI, provider);

      try {
        if (direction === DIRECTION.A_TO_B) {
          const quote = await pool.getPriceAtoB(amountParsed);
          if (!active) return;
          setPreview(quote);
        } else {
          const [reserveA, reserveB] = await pool.getReserves();
          if (!active) return;
          if (reserveB === 0n) {
            setPreview(0n);
            return;
          }
          setPreview((amountParsed * reserveA) / reserveB);
        }
      } catch {
        if (!active) return;
        setPreview(undefined);
      }
    };

    loadPreview();

    return () => {
      active = false;
    };
  }, [provider, amountParsed, direction, wallet.chainId]);

  useEffect(() => {
    if (error) {
      setStatus(error);
    }
  }, [error]);

  const handleSwap = async () => {
    if (!provider) {
      setStatus("Connect your wallet first");
      return;
    }
    if (!wallet.connected || !wallet.address) {
      setStatus("Connect your wallet first");
      return;
    }
    if (wallet.chainId !== 11155111) {
      try {
        setStatus("Switching to Sepolia...");
        await switchToSepolia();
      } catch (err) {
        setStatus(err instanceof Error ? err.message : "Switch to Sepolia to swap");
        return;
      }
    }
    if (!amountParsed) {
      setStatus("Enter a valid amount");
      return;
    }

    try {
      const tokenCode = await provider.getCode(tokenIn);
      if (!tokenCode || tokenCode === "0x") {
        setStatus("Token contract not found on this network");
        return;
      }
      const poolCode = await provider.getCode(POOL_ADDRESS);
      if (!poolCode || poolCode === "0x") {
        setStatus("Pool contract not found on this network");
        return;
      }

      const signer = await provider.getSigner();
      const tokenContract = new Contract(tokenIn, ERC20_ABI, signer);
      const poolContract = new Contract(POOL_ADDRESS, POOL_ABI, signer);

      const currentAllowance = await tokenContract.allowance(wallet.address, POOL_ADDRESS);

      setStatus("Approving token...");
      if (currentAllowance < amountParsed) {
        const approveTx = await tokenContract.approve(POOL_ADDRESS, amountParsed);
        await approveTx.wait();
      }

      setStatus("Submitting swap...");
      const swapTx = await poolContract[
        direction === DIRECTION.A_TO_B ? "swapAforB" : "swapBforA"
      ](amountParsed);
      await swapTx.wait();
      setStatus("Swap confirmed");
      setAmount("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Swap failed";
      if (/missing or invalid session|request expired/i.test(message)) {
        await disconnect();
        setStatus("WalletConnect session expired. Reconnect your wallet and try again.");
        return;
      }
      if (/user rejected/i.test(message)) {
        setStatus("Transaction rejected in wallet");
        return;
      }
      setStatus(message);
    }
  };

  return (
    <div className="swap">
      <div className="swap-header">
        <div>
          <h2>Swap</h2>
          <p className="muted">Approve + execute swap on Sepolia.</p>
        </div>
        <div className="swap-toggle">
          <button
            className={direction === DIRECTION.A_TO_B ? "active" : ""}
            onClick={() => setDirection(DIRECTION.A_TO_B)}
          >
            ROB → RUB
          </button>
          <button
            className={direction === DIRECTION.B_TO_A ? "active" : ""}
            onClick={() => setDirection(DIRECTION.B_TO_A)}
          >
            RUB → ROB
          </button>
        </div>
      </div>

      <div className="swap-body">
        <label className="label">Amount</label>
        <input
          className="input"
          placeholder="0.0"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
        <div className="preview">
          <span className="label">Estimated output</span>
          <span>{formatAmount(preview)}</span>
        </div>
        <div className="preview">
          <span className="label">Token in</span>
          <span className="mono">{tokenIn}</span>
        </div>
        <div className="preview">
          <span className="label">Token out</span>
          <span className="mono">{tokenOut}</span>
        </div>
      </div>

      <button className="button primary" onClick={handleSwap}>
        Execute swap
      </button>
      {status ? <p className="status-text">{status}</p> : null}
    </div>
  );
}
