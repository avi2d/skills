import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { simpleCommands } from "./shell-commands";

const REFUSAL = "checks.config.ts localTests is blocked. CI is the test run.";
const UNKNOWN = "Cannot read checks.config.ts localTests through checks-local-tests. CI is the test run.";
const RUNNERS = new Set(["checks-test", "checks-browser", "checks-flake", "checks-mutation", "pytest", "vitest", "jest", "playwright", "mocha", "ava", "tap", "stryker"]);
const PACKAGES = new Set(["npm", "pnpm", "yarn", "bun"]);

function scriptName(words: readonly string[]): string | undefined {
  const [tool = "", next = "", name] = words;
  if (!PACKAGES.has(tool)) return undefined;
  if (next === "run" || next === "run-script") return name;
  if (tool !== "bun" && next === "test") return next;
  return tool === "pnpm" || tool === "yarn" ? next : undefined;
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
  const [tool = "", arg = ""] = words;
  if (tool === "playwright" || tool === "stryker") return arg === "test" || (tool === "stryker" && arg === "run");
  if (RUNNERS.has(tool)) return true;
  if ((tool === "bun" || tool === "cargo" || tool === "go") && arg === "test") return true;
  return (tool === "python" || tool === "python3") && arg === "-m" && words[2] === "pytest";
}

function scriptDirectories(words: readonly string[], cwd: string, seen: ReadonlySet<string>): string[] {
  const script = scriptName(words);
  if (!script || seen.has(`${cwd}:${script}`)) return [];
  const value = scriptsAt(cwd)[script];
  if (typeof value === "string") return testDirectories(value, cwd, new Set([...seen, `${cwd}:${script}`]));
  return /^(?:test|test:.*|mutate|mutate:.*)$/.test(script) ? [cwd] : [];
}

function testDirectories(command: string, cwd: string, seen: ReadonlySet<string> = new Set()): string[] {
  let at = cwd;
  const found: string[] = [];
  for (const words of simpleCommands(command)) {
    if (words[0] === "cd" && words[1] !== undefined) {
      at = resolve(at, words[1]);
      continue;
    }
    if (words.includes("--help") || words.includes("--version")) continue;
    if (directRunner(words)) found.push(at);
    else found.push(...scriptDirectories(words, at, seen));
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
  if (hook !== "PreToolUse") return undefined;
  const input = payload.tool_input;
  const command = input?.command ?? input?.cmd;
  if (typeof command !== "string" || !["Bash", "shell", "shell_command", "exec_command"].includes(payload.tool_name ?? "")) return undefined;
  const cwd = typeof input?.workdir === "string" ? resolve(payload.cwd ?? process.cwd(), input.workdir) : payload.cwd ?? process.cwd();
  const refusal = refuseLocalTests(command, cwd);
  return refusal === undefined ? undefined : JSON.stringify({ hookSpecificOutput: { hookEventName: hook, permissionDecision: "deny", permissionDecisionReason: refusal } });
}

export function refuseLocalTests(command: string, cwd: string): string | undefined {
  if (process.env.CI === "true") return undefined;
  for (const at of testDirectories(command, cwd)) {
    const root = rootOf(at);
    const own = dirname(realpathSync(fileURLToPath(import.meta.url)));
    const bin = binFrom(root) ?? binFrom(own);
    if (bin === undefined) return UNKNOWN;
    const setting = spawnSync(bin, [], { cwd: root, encoding: "utf8", timeout: 4_000, env: process.env });
    if (setting.status !== 0) return UNKNOWN;
    if (setting.stdout.trim() === "blocked") return REFUSAL;
    if (setting.stdout.trim() !== "allowed") return UNKNOWN;
  }
  return undefined;
}
