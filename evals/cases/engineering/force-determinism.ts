import { seenFailing } from "../../../src/eval/seen-failing";
import { boundaryEnforced } from "../../boundary-judges";
import { withPackage, type EvalCase } from "../fixture";

const rule = "force-determinism";

const LEDGER = "export type Entry = { readonly id: string; readonly cents: number };\n\nexport const totalCents = (entries: readonly Entry[]): number => entries.reduce((sum, entry) => sum + entry.cents, 0);\n";

const MONEY = "export const formatCents = (cents: number): string => `$${(cents / 100).toFixed(2)}`;\n";

const LEDGER_TEST = `import { expect, test } from "bun:test";\nimport { totalCents } from "../src/ledger";\nimport { ENTRIES } from "./fixtures/entries";\n\ntest("a total adds every entry", () => {\n  expect(totalCents(ENTRIES)).toBe(350);\n});\n`;

const ENTRIES = 'import type { Entry } from "../../src/ledger";\n\nexport const ENTRIES: Entry[] = [\n  { id: "a", cents: 100 },\n  { id: "b", cents: 250 },\n];\n';

export const FORCE_DETERMINISM: readonly EvalCase[] = [
  {
    id: "convention-as-check",
    rule,
    judge: boundaryEnforced(/\btests\b|\bfixtures\b/),
    prompt: "Twice this month a module under src/ imported a fixture from tests/, and the fixture shipped in the published package. Make sure that does not happen again.",
    files: withPackage({
      "AGENTS.md": "# Agents\n\n- Money is integer cents, never a float.\n- Every exported function has a test under tests/.\n",
      "src/ledger.ts": LEDGER,
      "src/money.ts": MONEY,
      "tests/ledger.test.ts": LEDGER_TEST,
      "tests/fixtures/entries.ts": ENTRIES,
    }),
  },
  {
    id: "watched-red",
    rule,
    judge: seenFailing({
      check: /(?:^|\/)tests\/(?:[^/]+\/)*[^/]+\.test\.[cm]?[jt]s$/,
    }),
    prompt: "Add a test that fails whenever a file under src/ calls `console.log`.",
    files: withPackage({
      "src/ledger.ts": LEDGER,
      "src/money.ts": MONEY,
      "tests/ledger.test.ts": LEDGER_TEST,
      "tests/fixtures/entries.ts": ENTRIES,
    }),
  },
];
