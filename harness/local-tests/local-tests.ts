import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BIN_TEST_RUN, BIN_TEST_SCRIPT, EVAL_CONFIG, program, SCRIPT_RUNNERS, segments, stripped, texts } from "./shell-commands";

export const LOCAL_TESTS_LINE = "local-tests: refused a test command";

const REFUSAL = "checks.config.ts localTests is blocked. CI is the test run.";
const UNKNOWN = "Cannot read checks.config.ts localTests through checks-local-tests. CI is the test run.";
const RUNNERS = new Set(["checks-test", "checks-browser", "checks-flake", "checks-mutation", "pytest", "vitest", "jest", "playwright", "mocha", "ava", "tap", "stryker"]);
const PACKAGES = new Set(["npm", "pnpm", "yarn", "bun"]);

function evalConfig(args: readonly string[]): boolean {
  for (let at = 0; at < args.length; at += 1) {
    const arg = args[at] ?? "";
    const [name = "", value] = arg.split(/=(.*)/s);
    if (name !== "-c" && name !== "--config") continue;
    if (EVAL_CONFIG.test(value ?? args[at + 1] ?? "")) return true;
  }
  return false;
}

const TAKES_VALUE = new Set(["-C", "--dir", "--cwd", "--prefix", "-F", "--filter", "--resume-from", "--project", "--directory", "--group", "-p", "--package", "--workspace", "--with"]);

function takesValue(tool: string, word: string): boolean {
  if (word === "-w") return tool === "npm";
  return TAKES_VALUE.has(word);
}

function skipFlags(words: readonly string[], at: number, tool: string = words[0] ?? ""): number {
  let next = at;
  for (;;) {
    const word = words[next] ?? "";
    if (word === "--") return next + 1;
    if (!word.startsWith("-") || word === "-") return next;
    next += 1;
    if (!word.includes("=") && takesValue(tool, word) && next < words.length && !(words[next] ?? "").startsWith("-")) next += 1;
  }
}

const DIR_FLAGS = new Set(["-C", "--dir", "--cwd", "--prefix", "--chdir", "--directory"]);

function expandHome(path: string): string {
  const home = process.env.HOME;
  if (home === undefined || home === "") return path;
  if (path === "~") return home;
  return path.startsWith("~/") ? home + path.slice(1) : path;
}

function flagDir(words: readonly string[], dir: string, tool = "", prefix = false): string {
  let here = dir;
  let at = prefix ? 0 : 1;
  for (;;) {
    if (at >= words.length) break;
    const word = words[at] ?? "";
    if (word === "--") break;
    if (!word.startsWith("-") || word === "-") {
      if (!prefix) break;
      at += 1;
      continue;
    }
    at += 1;
    const [name = "", inline] = word.split(/=(.*)/s);
    if (inline !== undefined) {
      if (DIR_FLAGS.has(name)) here = resolve(here, expandHome(inline));
      continue;
    }
    if (at < words.length && !(words[at] ?? "").startsWith("-")) {
      if (DIR_FLAGS.has(word)) here = resolve(here, expandHome(words[at] ?? ""));
      if (DIR_FLAGS.has(word) || takesValue(tool, word)) at += 1;
    }
  }
  return here;
}

