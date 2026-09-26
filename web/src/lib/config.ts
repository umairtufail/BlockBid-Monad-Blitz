import { defineChain } from "viem";

export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://testnet-rpc.monad.xyz"] },
  },
  blockExplorers: {
    default: { name: "MonadVision", url: "https://testnet.monadvision.com" },
  },
  testnet: true,
});

export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ||
  "0xc8D488532E4cE1540F5Fc23E5e6bC52bb2EaA5CF") as `0x${string}`;

export const ROUND_HINT_BLOCKS = Number(
  process.env.NEXT_PUBLIC_ROUND_BLOCKS || "30"
);
