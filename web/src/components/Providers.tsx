"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { monadTestnet } from "@/lib/config";
import { useState, type ReactNode } from "react";

const config = createConfig({
  chains: [monadTestnet],
  connectors: [
    injected({
      shimDisconnect: true,
      unstable_shimAsyncInject: 5_000,
    }),
  ],
  transports: {
    [monadTestnet.id]: http("https://testnet-rpc.monad.xyz"),
  },
  multiInjectedProviderDiscovery: true,
  ssr: true,
});

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={config} reconnectOnMount>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
