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
  "0x90613177f3e09f0B8684a466ff71c9453571aA68") as `0x${string}`;

export const BENCHMARK_ID = BigInt(process.env.NEXT_PUBLIC_BENCHMARK_ID || "1");

export const MIN_STAKE_MON = "0.01";

export const SYSTEM_SECRET =
  process.env.SYSTEM_SECRET || "7F3A9C1E-PROOFBENCH-SECRET";
