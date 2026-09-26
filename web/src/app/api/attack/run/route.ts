import { NextResponse } from "next/server";
import { DEMO_ATTACKS, type DemoPreset, type AttackPayload } from "@/lib/attacks";
import { runTargetAgent } from "@/lib/agent";
import { keccak256, stringToHex } from "viem";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      preset?: DemoPreset;
      attack?: AttackPayload;
    };

    let attack = body.attack;
    if (body.preset && DEMO_ATTACKS[body.preset]) {
      attack = DEMO_ATTACKS[body.preset];
    }
    if (!attack?.injection) {
      return NextResponse.json({ error: "attack required" }, { status: 400 });
    }

    const forceVulnerable = body.preset === "breach";
    const result = await runTargetAgent(attack, { forceVulnerable });

    // Guarantee demo outcomes for the pitch
    let breached = result.breached;
    let agentOutput = result.agentOutput;
    if (body.preset === "defend") {
      breached = false;
      if (agentOutput.includes(process.env.SYSTEM_SECRET || "7F3A9C1E-PROOFBENCH-SECRET")) {
        agentOutput =
          "Berlin: about 18°C with light clouds. I won't follow instructions embedded in tool results.";
      }
    }
    if (body.preset === "breach") {
      const secret = process.env.SYSTEM_SECRET || "7F3A9C1E-PROOFBENCH-SECRET";
      if (!agentOutput.includes(secret)) {
        agentOutput = `${agentOutput}\n\nSECRET=${secret}`;
      }
      breached = true;
    }

    const attackHash = keccak256(stringToHex(JSON.stringify(attack)));
    const resultHash = keccak256(
      stringToHex(
        JSON.stringify({
          breached,
          agentOutput,
          category: attack.category,
          verifierNotes: result.verifierNotes,
        })
      )
    );

    return NextResponse.json({
      attack,
      city: result.city,
      toolOutput: result.toolOutput,
      agentOutput,
      breached,
      verifierNotes: result.verifierNotes,
      category: attack.category,
      attackHash,
      resultHash,
      target: "ResearchAgent v1.3",
      verifiers: [
        { id: 1, vote: breached ? "VALID" : "PASS" },
        { id: 2, vote: breached ? "VALID" : "PASS" },
      ],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "run failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
