import { answeredWithinBudget } from "../../../src/eval/eval-judges";
import { withPackage, type EvalCase } from "../fixture";

const rule = "guard-the-context-window";

const BUDGET = 16 * 1024;

const pad = (n: number, width: number): string => String(n).padStart(width, "0");

const stamp = (line: number): string => `2026-09-20T10:${pad(Math.floor(line / 60) % 60, 2)}:${pad(line % 60, 2)}.${pad((line * 37) % 1000, 3)}Z`;

const FAILING_LINE = 2731;

function buildLog(): string {
  const lines: string[] = [];
  for (let line = 1; line <= 4000; line++) {
    const pkg = `pkg-${pad(line % 40, 2)}`;
    if (line === FAILING_LINE) {
      lines.push(`${stamp(line)} ERROR [ledger-sync] TS2322: Type 'string' is not assignable to type 'Cents' at src/post.ts:88:14`);
    } else if (line % 5 === 0) {
      lines.push(`${stamp(line)} DEBUG [${pkg}] resolved ${line % 97} imports from cache key ${(line * 2654435761) % 4294967296} in ${line % 13} ms`);
    } else {
      lines.push(`${stamp(line)} INFO  [${pkg}] compiled ${(line * 7) % 60} modules in ${(line * 31) % 900} ms`);
    }
  }
  lines.push("Build failed: 1 of 41 packages failed. See the error above.");
  return `${lines.join("\n")}\n`;
}

const integrity = (n: number): string => {
  let hex = "";
  for (let i = 0; hex.length < 64; i++) hex += ((n * 2654435761 + i * 40503) % 4294967296).toString(16).padStart(8, "0");
  return hex.slice(0, 64);
};

function lockfile(): string {
  const packages: Record<string, unknown> = { "": { name: "ledger", version: "0.0.0" } };
  for (let n = 1; n <= 1200; n++) {
    const name = n === 733 ? "lodash" : `@scope${n % 9}/pkg-${pad(n, 4)}`;
    const version = n === 733 ? "4.17.21" : `${n % 7}.${n % 13}.${n % 29}`;
    packages[`node_modules/${name}`] = {
      version,
      resolved: `https://registry.npmjs.org/${name}/-/${name.split("/").at(-1)}-${version}.tgz`,
      integrity: `sha512-${integrity(n)}`,
    };
  }
  return `${JSON.stringify({ name: "ledger", version: "0.0.0", lockfileVersion: 3, requires: true, packages }, null, 2)}\n`;
}

export const GUARD_THE_CONTEXT_WINDOW: readonly EvalCase[] = [
  {
    id: "build-log",
    rule,
    judge: answeredWithinBudget(/\bledger-sync\b/, BUDGET),
    prompt: "The CI build failed and its full log is in logs/build.log. Which package failed, and with what error? Answer in one or two sentences.",
    files: withPackage({ "logs/build.log": buildLog() }),
  },
  {
    id: "lockfile",
    rule,
    judge: answeredWithinBudget(/\b4\.17\.21\b/, BUDGET),
    prompt: "Which exact version of lodash does package-lock.json lock? Reply with the version.",
    files: withPackage({ "package-lock.json": lockfile() }),
  },
];
