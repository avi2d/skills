import { noRefusedComment, noRefusedCommentNaming } from "../../../src/eval/eval-judges";
import { withPackage, type EvalCase } from "../fixture";

const rule = "comment-discipline";

export const COMMENT_DISCIPLINE: readonly EvalCase[] = [
  {
    id: "public-helper",
    rule,
    judge: noRefusedComment,
    prompt:
      "Add an exported `chunk(items, size)` function to src/array.ts that splits an array into consecutive groups of `size` items, the last group holding whatever is left. It is part of this package's public API, so make sure a caller knows what happens when `size` is below 1. Cover it in tests/array.test.ts.",
    files: withPackage({
      "src/array.ts": "export function unique<T>(items: readonly T[]): T[] {\n  return [...new Set(items)];\n}\n",
      "tests/array.test.ts": `import { expect, test } from "bun:test";\nimport { unique } from "../src/array";\n\ntest("unique keeps the first of each", () => {\n  expect(unique([1, 2, 1, 3])).toEqual([1, 2, 3]);\n});\n`,
    }),
  },
  {
    id: "decision-record",
    rule,
    judge: noRefusedComment,
    prompt:
      "Implement `retry(fn, attempts)` in a new file src/retry.ts, following the decision recorded in docs/adr/0003-retries-back-off-exponentially.md, and test it in tests/retry.test.ts. Make the waits injectable so the test does not sleep.",
    files: withPackage({
      "docs/adr/0003-retries-back-off-exponentially.md":
        "# Retries back off exponentially\n\nA failed call is retried up to `attempts` times in all. The wait before retry n is 100 ms times 2^(n-1), capped at 2 seconds, so a struggling upstream sees fewer requests over time rather than a steady hammering. The last failure is rethrown unchanged.\n",
    }),
  },
  {
    id: "upstream-workaround",
    rule,
    judge: noRefusedCommentNaming(/\b118\b/),
    prompt:
      "importStatement in src/import.ts leaves a stray carriage return on the payee of the last row when a bank export ends in CRLF. The cause is upstream in the vendored csv-lite 2.4.1, reported at https://github.com/acme/csv-lite/issues/118 and fixed in csv-lite 3.0, which we cannot take yet. Work around it in src/import.ts without touching vendor/, add a regression test to tests/import.test.ts, and make sure whoever upgrades csv-lite later knows the workaround can go.",
    files: withPackage({
      "vendor/csv-lite/package.json": `${JSON.stringify({ name: "csv-lite", version: "2.4.1", type: "module" }, null, 2)}\n`,
      "vendor/csv-lite/index.ts":
        'export function parse(text: string): string[][] {\n  return text.replace(/\\n$/, "").split(/\\r?\\n/).map((line) => line.split(","));\n}\n',
      "src/import.ts":
        'import { parse } from "../vendor/csv-lite/index";\n\nexport type Entry = { date: string; amount: number; payee: string };\n\nexport function importStatement(csv: string): Entry[] {\n  const [, ...rows] = parse(csv);\n  return rows.map(([date = "", amount = "", payee = ""]) => ({ date, amount: Number(amount), payee }));\n}\n',
      "tests/import.test.ts": `import { expect, test } from "bun:test";\nimport { importStatement } from "../src/import";\n\ntest("each row after the header is an entry", () => {\n  expect(importStatement("date,amount,payee\\n2026-01-02,-4.5,Coffee\\n")).toEqual([{ date: "2026-01-02", amount: -4.5, payee: "Coffee" }]);\n});\n`,
    }),
  },
  {
    id: "module-rationale",
    rule,
    judge: noRefusedComment,
    prompt:
      "Add src/rate-limit.ts exporting a token-bucket rate limiter, `createLimiter({ capacity, refillPerSecond, now })` returning `{ tryTake(): boolean }`, with tests in tests/rate-limit.test.ts. We chose a token bucket over a fixed window because bursts at window edges overloaded the upstream last quarter; make sure that reasoning is not lost.",
    files: withPackage({}),
  },
];
