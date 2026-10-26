import type { IndexedRule } from "../../src/dispatcher/dispatch";

export type Spend = { name: string; tokens: number };

// Four characters to the token. The ceilings are set against this same count, so what it measures is a
// budget rather than a tokenizer's answer.
const estimate = (text: string): number => Math.ceil(text.length / 4);

export const spendOf = (rules: readonly IndexedRule[]): Spend[] =>
  rules.map((rule) => ({ name: rule.name, tokens: estimate(rule.text) })).sort((a, b) => b.tokens - a.tokens);

export const opening = (rules: readonly IndexedRule[]): IndexedRule[] =>
  rules.filter((rule) => rule.triggers.some((trigger) => trigger.predicate === "always"));

export const overBudget = (spend: readonly Spend[], ceiling: number): string | undefined => {
  const total = spend.reduce((sum, one) => sum + one.tokens, 0);
  if (total <= ceiling) return undefined;
  const largest = spend.slice(0, 3).map(({ name, tokens }) => `${name} ${tokens}`);
  return `${total} tokens against a ceiling of ${ceiling}, ${total - ceiling} over. Largest: ${largest.join(", ")}`;
};
