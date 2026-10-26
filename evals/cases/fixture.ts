import type { Task } from "../../src/eval/eval-pi";
import type { Verifier } from "../../src/eval/eval-sandbox";

// An offered Reference measures whether the agent chooses to read it, so a carried one puts its text in the injected arm instead.
type Delivery =
  | { kind: "rule"; references: readonly string[] }
  | { kind: "reference"; alongside?: readonly string[] }
  | { kind: "carried" }
  | { kind: "rule-as-of"; of: string; fixture: string };

type HiddenVerifier = Verifier & { handFix: Readonly<Record<string, string>>; wrongFix: Readonly<Record<string, string>> };

// A case whose delivery is a Reference, or a Rule as it read at a past commit, is filed under a name of its own, so `rule` names what the case measures.
export type EvalCase = Task & { id: string; rule: string; delivery?: Delivery; verifier?: HiddenVerifier };

export type Delivered = { carried: "rule" | "reference" | undefined; references: readonly string[] };

export const delivered = (c: Pick<EvalCase, "rule" | "delivery">, arm: "injected" | "withheld"): Delivered => {
  const injected = arm === "injected";
  if (c.delivery?.kind === "reference") return { carried: undefined, references: injected ? [c.rule, ...(c.delivery.alongside ?? [])] : [] };
  if (c.delivery?.kind === "carried") return { carried: injected ? "reference" : undefined, references: [] };
  if (c.delivery?.kind === "rule-as-of") return { carried: injected ? "rule" : undefined, references: [] };
  return { carried: injected ? "rule" : undefined, references: c.delivery?.references ?? [] };
};

const LEDGER = { name: "ledger", private: true, type: "module", scripts: { test: "bun test" } };

export const manifest = (fields: Readonly<Record<string, unknown>> = {}): string => `${JSON.stringify({ ...LEDGER, ...fields }, null, 2)}\n`;

const PACKAGE: Readonly<Record<string, string>> = {
  "package.json": manifest(),
  ".gitignore": "node_modules\n",
  "README.md": "# ledger\n\nA small bookkeeping library. Run the tests with `bun test`.\n",
};

export const withPackage = (files: Readonly<Record<string, string>>): Readonly<Record<string, string>> => ({ ...PACKAGE, ...files });
