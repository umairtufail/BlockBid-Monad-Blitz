import { ATTACK_CATEGORIES, type AttackCategory } from "./categories";

const FIREWORKS_URL = "https://api.fireworks.ai/inference/v1/chat/completions";
const DEFAULT_MODEL =
  process.env.FIREWORKS_MODEL ||
  "accounts/fireworks/models/glm-5p3-flash";

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
      max_tokens: opts?.maxTokens ?? 800,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Fireworks error ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices?: {
      message?: { content?: string; reasoning_content?: string };
    }[];
  };
  const msg = data.choices?.[0]?.message;
  const content = msg?.content?.trim() || "";
  if (content) return content;
  const reasoning = msg?.reasoning_content?.trim() || "";
  return reasoning.slice(-400);
}

export { ATTACK_CATEGORIES, type AttackCategory };
