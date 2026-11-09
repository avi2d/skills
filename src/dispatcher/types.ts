import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, rmdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, extname, isAbsolute, join, relative, sep } from "node:path";

export const LINT_SECONDS = 5;

const TYPES_BUDGET_MS = 20_000;

export type TypesBudget = { remainingMs: number };

export const createTypesBudget = (): TypesBudget => ({ remainingMs: TYPES_BUDGET_MS });

const TYPED = new Set([".ts", ".tsx"]);

const OXLINT = ["node_modules", ".bin", "oxlint"];

const DATA_SHAPE = ["node_modules", "@avi2dg", "checks", "dist", "data-shape", "index.js"];

// oxlint's twin message already names the derivation, and its assertion message names no remedy.
const INSTEAD = {
  "data-shape/schema-twin": "",
  "typescript/no-unsafe-type-assertion": " Parse outside data with a schema, or narrow the value with a type guard, instead of asserting its type.",
};

type Rule = keyof typeof INSTEAD;

const RULES = Object.keys(INSTEAD).filter((name): name is Rule => Object.hasOwn(INSTEAD, name));

const ruleOf = (code: string): Rule | undefined => RULES.find((rule) => code === rule.replace("/", "(") + ")");

type Label = { span: { offset: number; length: number; line: number } };

type Diagnostic = { code: string; message: string; labels: Label[] };

type Finding = { rule: Rule; message: string; first: number; last: number };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isLabel = (value: unknown): value is Label =>
  isRecord(value) &&
  isRecord(value.span) &&
  Number.isInteger(value.span.offset) &&
  Number.isInteger(value.span.length) &&
  Number.isInteger(value.span.line);

const isDiagnostic = (value: unknown): value is Diagnostic =>
  isRecord(value) && typeof value.code === "string" && typeof value.message === "string" && Array.isArray(value.labels) && value.labels.every(isLabel);

const because = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export function linterOf(file: string): string | undefined {
  if (!isAbsolute(file) || !TYPED.has(extname(file))) return undefined;
  for (let dir = dirname(file); ; dir = dirname(dir)) {
    if (existsSync(join(dir, ...OXLINT)) && existsSync(join(dir, ...DATA_SHAPE))) return dir;
    if (dirname(dir) === dir) return undefined;
  }
}

const configFor = (root: string): object => ({
  plugins: ["typescript"],
  jsPlugins: [join(root, ...DATA_SHAPE)],
  categories: { correctness: "off" },
  rules: Object.fromEntries(RULES.map((rule) => [rule, "error"])),
});

// oxlint counts a span's offset in UTF-8 bytes.
function lineSpan(bytes: Buffer, { span }: Label): [number, number] {
  const inside = bytes.subarray(span.offset, span.offset + span.length).toString("utf8");
  return [span.line, span.line + inside.split("\n").length - 1];
}

function findingsOf(report: string, after: string): Finding[] | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(report);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.diagnostics) || !parsed.diagnostics.every(isDiagnostic)) return undefined;
  const bytes = Buffer.from(after, "utf8");
  return parsed.diagnostics.flatMap((found): Finding[] => {
    const rule = ruleOf(found.code);
    const spans = found.labels.map((label) => lineSpan(bytes, label));
    if (rule === undefined || spans.length === 0) return [];
    return [{ rule, message: found.message, first: Math.min(...spans.map(([first]) => first)), last: Math.max(...spans.map(([, last]) => last)) }];
  });
}

function pruneMadeDirs(dir: string, made: string): void {
  for (let at = dir; ; at = dirname(at)) {
    try {
      rmdirSync(at);
    } catch {
      break;
    }
    if (at === made) break;
  }
}

function discardLintFiles(copy: string, dir: string, made: string | undefined, scratch: string): void {
  rmSync(copy, { force: true });
  if (made !== undefined) pruneMadeDirs(dir, made);
  rmSync(scratch, { recursive: true, force: true });
}

// oxlint reads no stdin, and a copy outside the project would resolve none of the file's imports.
function linted(root: string, file: string, after: string, budget: TypesBudget): Finding[] | string {
  if (budget.remainingMs < LINT_SECONDS * 1000) return `types budget of ${TYPES_BUDGET_MS / 1000}s spent`;
  const dir = dirname(file);
  const copy = join(dir, `${basename(file, extname(file))}.skills-types-${process.pid}${extname(file)}`);
  const scratch = mkdtempSync(join(tmpdir(), "skills-types-"));
  let made: string | undefined;
  try {
    const config = join(scratch, "oxlintrc.json");
    writeFileSync(config, JSON.stringify(configFor(root)));
    made = mkdirSync(dir, { recursive: true });
    writeFileSync(copy, after);
    const args = ["-c", config, "--type-aware", "--disable-nested-config", "--no-ignore", "--format", "json", copy];
    const started = Date.now();
    const run = spawnSync(join(root, ...OXLINT), args, { cwd: root, encoding: "utf8", timeout: LINT_SECONDS * 1000, killSignal: "SIGKILL" });
    budget.remainingMs -= Date.now() - started;
    if (run.error !== undefined) return "code" in run.error && run.error.code === "ETIMEDOUT" ? `oxlint ran past ${LINT_SECONDS}s` : `cannot run oxlint: ${run.error.message}`;
    const said = (run.stderr.trim() || run.stdout.trim()).split("\n")[0] || `exit code ${run.status}`;
    return findingsOf(run.stdout, after) ?? `oxlint failed: ${said}`;
  } catch (e) {
    return because(e);
  } finally {
    discardLintFiles(copy, dir, made, scratch);
  }
}

export function typesRefused(file: string, after: string, added: ReadonlySet<number>, budget: TypesBudget): { refusals: string[] } | { unread: string } {
  const root = linterOf(file);
  if (root === undefined || added.size === 0) return { refusals: [] };
  const named = relative(root, file).split(sep).join("/");
  const found = linted(root, file, after, budget);
  if (typeof found === "string") return { unread: `${found} on ${named}` };
  return {
    refusals: found
      .filter(({ first, last }) => [...added].some((line) => line >= first && line <= last))
      .map(({ rule, message, first }) => `${named}:${first} \`${rule}\`: ${message}${INSTEAD[rule]}`),
  };
}
