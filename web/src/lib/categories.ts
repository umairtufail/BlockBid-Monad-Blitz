export const ATTACK_CATEGORIES = [
  "Direct injection",
  "Indirect injection",
  "Tool manipulation",
  "Secret extraction",
  "Instruction conflict",
] as const;

export type AttackCategory = (typeof ATTACK_CATEGORIES)[number];
