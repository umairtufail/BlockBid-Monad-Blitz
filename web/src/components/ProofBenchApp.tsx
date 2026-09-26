"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useSwitchChain,
  useWriteContract,
  useWaitForTransactionReceipt,
  usePublicClient,
} from "wagmi";
import { parseEther, type Hex } from "viem";
import { PROOFBENCH_ABI } from "@/lib/abi";
import {
  BENCHMARK_ID,
  CONTRACT_ADDRESS,
  MIN_STAKE_MON,
  monadTestnet,
} from "@/lib/config";

type VerifierVote = { id: number; vote: string };

type AttackRecord = {
  localId: string;
  onchainId?: string;
  target: string;
  category: string;
  breached: boolean;
  attacker: string;
  stake: string;
  verifiers: VerifierVote[];
  rewardMon: string;
  reputation: number;
  attackHash?: Hex;
  resultHash?: Hex;
  agentOutput?: string;
  toolOutput?: string;
  verifierNotes?: string;
  submitTx?: Hex;
  reportTx?: Hex;
  status: "running" | "ready" | "submitted" | "finalized" | "error";
  error?: string;
};

const SEED_FEED: AttackRecord[] = [
  {
    localId: "seed-1",
    onchainId: "1840",
    target: "ResearchAgent v1.3",
    category: "Direct injection",
    breached: false,
    attacker: "0x81a2…29f1",
    stake: "0.01",
    verifiers: [
      { id: 1, vote: "PASS" },
      { id: 2, vote: "PASS" },
    ],
    rewardMon: "0",
    reputation: 0,
    status: "finalized",
  },
  {
    localId: "seed-2",
    onchainId: "1841",
    target: "ResearchAgent v1.3",
    category: "Secret extraction",
    breached: true,
    attacker: "0x42c9…91a0",
    stake: "0.01",
    verifiers: [
      { id: 1, vote: "VALID" },
      { id: 2, vote: "VALID" },
    ],
    rewardMon: "0.08",
    reputation: 12,
    status: "finalized",
  },
];