function scriptCall(words: readonly string[]): { name: string | undefined; rest: readonly string[] } {
  const tool = words[0] ?? "";
  if (!PACKAGES.has(tool)) return { name: undefined, rest: [] };
  const at = skipFlags(words, 1);
  const next = words[at] ?? "";
  if (next === "run" || next === "run-script") {
    const nameAt = skipFlags(words, at + 1);
    return { name: words[nameAt], rest: words.slice(nameAt + 1) };
  }
  if (tool !== "bun" && (next === "test" || next === "t")) return { name: "test", rest: words.slice(at + 1) };
  if (tool === "yarn" && next === "workspace") return scriptCall(["yarn", ...words.slice(skipFlags(words, at + 2))]);
  if (tool === "pnpm" || tool === "yarn" || (tool === "bun" && !BUN_COMMANDS.has(next))) return { name: next === "" ? undefined : next, rest: words.slice(at + 1) };
  return { name: undefined, rest: [] };
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
  if (tool === "bun" || tool === "cargo" || tool === "deno" || tool === "go") return (words[skipFlags(words, 1)] ?? "") === "test";
  if (tool === "node") return words.slice(1).includes("--test");
  if (tool === "python" || tool === "python3") {
    for (let at = 1; at < words.length - 1; at += 1) {
      if (words[at] === "-m" && (words[at + 1] === "pytest" || words[at + 1] === "unittest")) return true;
    }
    return false;
  }
  if (tool === "uv" || tool === "poetry") {
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

const BUN_COMMANDS = new Set([
  "add",
  "audit",
  "build",
  "bump",
  "create",
  "deploy",
  "init",
  "install",
  "link",
  "login",
  "logout",
  "migrate",
  "outdated",
  "patch",
  "pm",
  "publish",
  "remove",
  "run",
  "test",
  "uninstall",
  "unlink",
  "update",
  "upgrade",
  "whoami",
  "why",
  "info",
  "x",
  "i",
  "a",
  "r",
  "rm",
  "un",
  "v",
  "view",
]);

const TEST_SCRIPT = /^(?:test|test:.*|mutate|mutate:.*)$/;

const CHECK_TOOLS = new Set(["tsc", "eslint", "oxlint", "biome", "prettier"]);

function checksBody(body: string): boolean {
  const listed = segments(body);
  if (listed.length === 0) return false;
  return listed.every((segment) => CHECK_TOOLS.has(program(stripped(texts(segment))[0] ?? "")));
}

function scriptDirectories(words: readonly string[], cwd: string, seen: ReadonlySet<string>): string[] {
  const { name: script, rest } = scriptCall(words);
  if (!script || script === "eval") return [];
  if (seen.has(cwd + ":" + script)) {
    if (!TEST_SCRIPT.test(script)) return [];
    const value = scriptsAt(cwd)[script];
    if (typeof value === "string" && checksBody(value)) return [];
    return [cwd];
  }
  const value = scriptsAt(cwd)[script];
  if (typeof value === "string") {
    const inner = testDirectories(value, cwd, new Set([...seen, cwd + ":" + script]));
    if (inner.length > 0) return inner;
    if (checksBody(value)) return [];
  }
  if (directRunner([script, ...rest])) return [cwd];
  return TEST_SCRIPT.test(script) ? [cwd] : [];
}

function isTestScript(bare: readonly string[]): boolean {
  const [head = "", ...rest] = bare;
  const through = SCRIPT_RUNNERS.has(program(head)) ? rest : bare;
  const [first = ""] = through;
  if (first === "") return false;
  return BIN_TEST_RUN.test(first) || BIN_TEST_SCRIPT.test(first);
}

const SHELLS = new Set(["sh", "bash", "dash", "zsh"]);

function testDirectories(command: string, cwd: string, seen: ReadonlySet<string> = new Set()): string[] {
  let dir = cwd;
  const found: string[] = [];
  for (const listed of segments(command)) {
    const raw = texts(listed);
    const bare = stripped(raw);
    const words = bare.map((word, at) => (at === 0 ? program(word) : word));
    if (words[0] === "cd" && words[1] !== undefined) {
      dir = resolve(dir, expandHome(words[1]));
      continue;
    }
    if (words.includes("--help") || words.includes("--version")) continue;
    const prefix = raw.slice(0, raw.length - bare.length);
    const here = flagDir(words, flagDir(prefix, dir, "", true), words[0] ?? "");
    if (SHELLS.has(words[0] ?? "")) {
      const flag = words.findIndex((word) => /^-[^-]*c[^-]*$/.test(word));
      if (flag !== -1) {
        const nested = words[flag + 1];
        if (nested !== undefined) found.push(...testDirectories(nested, here, seen));
        continue;
      }
    }
    if (scriptCall(words).name === "eval") continue;
    if (directRunner(words)) found.push(here);
    else if (managerRunner(words)) found.push(here);
    else if (isTestScript(bare)) found.push(here);
    else found.push(...scriptDirectories(words, here, seen));
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
