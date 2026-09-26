"use client";

import { AD_SLOT_ABI } from "@/lib/abi";
import { CONTRACT_ADDRESS, monadTestnet } from "@/lib/config";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useAccount,
  useConnect,
  useDisconnect,
  usePublicClient,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
} from "wagmi";
import { formatEther, parseEther, type Address, type Hex } from "viem";

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

const DEPLOY_BLOCK = BigInt(65_862_452); // Monad testnet deploy of AdSlotAuction
const LOG_CHUNK = BigInt(100); // public RPC eth_getLogs max range

type PastKing = {
  roundId: string;
  address: Address;
  name: string;
  link: string;
  amount: string;
  blockNumber: bigint;
};

const ZERO = "0x0000000000000000000000000000000000000000";
const KINGS_STORAGE_KEY = `koth-kings-${CONTRACT_ADDRESS.toLowerCase()}`;

function short(addr?: string) {
  if (!addr || addr === ZERO) return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function avatarHue(addr: string) {
  return Number.parseInt(addr.slice(2, 8) || "0", 16) % 360;
}

function readStoredKings(): PastKing[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KINGS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<PastKing & { blockNumber: string }>;
    return parsed.map((k) => ({
      ...k,
      blockNumber: BigInt(k.blockNumber),
    }));
  } catch {
    return [];
  }
}

function writeStoredKings(kings: PastKing[]) {
  if (typeof window === "undefined") return;
  const payload = kings.map((k) => ({
    ...k,
    blockNumber: k.blockNumber.toString(),
  }));
  localStorage.setItem(KINGS_STORAGE_KEY, JSON.stringify(payload));
}

function mergeKings(a: PastKing[], b: PastKing[]) {
  const map = new Map<string, PastKing>();
  for (const k of [...b, ...a]) {
    map.set(k.roundId, k);
  }
  return Array.from(map.values()).sort(
    (x, y) => Number(y.roundId) - Number(x.roundId)
  );
}

