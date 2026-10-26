import { addedTo, committedWith, revisedTo } from "../../writing-judges";
import { manifest, withPackage } from "../fixture";
import { KEY_FACTS, type LedgerTask } from "./ledger";

const IMPORT_TS = `export type Row = { date: string; amount: number; payee: string; raw: string };

export function importRows(rows: Row[], seen: Set<string>): Row[] {
  const kept: Row[] = [];
  for (const row of rows) {
    const key = row.raw;
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(row);
  }
  return kept;
}
`;

const IMPORT_TEST = `import { expect, test } from "bun:test";
import { importRows, type Row } from "../src/import";

const row = (date: string, amount: number, payee: string): Row => ({ date, amount, payee, raw: \`\${date},\${amount},\${payee}\` });

test("skips a row seen before", () => {
  const seen = new Set<string>();
  importRows([row("2026-09-01", 12.5, "Coffee Shop")], seen);
  expect(importRows([row("2026-09-01", 12.5, "Coffee Shop")], seen)).toHaveLength(0);
});
`;

const CONTRIBUTING = "# Contributing\n\nRun `bun test` before you commit.\nWrite each commit message as a summary line, a blank line, and a body that says what changed and why.\n";

const DEDUP = { "src/import.ts": IMPORT_TS, "test/import.test.ts": IMPORT_TEST, "CONTRIBUTING.md": CONTRIBUTING };

const CLI_TS = `import { readFileSync, writeFileSync } from "node:fs";
import { importRows, type Row } from "./import";

const toRow = (line: string): Row => {
  const [date = "", amount = "0", payee = ""] = line.split(",");
  return { date, amount: Number(amount), payee, raw: line };
};

const linesOf = (path: string): string[] => readFileSync(path, "utf8").split("\\n").filter((line) => line !== "");

export function run(args: readonly string[]): string[] {
  const [file] = args;
  if (file === undefined) throw new Error("usage: bun run import <file>");
  const ledger = linesOf("ledger.csv");
  const added = importRows(linesOf(file).map(toRow), new Set(ledger));
  writeFileSync("ledger.csv", [...ledger, ...added.map((row) => row.raw)].map((line) => \`\${line}\\n\`).join(""));
  return added.map((row) => row.raw);
}

if (import.meta.main) console.log(run(process.argv.slice(2)).join("\\n"));
`;

const FLAG = {
  "package.json": manifest({ scripts: { test: "bun test", import: "bun src/cli.ts" } }),
  "src/import.ts": IMPORT_TS,
  "src/cli.ts": CLI_TS,
  "ledger.csv": "2026-09-01,12.5,Coffee Shop\n",
  "README.md": "# Ledger\n\nLedger imports the CSV file your bank exports into ledger.csv. Run `bun run import <file>` to import one, and `bun test` to run the tests.\n",
};

const FLAG_DOC = revisedTo("README.md", [/bun run import(?![^`\n]*--dry-run)/, /bun test/, /ledger\.csv/], [
  /--dry-run/,
  /nothing|writes no|without (?:writing|adding|changing|touching|modifying)|no changes|unchanged|untouched/i,
  /list|show|print|preview|would|\bsee\b/i,
]);

const DEDUP_EN =
  'A bank export that lists one payment with the payee "Coffee Shop" and again with " coffee shop " gets the payment imported twice. Fix importRows in src/import.ts so a row\'s key is its date, its amount to two decimal places and its payee trimmed and lowercased. Add a test and run the tests';

const CHANGES_EN = `Ledger 1.3, changes since 1.2 (engineering notes).

- Dry run: bun run import --dry-run <file> lists the transactions an import would add — and writes nothing to ledger.csv.
- Dedup fix: a payee that differs only in spaces or letter case (e.g. "Coffee Shop" vs " coffee shop ") no longer gets the payment imported twice; the key is date + amount to the cent + trimmed, lowercased payee.
- Alfa-Bank: exports are read as they are (no column mapping in ledger.config.json needed any more).
- Size limit: 50 MB per file (was 10 MB).
- MISSING_COLUMNS: the error now names the missing columns.
- Requirement: Bun 1.2 or later.
`;

const WHY = /twice|duplicat|dedup|again|double|skip|kept both/i;
const COMMIT = committedWith([...KEY_FACTS, WHY]);
const FIX_PR = addedTo("PR.md", [...KEY_FACTS, WHY]);
const NEWS = addedTo("site/news.md", [
  /1\.3/,
  /dry[- ]?run/i,
  /nothing|writes no|without (?:writing|adding|changing|touching)|no changes|unchanged|untouched/i,
  /twice|duplicat|double|second copy|one copy|only once/i,
  /spac|case|capital/i,
  /Alfa/i,
  /50\s*(?:MB|megabytes)/i,
  /10\s*(?:MB|megabytes)/i,
  /(?:missing|lack|miss)[^.]{0,60}column|column[^.]{0,60}(?:missing|lack|miss)/i,
  /Bun`?\s*(?:to\s*)?1\.2/i,
]);

export const LEDGER_CHANGES = {
  enCommit: {
    id: "en-commit",
    prompt: `${DEDUP_EN}, then commit the change.`,
    files: withPackage(DEDUP),
    written: COMMIT,
  },
  enPrFix: {
    id: "en-pr-fix",
    prompt: `${DEDUP_EN}, then write the pull request description for your change to PR.md.`,
    files: withPackage(DEDUP),
    written: FIX_PR,
  },
  enReadmeFlag: {
    id: "en-readme-flag",
    prompt: "Add a --dry-run flag to the import command in src/cli.ts: with it, run lists the transactions the import would add and writes nothing to ledger.csv. Add a test, then document the flag in README.md.",
    files: withPackage(FLAG),
    written: FLAG_DOC,
  },
  enNews: {
    id: "en-news",
    prompt: "Write site/news.md, the note that tells Ledger's users, mostly small business owners, what Ledger 1.3 changes for them, using changes.md.",
    files: withPackage({ "changes.md": CHANGES_EN }),
    written: NEWS,
  },
} as const satisfies Record<string, LedgerTask>;
