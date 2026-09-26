"use client";

import { AD_SLOT_ABI } from "@/lib/abi";
import { CONTRACT_ADDRESS, monadTestnet } from "@/lib/config";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useConnect,
  useDisconnect,
  usePublicClient,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
} from "wagmi";
import { formatEther, parseEther, type Address } from "viem";

type RoundState = {
  roundId: bigint;
  highestBidder: Address;
  highestBid: bigint;
  endBlock: bigint;
  headline: string;
  link: string;
  pendingWinner: Address;
  adSetForRound: boolean;
  roundDurationBlocks: bigint;
};

function short(addr?: string) {
  if (!addr || addr === "0x0000000000000000000000000000000000000000") return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function BillboardApp() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending: connecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const publicClient = usePublicClient({ chainId: monadTestnet.id });
  const { writeContractAsync, data: txHash, isPending: writing } =
    useWriteContract();
  const { isLoading: confirming } = useWaitForTransactionReceipt({ hash: txHash });

  const [state, setState] = useState<RoundState | null>(null);
  const [blockNumber, setBlockNumber] = useState<bigint>(BigInt(0));
  const [bidAmount, setBidAmount] = useState("0.1");
  const [adHeadline, setAdHeadline] = useState("");
  const [adLink, setAdLink] = useState("https://");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const hasContract = Boolean(CONTRACT_ADDRESS && CONTRACT_ADDRESS.startsWith("0x"));

  const refresh = useCallback(async () => {
    if (!publicClient || !hasContract) return;
    const [current, block] = await Promise.all([
      publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: AD_SLOT_ABI,
        functionName: "current",
      }),
      publicClient.getBlockNumber(),
    ]);
    const [
      roundId,
      highestBidder,
      highestBid,
      endBlock,
      headline,
      link,
      pendingWinner,
      adSetForRound,
      roundDurationBlocks,
    ] = current;
    setState({
      roundId,
      highestBidder,
      highestBid,
      endBlock,
      headline,
      link,
      pendingWinner,
      adSetForRound,
      roundDurationBlocks,
    });
    setBlockNumber(block);
  }, [publicClient, hasContract]);

  useEffect(() => {
    refresh().catch((e) => setError(String(e.message || e)));
    const id = setInterval(() => {
      refresh().catch(() => {});
    }, 2000);
    return () => clearInterval(id);
  }, [refresh]);

  const blocksLeft = useMemo(() => {
    if (!state) return BigInt(0);
    if (blockNumber >= state.endBlock) return BigInt(0);
    return state.endBlock - blockNumber;
  }, [state, blockNumber]);

  const roundEnded = state ? blockNumber > state.endBlock : false;
  const isWinner =
    !!address &&
    !!state &&
    state.pendingWinner.toLowerCase() === address.toLowerCase() &&
    !state.adSetForRound;

  async function ensureNetwork() {
    if (chainId !== monadTestnet.id) {
      await switchChainAsyncSafe();
    }
  }

  async function switchChainAsyncSafe() {
    try {
      await switchChain({ chainId: monadTestnet.id });
    } catch {
      setError("Switch MetaMask to Monad Testnet (chain 10143).");
      throw new Error("wrong network");
    }
  }

  async function onBid() {
    setError(null);
    setStatus(null);
    try {
      await ensureNetwork();
      const value = parseEther(bidAmount || "0");
      if (value <= BigInt(0)) throw new Error("Bid must be > 0");
      if (state && value <= state.highestBid) {
        throw new Error("Bid must beat the current highest bid");
      }
      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: AD_SLOT_ABI,
        functionName: "bid",
        value,
        chainId: monadTestnet.id,
      });
      setStatus(`Bid sent: ${hash.slice(0, 10)}…`);
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function onSettle() {
    setError(null);
    setStatus(null);
    try {
      await ensureNetwork();
      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: AD_SLOT_ABI,
        functionName: "settle",
        chainId: monadTestnet.id,
      });
      setStatus(`Settled: ${hash.slice(0, 10)}…`);
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function onSetAd() {
    setError(null);
    setStatus(null);
    try {
      await ensureNetwork();
      if (!adHeadline.trim()) throw new Error("Headline required");
      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: AD_SLOT_ABI,
        functionName: "setAd",
        args: [adHeadline.trim(), adLink.trim()],
        chainId: monadTestnet.id,
      });
      setStatus(`Ad live: ${hash.slice(0, 10)}…`);
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const busy = writing || confirming || connecting;

  return (
    <div className="min-h-screen px-4 py-8 md:px-10 md:py-12">
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-[family-name:var(--font-display)] text-sm tracking-[0.2em] text-[var(--accent)]">
            BLOCKBID
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-3xl tracking-tight md:text-4xl">
            Live Ad Slot Auction
          </h1>
          <p className="mt-1 max-w-xl text-sm text-[var(--muted)]">
            Highest bidder owns the billboard this round. Attention, priced in
            real time on Monad.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isConnected ? (
            <>
              <span className="rounded-full border border-white/15 px-3 py-1 font-mono text-xs">
                {short(address)}
              </span>
              <button
                type="button"
                onClick={() => disconnect()}
                className="rounded-full border border-white/20 px-4 py-2 text-sm hover:bg-white/5"
              >
                Disconnect
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => connect({ connector: connectors[0] })}
              className="rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-black hover:brightness-110"
            >
              Connect wallet
            </button>
          )}
        </div>
      </header>

      {!hasContract && (
        <div className="mx-auto mt-6 max-w-6xl rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Set <code className="font-mono">NEXT_PUBLIC_CONTRACT_ADDRESS</code> in{" "}
          <code className="font-mono">web/.env.local</code> after deploying with{" "}
          <code className="font-mono">scripts/deploy-testnet.sh</code>.
        </div>
      )}

      <main className="mx-auto mt-8 grid max-w-6xl gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="billboard relative overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(145deg,#12100c_0%,#1c1812_45%,#0c0b09_100%)] p-8 md:p-12 shadow-[0_0_80px_rgba(232,168,56,0.08)]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(232,168,56,0.12),transparent_55%)]" />
          <p className="relative text-xs uppercase tracking-[0.25em] text-[var(--muted)]">
            Onchain billboard
          </p>
          <h2 className="relative mt-4 font-[family-name:var(--font-display)] text-4xl leading-[1.05] md:text-6xl">
            {state?.headline ? state.headline : "SLOT OPEN — BID TO OWN THE NEXT AD"}
          </h2>
          {state?.link ? (
            <a
              href={state.link.startsWith("http") ? state.link : `https://${state.link}`}
              target="_blank"
              rel="noreferrer"
              className="relative mt-6 inline-block text-lg text-[var(--accent)] underline-offset-4 hover:underline"
            >
              {state.link}
            </a>
          ) : (
            <p className="relative mt-6 text-[var(--muted)]">
              Winner sets headline + link after settle.
            </p>
          )}
          <div className="relative mt-10 flex flex-wrap gap-6 font-mono text-xs text-[var(--muted)]">
            <span>Round #{state ? state.roundId.toString() : "—"}</span>
            <span>
              Blocks left: {roundEnded ? "0 (settle)" : blocksLeft.toString()}
            </span>
            <span>Block: {blockNumber.toString()}</span>
          </div>
        </section>

        <section className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
              Auction
            </p>
            <p className="mt-2 font-[family-name:var(--font-display)] text-4xl">
              {state ? `${formatEther(state.highestBid)} MON` : "—"}
            </p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Leader {short(state?.highestBidder)}
            </p>
            {state?.pendingWinner &&
              state.pendingWinner !==
                "0x0000000000000000000000000000000000000000" && (
                <p className="mt-1 text-sm text-[var(--accent)]">
                  Pending winner {short(state.pendingWinner)}
                  {state.adSetForRound ? " (ad set)" : " (can set ad)"}
                </p>
              )}
          </div>

          <label className="block text-sm">
            Bid amount (MON)
            <input
              value={bidAmount}
              onChange={(e) => setBidAmount(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 font-mono outline-none focus:border-[var(--accent)]"
            />
          </label>

          <button
            type="button"
            disabled={!isConnected || busy || !hasContract || roundEnded}
            onClick={onBid}
            className="rounded-xl bg-[var(--accent)] py-3 font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40"
          >
            {roundEnded ? "Round ended — settle first" : "Place bid"}
          </button>

          <button
            type="button"
            disabled={!isConnected || busy || !hasContract || !roundEnded}
            onClick={onSettle}
            className="rounded-xl border border-white/20 py-3 font-semibold disabled:cursor-not-allowed disabled:opacity-40"
          >
            Settle round
          </button>

          {isWinner && (
            <div className="mt-2 space-y-2 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 p-4">
              <p className="text-sm font-semibold text-[var(--accent)]">
                You won — set the ad
              </p>
              <input
                placeholder="Headline"
                value={adHeadline}
                onChange={(e) => setAdHeadline(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 outline-none"
              />
              <input
                placeholder="https://…"
                value={adLink}
                onChange={(e) => setAdLink(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 font-mono text-sm outline-none"
              />
              <button
                type="button"
                disabled={busy}
                onClick={onSetAd}
                className="w-full rounded-lg bg-white py-2 font-semibold text-black"
              >
                Publish ad
              </button>
            </div>
          )}

          {status && <p className="text-sm text-emerald-300">{status}</p>}
          {error && <p className="text-sm text-red-300">{error}</p>}

          <p className="mt-auto pt-4 text-xs text-[var(--muted)]">
            Contract{" "}
            <span className="font-mono">
              {hasContract ? short(CONTRACT_ADDRESS) : "not set"}
            </span>
            · Monad Testnet 10143
          </p>
        </section>
      </main>
    </div>
  );
}
