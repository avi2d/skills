import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { program, segments, stripped, texts } from "./shell-commands";

export const LOCAL_TESTS_LINE = "local-tests: refused a test command";

const REFUSAL = "checks.config.ts localTests is blocked. CI is the test run.";
const UNKNOWN = "Cannot read checks.config.ts localTests through checks-local-tests. CI is the test run.";
const RUNNERS = new Set(["checks-test", "checks-browser", "checks-flake", "checks-mutation", "pytest", "vitest", "jest", "playwright", "mocha", "ava", "tap", "stryker"]);
const PACKAGES = new Set(["npm", "pnpm", "yarn", "bun"]);

const EVAL_CONFIG = /(^|\/)evals\/vitest\.config\.ts$/;

function evalConfig(args: readonly string[]): boolean {
  for (let at = 0; at < args.length; at += 1) {
    const arg = args[at] ?? "";
    const [name = "", value] = arg.split(/=(.*)/s);
    if (name !== "-c" && name !== "--config") continue;
    if (EVAL_CONFIG.test(value ?? args[at + 1] ?? "")) return true;
  }
  return false;
}

const TAKES_VALUE = new Set(["-C", "--dir", "--cwd", "--prefix", "-F", "--filter", "--resume-from", "--project", "--directory", "--group", "-p", "--package"]);

function skipFlags(words: readonly string[], at: number): number {
  let next = at;
  for (;;) {
    const word = words[next] ?? "";
    if (word === "--") return next + 1;
    if (!word.startsWith("-") || word === "-") return next;
    next += 1;
    if (!word.includes("=") && TAKES_VALUE.has(word) && next < words.length && !(words[next] ?? "").startsWith("-")) next += 1;
  }
}

function scriptName(words: readonly string[]): string | undefined {
  const tool = words[0] ?? "";
  if (!PACKAGES.has(tool)) return undefined;
  const at = skipFlags(words, 1);
  const next = words[at] ?? "";
  if (next === "run" || next === "run-script") return words[skipFlags(words, at + 1)];
  if (tool !== "bun" && (next === "test" || next === "t")) return "test";
  if (tool === "pnpm" || tool === "yarn") return next === "" ? undefined : next;
  return undefined;
}

function scriptsAt(cwd: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));
    if (typeof parsed !== "object" || parsed === null || !("scripts" in parsed)) return {};
    const scripts = parsed.scripts;
    return typeof scripts === "object" && scripts !== null && !Array.isArray(scripts) ? Object.fromEntries(Object.entries(scripts)) : {};
  } catch {
    return {};
  }
}

function directRunner(words: readonly string[]): boolean {
  const tool = words[0] ?? "";
  if (tool === "playwright" || tool === "stryker") {
    const arg = words[1] ?? "";
    return arg === "test" || (tool === "stryker" && arg === "run");
  }
  if (tool === "vitest" && evalConfig(words.slice(1))) return false;
  if (RUNNERS.has(tool)) return true;
  if (tool === "bun" || tool === "cargo" || tool === "go") return (words[skipFlags(words, 1)] ?? "") === "test";
  if (tool === "node") return words.slice(1).includes("--test");
  if (tool === "python" || tool === "python3") {
    for (let at = 1; at < words.length - 1; at += 1) {
      if (words[at] === "-m" && (words[at + 1] === "pytest" || words[at + 1] === "unittest")) return true;
    }
    return false;
  }
  if (tool === "uv") {
    const at = skipFlags(words, 1);
    if (words[at] !== "run") return false;
    const rest = words.slice(skipFlags(words, at + 1));
    return rest.length > 0 && directRunner(rest);
  }
  if (tool === "uvx") {
    const rest = words.slice(skipFlags(words, 1));
    return rest.length > 0 && directRunner(rest);
  }
  return false;
}

function managerRunner(words: readonly string[]): boolean {
  const tool = words[0] ?? "";
  if (!PACKAGES.has(tool)) return false;
  const at = skipFlags(words, 1);
  const head = words[at] ?? "";
  if (head === "" || head === "run" || head === "run-script") return false;
  return directRunner([head, ...words.slice(at + 1)]);
}

function scriptDirectories(words: readonly string[], cwd: string, seen: ReadonlySet<string>): string[] {
  const script = scriptName(words);
  if (!script || script === "eval" || seen.has(cwd + ":" + script)) return [];
  const value = scriptsAt(cwd)[script];
  if (typeof value === "string") return testDirectories(value, cwd, new Set([...seen, cwd + ":" + script]));
  return /^(?:test|test:.*|mutate|mutate:.*)$/.test(script) ? [cwd] : [];
}

