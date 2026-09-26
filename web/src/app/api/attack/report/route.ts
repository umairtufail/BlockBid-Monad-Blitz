import { NextResponse } from "next/server";
import {
  createWalletClient,
  createPublicClient,
  http,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { PROOFBENCH_ABI } from "@/lib/abi";
import { CONTRACT_ADDRESS, monadTestnet } from "@/lib/config";

export async function POST(req: Request) {
  try {
    const pk = process.env.REPORTER_PRIVATE_KEY || process.env.PRIVATE_KEY;
    if (!pk) {
      return NextResponse.json(
        { error: "REPORTER_PRIVATE_KEY not configured" },
        { status: 500 }
      );
    }

    const body = (await req.json()) as {
      attackId: string | number;
      breached: boolean;
      resultHash: Hex;
    };

    if (body.attackId === undefined || !body.resultHash) {
      return NextResponse.json({ error: "attackId and resultHash required" }, { status: 400 });
    }

    const account = privateKeyToAccount(
      (pk.startsWith("0x") ? pk : `0x${pk}`) as Hex
    );
    const wallet = createWalletClient({
      account,
      chain: monadTestnet,
      transport: http("https://testnet-rpc.monad.xyz"),
    });
    const publicClient = createPublicClient({
      chain: monadTestnet,
      transport: http("https://testnet-rpc.monad.xyz"),
    });

    const hash = await wallet.writeContract({
      address: CONTRACT_ADDRESS,
      abi: PROOFBENCH_ABI,
      functionName: "reportResult",
      args: [BigInt(body.attackId), body.breached, body.resultHash],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    return NextResponse.json({
      txHash: hash,
      status: receipt.status,
      reporter: account.address,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "report failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
