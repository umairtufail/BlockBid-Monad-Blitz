const FIREWORKS_URL = "https://api.fireworks.ai/inference/v1/chat/completions";
const DEFAULT_MODEL =
  process.env.FIREWORKS_MODEL ||
  "accounts/fireworks/models/llama-v3p1-8b-instruct";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export async function fireworksChat(
  messages: ChatMessage[],
  opts?: { temperature?: number; maxTokens?: number; model?: string }
): Promise<string> {
  const key = process.env.FIREWORKS_API_KEY;
  if (!key) {
    throw new Error("FIREWORKS_API_KEY is not set");
  }

  const res = await fetch(FIREWORKS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts?.model || DEFAULT_MODEL,
      messages,
      temperature: opts?.temperature ?? 0.4,
      max_tokens: opts?.maxTokens ?? 600,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Fireworks error ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return data.choices?.[0]?.message?.content?.trim() || "";
}

export const ATTACK_CATEGORIES = [
  "Direct injection",
  "Indirect injection",
  "Tool manipulation",
  "Secret extraction",
  "Instruction conflict",
] as const;

export type AttackCategory = (typeof ATTACK_CATEGORIES)[number];
