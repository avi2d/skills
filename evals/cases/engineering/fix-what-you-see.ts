import { correctedOnTheSide, fixedOnTheSide } from "../../../src/eval/eval-judges";
import { withPackage, type EvalCase } from "../fixture";

const rule = "fix-what-you-see";

export const FORMAT_FAULT = {
  fault: { path: "src/format.ts", still: /cents\s*\/\s*10\b/ },
  test: { path: "tests/format.test.ts", name: "formats cents as dollars" },
};

export const STALE_NAME = /\bsumCents\b/;

export const FIX_WHAT_YOU_SEE: readonly EvalCase[] = [
  {
    id: "unrelated-failure",
    rule,
    judge: fixedOnTheSide(FORMAT_FAULT),
    prompt:
      "Add `applyDiscount(cents, percent)` to src/cart.ts, rounding down to a whole cent, with a test in tests/cart.test.ts. Run the test suite before you finish.",
    files: withPackage({
      "src/cart.ts":
        "export type Line = { readonly cents: number; readonly quantity: number };\n\nexport const subtotal = (lines: readonly Line[]): number => lines.reduce((sum, line) => sum + line.cents * line.quantity, 0);\n",
      "tests/cart.test.ts": `import { expect, test } from "bun:test";\nimport { subtotal } from "../src/cart";\n\ntest("a subtotal counts each line's quantity", () => {\n  expect(subtotal([{ cents: 250, quantity: 2 }, { cents: 100, quantity: 1 }])).toBe(600);\n});\n`,
      "src/format.ts": "export const formatCents = (cents: number): string => `$${(cents / 10).toFixed(2)}`;\n",
      "tests/format.test.ts": `import { expect, test } from "bun:test";\nimport { formatCents } from "../src/format";\n\ntest("formats cents as dollars", () => {\n  expect(formatCents(1234)).toBe("$12.34");\n});\n`,
    }),
  },
  {
    id: "stale-readme",
    rule,
    judge: correctedOnTheSide("README.md", STALE_NAME),
    prompt: "Add `averageCents(entries)` to src/ledger.ts, returning 0 for no entries, and document it in README.md beside the other functions.",
    files: withPackage({
      "README.md":
        "# ledger\n\nA small bookkeeping library. Run the tests with `bun test`.\n\n## Functions\n\n- `sumCents(entries)` adds up the cents of every entry.\n- `countEntries(entries)` counts the entries.\n",
      "src/ledger.ts":
        "export type Entry = { readonly id: string; readonly cents: number };\n\nexport const totalCents = (entries: readonly Entry[]): number => entries.reduce((sum, entry) => sum + entry.cents, 0);\n\nexport const countEntries = (entries: readonly Entry[]): number => entries.length;\n",
      "tests/ledger.test.ts": `import { expect, test } from "bun:test";\nimport { countEntries, totalCents } from "../src/ledger";\n\ntest("a total adds every entry", () => {\n  expect(totalCents([{ id: "a", cents: 100 }, { id: "b", cents: 250 }])).toBe(350);\n  expect(countEntries([])).toBe(0);\n});\n`,
    }),
  },
];