const SCRIPT_RUNNERS = new Set(["bun", "node", "sh", "bash", "zsh", "dash"]);
const TOOL_PATHS = new Set(["lint", "typecheck", "build"]);
const BIN_TEST_RUN = /(^|\/)bin\/fm-test-run\.sh$/;
const BIN_TEST_SCRIPT = /(^|\/)bin\/[^/]*\.test\.sh$/;

const base = (word: string): string => word.slice(word.lastIndexOf("/") + 1);

function watched(arg: string): boolean {
  const [name = "", value] = arg.split(/=(.*)/s);
  return (name === "-w" || name === "--watch" || name === "--watchAll") && value !== "false";
}

function isTestScript(bare: readonly string[]): boolean {
  const [head = "", ...rest] = bare;
  const through = SCRIPT_RUNNERS.has(program(head)) ? rest : bare;
  const [first = "", ...args] = through;
  if (first === "" || args.some(watched)) return false;
  if (first.includes("/") && TOOL_PATHS.has(base(first))) return true;
  if (base(first) === "fm-sim-boot.sh") return true;
  return BIN_TEST_RUN.test(first) || BIN_TEST_SCRIPT.test(first);
}

const SHELLS = new Set(["sh", "bash", "dash", "zsh"]);

function testDirectories(command: string, cwd: string, seen: ReadonlySet<string> = new Set()): string[] {
  let dir = cwd;
  const found: string[] = [];
  for (const listed of segments(command)) {
    const bare = stripped(texts(listed));
    const words = bare.map((word, at) => (at === 0 ? program(word) : word));
    if (words[0] === "cd" && words[1] !== undefined) {
      dir = resolve(dir, words[1]);
      continue;
    }
    if (words.includes("--help") || words.includes("--version")) continue;
    if (SHELLS.has(words[0] ?? "")) {
      const flag = words.indexOf("-c");
      if (flag !== -1) {
        const nested = words[flag + 1];
        if (nested !== undefined) found.push(...testDirectories(nested, dir, seen));
        continue;
      }
    }
    if (scriptName(words) === "eval") continue;
    if (directRunner(words)) found.push(dir);
    else if (managerRunner(words)) found.push(dir);
    else if (isTestScript(bare)) found.push(dir);
    else found.push(...scriptDirectories(words, dir, seen));
  }
  return found;
}

export function runsTests(command: string, cwd: string, seen: ReadonlySet<string> = new Set()): boolean {
  return testDirectories(command, cwd, seen).length > 0;
}

function rootOf(cwd: string): string {
  const git = spawnSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], { encoding: "utf8", timeout: 3_000 });
  return git.status === 0 ? git.stdout.trim() : cwd;
}

function binFrom(start: string): string | undefined {
  let at = start;
  for (;;) {
    const candidate = join(at, "node_modules", ".bin", "checks-local-tests");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(at);
    if (parent === at) return undefined;
    at = parent;
  }
}

type HookPayload = { cwd?: string; tool_name?: string; tool_input?: Record<string, unknown> };

export function refusedTests(hook: string, payload: HookPayload): string | undefined {
  if (hook !== "PreToolUse" || payload.tool_name !== "Bash") return undefined;
  const command = payload.tool_input?.command;
  if (typeof command !== "string") return undefined;
  const refusal = refuseLocalTests(command, payload.cwd ?? process.cwd());
  return refusal === undefined ? undefined : JSON.stringify({ hookSpecificOutput: { hookEventName: hook, permissionDecision: "deny", permissionDecisionReason: refusal } });
}

export function refuseLocalTests(command: string, cwd: string): string | undefined {
  if (process.env.CI === "true") return undefined;
  const own = dirname(realpathSync(fileURLToPath(import.meta.url)));
  const roots: string[] = [];
  for (const dir of new Set(testDirectories(command, cwd))) {
    const root = rootOf(dir);
    if (!roots.includes(root)) roots.push(root);
  }
  for (const root of roots) {
    const bin = binFrom(root) ?? binFrom(own);
    if (bin === undefined) return UNKNOWN;
    const setting = spawnSync(bin, [], { cwd: root, encoding: "utf8", timeout: 4_000, env: process.env });
    if (setting.status !== 0) return UNKNOWN;
    if (setting.stdout.trim() === "blocked") return REFUSAL;
    if (setting.stdout.trim() !== "allowed") return UNKNOWN;
  }
  return undefined;
}