export function BillboardApp() {
  const { address, isConnected, chainId } = useAccount();
  const { connectAsync, connectors, isPending: connecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient({ chainId: monadTestnet.id });
  const { writeContractAsync, data: txHash, isPending: writing } =
    useWriteContract();
  const { isLoading: confirming } = useWaitForTransactionReceipt({ hash: txHash });

  const [state, setState] = useState<RoundState | null>(null);
  const [blockNumber, setBlockNumber] = useState<bigint>(BigInt(0));
  const [bidAmount, setBidAmount] = useState("0.1");
  const [throneName, setThroneName] = useState("");
  const [victoryLink, setVictoryLink] = useState("https://");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [hasInjected, setHasInjected] = useState(false);
  const [pastKings, setPastKings] = useState<PastKing[]>([]);
  const [usurpations, setUsurpations] = useState(0);
  const [fx, setFx] = useState<"none" | "crown" | "deposed">("none");
  const [historyError, setHistoryError] = useState<string | null>(null);
  const prevLeader = useRef<string>("");

  useEffect(() => {
    setHasInjected(typeof window !== "undefined" && Boolean(window.ethereum));
    setPastKings(readStoredKings());
  }, []);

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

    // Seed Hall of Kings from current throne title if chain logs lag.
    if (headline && roundId > BigInt(1)) {
      const reignRound = (roundId - BigInt(1)).toString();
      const seed: PastKing = {
        roundId: reignRound,
        address: (pendingWinner !== ZERO
          ? pendingWinner
          : ZERO) as Address,
        name: headline,
        link: link || "",
        amount: "—",
        blockNumber: block,
      };
      // Only use pendingWinner if they set the ad; else keep ZERO and name from headline.
      if (adSetForRound && pendingWinner !== ZERO) {
        seed.address = pendingWinner;
      }
      const merged = mergeKings([seed], readStoredKings());
      setPastKings(merged);
      writeStoredKings(merged);
    }
  }, [publicClient, hasContract]);

  const loadHistory = useCallback(async () => {
    if (!publicClient || !hasContract) return;
    try {
      setHistoryError(null);
      const latest = await publicClient.getBlockNumber();
      // Monad public RPC: eth_getLogs limited to 100-block ranges.
      const start = DEPLOY_BLOCK > latest ? BigInt(0) : DEPLOY_BLOCK;

      const bidEvent = {
        type: "event",
        name: "Bid",
        inputs: [
          { name: "roundId", type: "uint256", indexed: true },
          { name: "bidder", type: "address", indexed: true },
          { name: "amount", type: "uint256", indexed: false },
        ],
      } as const;
      const settledEvent = {
        type: "event",
        name: "Settled",
        inputs: [
          { name: "roundId", type: "uint256", indexed: true },
          { name: "winner", type: "address", indexed: true },
          { name: "amount", type: "uint256", indexed: false },
        ],
      } as const;
      const adEvent = {
        type: "event",
        name: "AdSet",
        inputs: [
          { name: "roundId", type: "uint256", indexed: true },
          { name: "advertiser", type: "address", indexed: true },
          { name: "headline", type: "string", indexed: false },
          { name: "link", type: "string", indexed: false },
        ],
      } as const;

      type LogT = Awaited<ReturnType<typeof publicClient.getLogs>>[number];
      const bidLogs: LogT[] = [];
      const settledLogs: LogT[] = [];
      const adLogs: LogT[] = [];

      for (let from = start; from <= latest; from += LOG_CHUNK) {
        const to = from + LOG_CHUNK - BigInt(1) > latest ? latest : from + LOG_CHUNK - BigInt(1);
        const [b, s, a] = await Promise.all([
          publicClient.getLogs({
            address: CONTRACT_ADDRESS,
            event: bidEvent,
            fromBlock: from,
            toBlock: to,
          }),
          publicClient.getLogs({
            address: CONTRACT_ADDRESS,
            event: settledEvent,
            fromBlock: from,
            toBlock: to,
          }),
          publicClient.getLogs({
            address: CONTRACT_ADDRESS,
            event: adEvent,
            fromBlock: from,
            toBlock: to,
          }),
        ]);
        bidLogs.push(...b);
        settledLogs.push(...s);
        adLogs.push(...a);
      }

      setUsurpations(bidLogs.length);

      const names = new Map<string, { name: string; link: string }>();
      for (const log of adLogs) {
        const args = (log as { args?: {
          roundId?: bigint;
          headline?: string;
          link?: string;
        } }).args;
        if (args?.roundId !== undefined) {
          names.set(args.roundId.toString(), {
            name: args.headline || "Unnamed King",
            link: args.link || "",
          });
        }
      }

      const fromChain: PastKing[] = settledLogs
        .map((log) => {
          const args = (log as { args?: {
            roundId?: bigint;
            winner?: Address;
            amount?: bigint;
          }; blockNumber?: bigint | null }).args;
          const blockNum = (log as { blockNumber?: bigint | null }).blockNumber;
          if (args?.roundId === undefined || !args.winner || args.winner === ZERO) {
            return null;
          }
          const meta = names.get(args.roundId.toString());
          return {
            roundId: args.roundId.toString(),
            address: args.winner,
            name: meta?.name || short(args.winner),
            link: meta?.link || "",
            amount: formatEther(args.amount || BigInt(0)),
            blockNumber: blockNum || BigInt(0),
          };
        })
        .filter(Boolean) as PastKing[];

      const merged = mergeKings(fromChain, readStoredKings()).slice(0, 20);
      setPastKings(merged);
      writeStoredKings(merged);
    } catch (e: unknown) {
      setHistoryError(e instanceof Error ? e.message : "history load failed");
      setPastKings(readStoredKings());
    }
  }, [publicClient, hasContract]);

  useEffect(() => {
    refresh().catch((e) => setError(String(e.message || e)));
    loadHistory().catch(() => {});
    const id = setInterval(() => {
      refresh().catch(() => {});
    }, 2000);
    const hist = setInterval(() => {
      loadHistory().catch(() => {});
    }, 8000);
    return () => {
      clearInterval(id);
      clearInterval(hist);
    };
  }, [refresh, loadHistory]);

  // Crown / deposed FX when leader changes mid-round
  useEffect(() => {
    const leader = state?.highestBidder?.toLowerCase() || "";
    if (!leader || leader === ZERO.toLowerCase()) {
      prevLeader.current = leader;
      return;
    }
    if (prevLeader.current && prevLeader.current !== leader) {
      setFx("deposed");
      const t1 = setTimeout(() => setFx("crown"), 400);
      const t2 = setTimeout(() => setFx("none"), 1600);
      prevLeader.current = leader;
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
    if (!prevLeader.current) {
      setFx("crown");
      const t = setTimeout(() => setFx("none"), 900);
      prevLeader.current = leader;
      return () => clearTimeout(t);
    }
    prevLeader.current = leader;
  }, [state?.highestBidder]);

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

  const youAreKing =
    !!address &&
    !!state &&
    state.highestBidder.toLowerCase() === address.toLowerCase() &&
    state.highestBidder !== ZERO;

  async function ensureNetwork() {
    if (chainId === monadTestnet.id) return;
    try {
      await switchChainAsync({ chainId: monadTestnet.id });
    } catch {
      const ethereum = window.ethereum;
      if (!ethereum?.request) {
        setError("Switch MetaMask to Monad Testnet (chain 10143).");
        throw new Error("wrong network");
      }
      try {
        await ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: "0x279f",
              chainName: "Monad Testnet",
              nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
              rpcUrls: ["https://testnet-rpc.monad.xyz"],
              blockExplorerUrls: ["https://testnet.monadvision.com"],
            },
          ],
        });
      } catch {
        setError("Add Monad Testnet (10143) in MetaMask, then try again.");
        throw new Error("wrong network");
      }
    }
  }

  async function onConnect() {
    setError(null);
    setStatus(null);
    try {
      if (!window.ethereum) {
        setError("No wallet detected. Install MetaMask and refresh.");
        return;
      }
      const connector =
        connectors.find((c) => c.id.toLowerCase().includes("metamask")) ??
        connectors.find((c) => c.type === "injected") ??
        connectors[0];
      if (!connector) {
        setError("No wallet connector available. Install MetaMask.");
        return;
      }
      await connectAsync({ connector, chainId: monadTestnet.id });
      setStatus("You enter the arena");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/rejected|denied/i.test(msg)) setError("Connection rejected in wallet.");
      else setError(msg || "Failed to connect wallet");
    }
  }

  async function onUsurp() {
    setError(null);
    setStatus(null);
    try {
      await ensureNetwork();
      const value = parseEther(bidAmount || "0");
      if (value <= BigInt(0)) throw new Error("Stake must be > 0");
      if (state && value <= state.highestBid) {
        throw new Error("Must stake more than the current king");
      }
      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: AD_SLOT_ABI,
        functionName: "bid",
        value,
        chainId: monadTestnet.id,
      });
      setStatus(`Usurpation sent: ${(hash as Hex).slice(0, 10)}…`);
      await refresh();
      await loadHistory();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function onCrown() {
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
      setStatus(`Crowned: ${(hash as Hex).slice(0, 10)}…`);
      setFx("crown");
      setTimeout(() => setFx("none"), 1200);
      await refresh();
      await loadHistory();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function onClaimThrone() {
    setError(null);
    setStatus(null);
    try {
      await ensureNetwork();
      if (!throneName.trim()) throw new Error("Name your reign");
      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: AD_SLOT_ABI,
        functionName: "setAd",
        args: [throneName.trim(), victoryLink.trim()],
        chainId: monadTestnet.id,
      });
      setStatus(`Throne claimed: ${(hash as Hex).slice(0, 10)}…`);
      setFx("crown");
      setTimeout(() => setFx("none"), 1200);
      if (address && state) {
        const reignRound =
          state.roundId > BigInt(0)
            ? (state.roundId - BigInt(1)).toString()
            : "0";
        const entry: PastKing = {
          roundId: reignRound,
          address: address as Address,
          name: throneName.trim(),
          link: victoryLink.trim(),
          amount: "—",
          blockNumber,
        };
        const merged = mergeKings([entry], readStoredKings());
        setPastKings(merged);
        writeStoredKings(merged);
      }
      await refresh();
      await loadHistory();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const busy = writing || confirming || connecting;
  const progress =
    state && state.roundDurationBlocks > BigInt(0)
      ? Math.min(
          100,
          Math.max(
            0,
            Number(
              ((state.roundDurationBlocks - blocksLeft) * BigInt(100)) /
                state.roundDurationBlocks
            )
          )
        )
      : 0;

  const throneTitle = state?.headline || "Vacant";
  const leaderAddr =
    state?.highestBidder && state.highestBidder !== ZERO
      ? state.highestBidder
      : null;

  return (
    <div className="font-body min-h-screen">
      <header className="border-b border-[var(--line)]">
        <div className="mx-auto flex max-w-5xl items-baseline justify-between gap-6 px-5 py-5 md:px-8">
          <div>
            <p className="font-display text-2xl tracking-[0.04em] text-[var(--fg)] md:text-3xl">
              King of the Hill
            </p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Highest stake sits the throne. Outbid and they fall.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-4 text-sm">
            <span className="hidden font-mono text-xs text-[var(--muted)] sm:inline">
              R{state ? state.roundId.toString() : "—"} ·{" "}
              {roundEnded ? "ended" : `${blocksLeft.toString()} blk`}
            </span>
            {isConnected ? (
              <>
                <span className="hidden font-mono text-xs text-[var(--muted)] md:inline">
                  {short(address)}
                </span>
                <button
                  type="button"
                  onClick={() => disconnect()}
                  className="text-[var(--muted)] underline-offset-4 hover:text-[var(--fg)] hover:underline"
                >
                  Disconnect
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={onConnect}
                className="border border-[var(--gold)] bg-[var(--gold)] px-4 py-2 text-sm font-semibold text-[var(--bg)] disabled:opacity-50"
              >
                {connecting ? "…" : hasInjected ? "Connect" : "Install MetaMask"}
              </button>
            )}
          </div>
        </div>
      </header>

      {!hasInjected && (
        <p className="mx-auto max-w-5xl px-5 pt-4 text-sm text-[var(--danger)] md:px-8">
          No wallet found. Open http://127.0.0.1:3000 with MetaMask installed.
        </p>
      )}

      <main className="mx-auto grid max-w-5xl gap-10 px-5 py-8 md:px-8 lg:grid-cols-[1.4fr_0.9fr]">
        {/* Throne — one visual focus */}
        <section
          className={`anim-rise border border-[var(--line)] bg-[var(--ink)] ${
            fx === "deposed" ? "anim-deposed" : ""
          } ${fx === "crown" ? "anim-crown" : ""}`}
        >
          <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3 text-xs tracking-[0.18em] text-[var(--muted)] uppercase">
            <span>The Throne</span>
            <span className={roundEnded ? "text-[var(--danger)]" : "text-[var(--gold)]"}>
              {roundEnded ? "Crown now" : `${blocksLeft.toString()} blocks`}
            </span>
          </div>

          <div className="relative px-5 py-10 md:px-10 md:py-14">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-[0.07]"
              style={{
                backgroundImage:
                  "radial-gradient(ellipse at 50% 0%, var(--gold), transparent 55%)",
              }}
            />

            <div className="relative text-center">
              <div
                className={`mx-auto mb-8 flex h-16 w-16 items-center justify-center border border-[var(--gold-dim)] bg-[var(--bg)] ${
                  fx === "crown" ? "anim-crown" : ""
                }`}
                style={
                  leaderAddr
                    ? {
                        borderColor: `hsl(${avatarHue(leaderAddr)} 35% 45%)`,
                      }
                    : undefined
                }
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M3 8l3 2 3-5 3 5 3-2 3 5H3l0-5z"
                    stroke="var(--gold)"
                    strokeWidth="1.4"
                    fill="rgba(201,162,39,0.15)"
                  />
                  <path d="M4 18h16" stroke="var(--gold)" strokeWidth="1.4" />
                </svg>
              </div>

              <h1 className="font-display text-4xl leading-[1.05] tracking-wide text-[var(--fg)] md:text-6xl">
                {throneTitle}
              </h1>

              {state?.link ? (
                <a
                  href={
                    state.link.startsWith("http")
                      ? state.link
                      : `https://${state.link}`
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-block text-sm text-[var(--gold)] underline-offset-4 hover:underline"
                >
                  {state.link}
                </a>
              ) : (
                <p className="mt-4 text-sm text-[var(--muted)]">
                  {leaderAddr
                    ? `${short(leaderAddr)} holds the hill`
                    : "No king. Usurp to take the seat."}
                </p>
              )}

              <dl className="mx-auto mt-10 grid max-w-md grid-cols-3 gap-4 border-t border-[var(--line)] pt-6 text-left">
                <div>
                  <dt className="text-[11px] tracking-wide text-[var(--muted)] uppercase">
                    Contender
                  </dt>
                  <dd className="mt-1 font-mono text-sm">
                    {short(leaderAddr || undefined)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] tracking-wide text-[var(--muted)] uppercase">
                    Stake
                  </dt>
                  <dd className="mt-1 font-mono text-sm text-[var(--gold)]">
                    {state ? `${formatEther(state.highestBid)}` : "—"}{" "}
                    <span className="text-[var(--muted)]">MON</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] tracking-wide text-[var(--muted)] uppercase">
                    You
                  </dt>
                  <dd className="mt-1 text-sm">
                    {youAreKing ? "Ruling" : "Challenger"}
                  </dd>
                </div>
              </dl>

              <div className="mt-8 h-px w-full bg-[var(--line)]">
                <div
                  className="h-px bg-[var(--gold)] transition-all duration-500"
                  style={{ width: `${roundEnded ? 100 : progress}%` }}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Controls + history */}
        <div className="anim-rise flex flex-col gap-8" style={{ animationDelay: "80ms" }}>
          <section className="border border-[var(--line)] bg-[var(--ink)] p-5">
            <h2 className="font-display text-lg tracking-wide">Challenge</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Stake more than the king. They are refunded. You take the hill.
            </p>

            <label className="mt-6 block text-xs tracking-wide text-[var(--muted)] uppercase">
              Stake (MON)
              <input
                value={bidAmount}
                onChange={(e) => setBidAmount(e.target.value)}
                className="mt-2 w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 font-mono text-[var(--fg)] outline-none focus:border-[var(--gold)]"
              />
            </label>

            <button
              type="button"
              disabled={!isConnected || busy || !hasContract || roundEnded}
              onClick={onUsurp}
              className="mt-4 w-full border border-[var(--gold)] bg-[var(--gold)] py-3 text-sm font-semibold text-[var(--bg)] disabled:cursor-not-allowed disabled:opacity-35"
            >
              {roundEnded ? "Round over — Crown first" : "Usurp"}
            </button>

            <button
              type="button"
              disabled={!isConnected || busy || !hasContract || !roundEnded}
              onClick={onCrown}
              className="mt-2 w-full border border-[var(--line)] py-3 text-sm font-medium text-[var(--fg)] hover:border-[var(--gold-dim)] disabled:cursor-not-allowed disabled:opacity-35"
            >
              Crown
            </button>

            {isWinner && (
              <div className="mt-5 border-t border-[var(--line)] pt-5">
                <p className="font-display text-sm tracking-wide text-[var(--gold)]">
                  Claim Throne
                </p>
                <input
                  placeholder="Name your reign"
                  value={throneName}
                  onChange={(e) => setThroneName(e.target.value)}
                  className="mt-3 w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 outline-none focus:border-[var(--gold)]"
                />
                <input
                  placeholder="Victory link"
                  value={victoryLink}
                  onChange={(e) => setVictoryLink(e.target.value)}
                  className="mt-2 w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 font-mono text-sm outline-none focus:border-[var(--gold)]"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={onClaimThrone}
                  className="mt-3 w-full bg-[var(--fg)] py-2.5 text-sm font-semibold text-[var(--bg)]"
                >
                  Inscribe
                </button>
              </div>
            )}

            {status && (
              <p className="mt-3 text-sm text-[var(--ok)]">{status}</p>
            )}
            {error && (
              <p className="mt-3 text-sm text-[var(--danger)]">{error}</p>
            )}
          </section>

          <section>
            <div className="flex items-baseline justify-between gap-3 border-b border-[var(--line)] pb-2">
              <h2 className="font-display text-lg tracking-wide">Past reigns</h2>
              <span className="font-mono text-[11px] text-[var(--muted)]">
                {usurpations} usurps
              </span>
            </div>
            {historyError && (
              <p className="mt-2 text-[11px] text-[var(--muted)]">
                Log window limited on RPC — showing saved reigns
              </p>
            )}
            <ul className="mt-3 divide-y divide-[var(--line)]">
              {pastKings.length === 0 && (
                <li className="py-4 text-sm text-[var(--muted)]">
                  No reigns yet.
                </li>
              )}
              {pastKings.map((k, i) => (
                <li
                  key={`${k.roundId}-${k.address}-${i}`}
                  className="flex items-baseline justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-[var(--fg)]">{k.name}</p>
                    <p className="font-mono text-[11px] text-[var(--muted)]">
                      R{k.roundId} · {short(k.address)}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-xs text-[var(--gold-dim)]">
                    {k.amount === "—" ? "" : `${k.amount} MON`}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 font-mono text-[10px] text-[var(--muted)]">
              {hasContract ? short(CONTRACT_ADDRESS) : "—"} · Monad 10143
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
