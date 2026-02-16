const toAddress = (value: string) => value as `0x${string}`;

export const POOL_ADDRESS = toAddress(
  import.meta.env.VITE_POOL_ADDRESS || "0x0000000000000000000000000000000000000000"
);

export const TOKEN_A = toAddress(
  import.meta.env.VITE_TOKEN_A || "0x0000000000000000000000000000000000000000"
);

export const TOKEN_B = toAddress(
  import.meta.env.VITE_TOKEN_B || "0x0000000000000000000000000000000000000000"
);

export const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "amount", type: "uint256" }],
  },
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "success", type: "bool" }],
  },
  {
    name: "symbol",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "symbol", type: "string" }],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "decimals", type: "uint8" }],
  },
] as const;

export const POOL_ABI = [
  {
    name: "swapAforB",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "amountA", type: "uint256" }],
    outputs: [],
  },
  {
    name: "swapBforA",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "amountB", type: "uint256" }],
    outputs: [],
  },
  {
    name: "getPriceAtoB",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "amountA", type: "uint256" }],
    outputs: [{ name: "amountB", type: "uint256" }],
  },
  {
    name: "getReserves",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "reserveA", type: "uint256" },
      { name: "reserveB", type: "uint256" },
    ],
  },
] as const;