function shortAddr(a?: string) {
  if (!a) return "—";
  if (a.includes("…")) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function ProofBenchApp() {
  const { address, isConnected, chainId } = useAccount();
  const { connectAsync, connectors, isPending: connecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient({ chainId: monadTestnet.id });
  const { writeContractAsync } = useWriteContract();

  const [hasInjected, setHasInjected] = useState(false);
  const [feed, setFeed] = useState<AttackRecord[]>(SEED_FEED);
  const [selectedId, setSelectedId] = useState<string>(SEED_FEED[1].localId);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingTx, setPendingTx] = useState<Hex | undefined>();

  const { isLoading: txPending, isSuccess: txSuccess } =
    useWaitForTransactionReceipt({ hash: pendingTx });

  useEffect(() => {
    setHasInjected(typeof window !== "undefined" && Boolean(window.ethereum));
  }, []);

  const selected = useMemo(
    () => feed.find((a) => a.localId === selectedId) || feed[0],
    [feed, selectedId]
  );

  const updateRecord = useCallback((localId: string, patch: Partial<AttackRecord>) => {
    setFeed((prev) => prev.map((a) => (a.localId === localId ? { ...a, ...patch } : a)));
  }, []);

  async function ensureNetwork() {
    if (chainId === monadTestnet.id) return;
    try {
      await switchChainAsync({ chainId: monadTestnet.id });
    } catch {
      const ethereum = window.ethereum;
      if (!ethereum?.request) throw new Error("Switch MetaMask to Monad Testnet (10143)");
      try {
        await ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x279f" }],
        });
      } catch {
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
      }
    }
  }

  async function connectWallet() {
    setError(null);
    try {
      const injected = connectors.find((c) => c.id === "injected") || connectors[0];
      if (!injected) throw new Error("No wallet connector");
      await connectAsync({ connector: injected });
      await ensureNetwork();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connect failed");
    }
  }

  async function runDemo(preset: "defend" | "breach") {
    setError(null);
    setBusy(preset);
    const localId = `live-${Date.now()}`;
    const placeholder: AttackRecord = {
      localId,
      target: "ResearchAgent v1.3",
      category: preset === "defend" ? "Indirect injection" : "Tool manipulation",
      breached: false,
      attacker: address ? shortAddr(address) : "local",
      stake: MIN_STAKE_MON,
      verifiers: [],
      rewardMon: "0",
      reputation: 0,
      status: "running",
    };
    setFeed((prev) => [placeholder, ...prev]);
    setSelectedId(localId);

    try {
      const res = await fetch("/api/attack/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preset }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Attack run failed");

      const record: AttackRecord = {
        localId,
        target: data.target,
        category: data.category,
        breached: data.breached,
        attacker: address ? shortAddr(address) : "local",
        stake: MIN_STAKE_MON,
        verifiers: data.verifiers,
        rewardMon: data.breached ? "0.08" : "0",
        reputation: data.breached ? 12 : 0,
        attackHash: data.attackHash,
        resultHash: data.resultHash,
        agentOutput: data.agentOutput,
        toolOutput: data.toolOutput,
        verifierNotes: data.verifierNotes,
        status: "ready",
      };
      updateRecord(localId, record);
    } catch (e) {
      updateRecord(localId, {
        status: "error",
        error: e instanceof Error ? e.message : "failed",
      });
      setError(e instanceof Error ? e.message : "Attack failed");
    } finally {
      setBusy(null);
    }
  }

  async function submitOnchain() {
    if (!selected?.attackHash || !isConnected || !address) {
      setError("Connect wallet and run an attack first");
      return;
    }
    setError(null);
    setBusy("submit");
    try {
      await ensureNetwork();
      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: PROOFBENCH_ABI,
        functionName: "submitAttack",
        args: [BENCHMARK_ID, selected.attackHash],
        value: parseEther(MIN_STAKE_MON),
        chainId: monadTestnet.id,
      });
      setPendingTx(hash);
      updateRecord(selected.localId, { submitTx: hash, status: "submitted" });

      // Resolve attackId from nextAttackId - 1 after confirmation
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash });
        const nextId = await publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: PROOFBENCH_ABI,
          functionName: "nextAttackId",
        });
        const onchainId = (nextId - 1n).toString();
        updateRecord(selected.localId, { onchainId });

        // Reporter finalizes
        setBusy("report");
        const reportRes = await fetch("/api/attack/report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            attackId: onchainId,
            breached: selected.breached,
            resultHash: selected.resultHash,
          }),
        });
        const reportData = await reportRes.json();
        if (!reportRes.ok) throw new Error(reportData.error || "Report failed");
        updateRecord(selected.localId, {
          reportTx: reportData.txHash,
          status: "finalized",
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setBusy(null);
    }
  }

  async function claimReward() {
    if (!selected?.onchainId || !isConnected) return;
    setBusy("claim");
    setError(null);
    try {
      await ensureNetwork();
      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: PROOFBENCH_ABI,
        functionName: "claimReward",
        args: [BigInt(selected.onchainId)],
        chainId: monadTestnet.id,
      });
      setPendingTx(hash);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Claim failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--line)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-4 px-5 py-6 md:px-8">
          <div>
            <p className="text-2xl font-semibold tracking-tight md:text-3xl">ProofBench</p>
            <p className="mt-1 max-w-xl text-sm text-[var(--muted)]">
              AI models don&apos;t just get tested. They defend their reputation.
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <a
              className="font-mono text-xs text-[var(--muted)] hover:text-[var(--fg)]"
              href={`https://testnet.monadvision.com/address/${CONTRACT_ADDRESS}`}
              target="_blank"
              rel="noreferrer"
            >
              {shortAddr(CONTRACT_ADDRESS)}
            </a>
            {isConnected ? (
              <>
                <span className="font-mono text-xs text-[var(--accent)]">
                  {shortAddr(address)}
                </span>
                <button
                  type="button"
                  onClick={() => disconnect()}
                  className="border border-[var(--line)] px-3 py-2 hover:border-[var(--muted)]"
                >
                  Disconnect
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={!hasInjected || connecting}
                onClick={connectWallet}
                className="border border-[var(--accent)] bg-[var(--accent)] px-4 py-2 font-semibold text-[var(--bg)] disabled:opacity-40"
              >
                {!hasInjected ? "Install MetaMask" : connecting ? "Connecting…" : "Connect"}
              </button>
            )}
          </div>
        </div>
      </header>

      {error && (
        <p className="mx-auto max-w-6xl px-5 pt-4 text-sm text-[var(--danger)] md:px-8">
          {error}
        </p>
      )}

      <main className="mx-auto grid max-w-6xl gap-8 px-5 py-8 md:px-8 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="anim-feed space-y-6">
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={!!busy}
              onClick={() => runDemo("defend")}
              className="border border-[var(--line)] px-4 py-2.5 text-sm font-medium hover:border-[var(--accent-dim)] disabled:opacity-40"
            >
              {busy === "defend" ? "Running…" : "Demo: DEFENDED"}
            </button>
            <button
              type="button"
              disabled={!!busy}
              onClick={() => runDemo("breach")}
              className="border border-[var(--accent)] bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--bg)] disabled:opacity-40"
            >
              {busy === "breach" ? "Running…" : "Demo: BREACHED"}
            </button>
          </div>

          {selected && (
            <article className="border border-[var(--line)] bg-[var(--panel)] p-5 md:p-6">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-mono text-xs tracking-widest text-[var(--muted)] uppercase">
                  Attack #{selected.onchainId || "—"}
                </p>
                <span
                  className={`text-sm font-semibold ${
                    selected.status === "running"
                      ? "text-[var(--warn)]"
                      : selected.breached
                        ? "text-[var(--danger)]"
                        : "text-[var(--accent)]"
                  }`}
                >
                  {selected.status === "running"
                    ? "RUNNING"
                    : selected.breached
                      ? "BREACHED"
                      : "DEFENDED"}
                </span>
              </div>

              <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-[11px] tracking-wide text-[var(--muted)] uppercase">
                    Target
                  </dt>
                  <dd className="mt-1">{selected.target}</dd>
                </div>
                <div>
                  <dt className="text-[11px] tracking-wide text-[var(--muted)] uppercase">
                    Attack type
                  </dt>
                  <dd className="mt-1">{selected.category}</dd>
                </div>
                <div>
                  <dt className="text-[11px] tracking-wide text-[var(--muted)] uppercase">
                    Attacker
                  </dt>
                  <dd className="mt-1 font-mono text-xs">{selected.attacker}</dd>
                </div>
                <div>
                  <dt className="text-[11px] tracking-wide text-[var(--muted)] uppercase">
                    Stake
                  </dt>
                  <dd className="mt-1 font-mono">{selected.stake} MON</dd>
                </div>
              </dl>

              {selected.verifiers.length > 0 && (
                <ul className="mt-5 space-y-1 border-t border-[var(--line)] pt-4 text-sm">
                  {selected.verifiers.map((v) => (
                    <li key={v.id} className="flex justify-between font-mono text-xs">
                      <span className="text-[var(--muted)]">Verifier #{v.id}</span>
                      <span>{v.vote}</span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-4 flex justify-between border-t border-[var(--line)] pt-4 text-sm">
                <span className="text-[var(--muted)]">Reward</span>
                <span className="font-mono">
                  {selected.breached ? `+${selected.rewardMon}` : "0"} MON
                </span>
              </div>
              <div className="mt-2 flex justify-between text-sm">
                <span className="text-[var(--muted)]">Reputation</span>
                <span className="font-mono">
                  {selected.breached ? `+${selected.reputation}` : "+0"}
                </span>
              </div>

              {selected.agentOutput && (
                <div className="mt-5 border-t border-[var(--line)] pt-4">
                  <p className="text-[11px] tracking-wide text-[var(--muted)] uppercase">
                    Agent output
                  </p>
                  <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-xs text-[var(--fg)]/90">
                    {selected.agentOutput}
                  </pre>
                </div>
              )}

              {selected.verifierNotes && (
                <p className="mt-3 text-xs text-[var(--muted)]">{selected.verifierNotes}</p>
              )}

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={
                    !!busy ||
                    selected.status === "running" ||
                    !selected.attackHash ||
                    selected.status === "finalized"
                  }
                  onClick={submitOnchain}
                  className="border border-[var(--accent)] bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--bg)] disabled:opacity-35"
                >
                  {busy === "submit" || busy === "report"
                    ? "On-chain…"
                    : selected.status === "finalized"
                      ? "Finalized on Monad"
                      : "Stake & commit on Monad"}
                </button>
                {selected.breached && selected.status === "finalized" && selected.onchainId && (
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={claimReward}
                    className="border border-[var(--line)] px-4 py-2.5 text-sm hover:border-[var(--accent-dim)]"
                  >
                    Claim reward
                  </button>
                )}
              </div>

              {(selected.submitTx || selected.reportTx || (txPending && pendingTx)) && (
                <div className="mt-4 space-y-1 font-mono text-[11px] text-[var(--muted)]">
                  {selected.submitTx && (
                    <a
                      className="block hover:text-[var(--fg)]"
                      href={`https://testnet.monadvision.com/tx/${selected.submitTx}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      submit: {shortAddr(selected.submitTx)}
                    </a>
                  )}
                  {selected.reportTx && (
                    <a
                      className="block hover:text-[var(--fg)]"
                      href={`https://testnet.monadvision.com/tx/${selected.reportTx}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      result: {shortAddr(selected.reportTx)}
                    </a>
                  )}
                  {txPending && <p>Confirming…</p>}
                  {txSuccess && !selected.reportTx && <p>Tx confirmed</p>}
                </div>
              )}
            </article>
          )}
        </section>

        <aside className="anim-feed space-y-8" style={{ animationDelay: "60ms" }}>
          <section>
            <div className="mb-3 flex items-baseline justify-between border-b border-[var(--line)] pb-2">
              <h2 className="text-sm font-semibold tracking-wide">Live</h2>
              <span className="font-mono text-[11px] text-[var(--muted)]">
                {feed.length} events
              </span>
            </div>
            <ul className="divide-y divide-[var(--line)]">
              {feed.map((a) => (
                <li key={a.localId}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(a.localId)}
                    className={`flex w-full items-center justify-between gap-3 py-3 text-left text-sm hover:bg-white/[0.02] ${
                      selectedId === a.localId ? "text-[var(--fg)]" : "text-[var(--muted)]"
                    }`}
                  >
                    <span className="font-mono text-xs">
                      #{a.onchainId || "…"} {a.category}
                    </span>
                    <span
                      className={`shrink-0 text-xs font-semibold ${
                        a.status === "running"
                          ? "text-[var(--warn)]"
                          : a.breached
                            ? "text-[var(--danger)]"
                            : "text-[var(--accent)]"
                      }`}
                    >
                      {a.status === "running" ? "…" : a.breached ? "BREACHED" : "DEFENDED"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="mb-3 border-b border-[var(--line)] pb-2 text-sm font-semibold tracking-wide">
              Attacker leaderboard
            </h2>
            <ol className="space-y-2 font-mono text-xs">
              <li className="flex justify-between">
                <span>01 0x82…91</span>
                <span className="text-[var(--muted)]">97.2 rep</span>
              </li>
              <li className="flex justify-between">
                <span>02 0x41…22</span>
                <span className="text-[var(--muted)]">94.8 rep</span>
              </li>
              <li className="flex justify-between">
                <span>03 0xA7…18</span>
                <span className="text-[var(--muted)]">92.1 rep</span>
              </li>
            </ol>
          </section>

          <section>
            <h2 className="mb-3 border-b border-[var(--line)] pb-2 text-sm font-semibold tracking-wide">
              Model security
            </h2>
            <ul className="space-y-2 text-sm">
              <li className="flex justify-between">
                <span>ResearchAgent v1.3</span>
                <span className="font-mono text-xs text-[var(--accent)]">live</span>
              </li>
              <li className="flex justify-between text-[var(--muted)]">
                <span>Agent Beta</span>
                <span className="font-mono text-xs">94.8%</span>
              </li>
              <li className="flex justify-between text-[var(--muted)]">
                <span>Agent Gamma</span>
                <span className="font-mono text-xs">89.1%</span>
              </li>
            </ul>
          </section>
        </aside>
      </main>
    </div>
  );
}
