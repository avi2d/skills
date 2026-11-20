import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { compileGlob, expandHome, flagDir, hasConfig, program, SCRIPT_RUNNERS, segments, skipFlags, stripped, texts } from "./shell-commands";

import { readSkillsSettings, SETTINGS_FILE } from "./project-settings";

export const LOCAL_TESTS_LINE = "local-tests: refused a test command";

const REFUSAL = `Local agent tests are blocked. To allow them, set agentTests.allowLocal to true in ${SETTINGS_FILE}. CI is the test run.`;
const RUNNERS = new Set(["pytest", "vitest", "jest", "playwright", "mocha", "ava", "tap", "stryker"]);
const PACKAGES = new Set(["npm", "pnpm", "yarn", "bun"]);



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

function packageDir(words: readonly string[], cwd: string): string {
  const dash = words.indexOf("--");
  const scoped = dash === -1 ? words.slice(1) : words.slice(1, dash);
  const here = flagDir(scoped, cwd, words[0] ?? "", true);
  let at = here;
  for (;;) {
    if (existsSync(join(at, "package.json"))) return at;
    const parent = dirname(at);
    if (parent === at) return here;
    at = parent;
  }
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

function playwrightTarget(tool: string, arg: string): boolean {
  if (tool !== "playwright" && tool !== "stryker") return false;
  return arg === "test" || (tool === "stryker" && arg === "run");
}
function bunLikeTool(tool: string): boolean {
  return tool === "bun" || tool === "cargo" || tool === "deno" || tool === "go";
}
function pythonTool(tool: string): boolean {
  return tool === "python" || tool === "python3";
}
function pythonModuleTest(words: readonly string[]): boolean {
  for (let at = 1; at < words.length - 1; at += 1) {
    if (words[at] === "-m" && (words[at + 1] === "pytest" || words[at + 1] === "unittest")) return true;
  }
  return false;
}
type Scan = { seen: Set<string>; roots: Map<string, string>; skills: Map<string, ReturnType<typeof readSkillsSettings>> };

function freshScan(seen: ReadonlySet<string> = new Set()): Scan {
  return { seen: new Set(seen), roots: new Map(), skills: new Map() };
}

function childScan(scan: Scan, key: string): Scan {
  return { seen: new Set([...scan.seen, key]), roots: scan.roots, skills: scan.skills };
}

function cachedRoot(cwd: string, scan: Scan): string {
  const hit = scan.roots.get(cwd);
  if (hit !== undefined) return hit;
  const root = rootOf(cwd);
  scan.roots.set(cwd, root);
  return root;
}

function cachedSkills(root: string, scan: Scan): ReturnType<typeof readSkillsSettings> {
  if (scan.skills.has(root)) return scan.skills.get(root);
  const read = readSkillsSettings(root);
  scan.skills.set(root, read);
  return read;
}

function agentTestsAt(root: string, scan: Scan) {
  const read = cachedSkills(root, scan);
  return read && "settings" in read ? read.settings.agentTests : undefined;
}

type ListKey = Exclude<keyof NonNullable<ReturnType<typeof agentTestsAt>>, "allowLocal">;

function lenientAt(root: string, scan: Scan, key: "testCommands" | "testScripts"): string[] {
  const read = cachedSkills(root, scan);
  return read !== undefined && "unreadable" in read ? read.lenient?.[key] ?? [] : [];
}

function listAt(root: string, scan: Scan, key: ListKey): string[] {
  const live = agentTestsAt(root, scan)?.[key];
  if (live !== undefined) return live;
  if (key === "testCommands" || key === "testScripts") return lenientAt(root, scan, key);
  return [];
}

function pathsAt(root: string, scan: Scan, key: "testScripts" | "evalConfigs"): RegExp[] {
  return listAt(root, scan, key).flatMap((glob) => {
    try {
      return [compileGlob(`**/${glob}`)];
    } catch {
      return [];
    }
  });
}

function extraAt(root: string, scan: Scan): string[] {
  return listAt(root, scan, "testCommands");
}

function uvDelegated(words: readonly string[], tool: string, cwd: string, scan: Scan): boolean | undefined {
  if (tool === "uvx") {
    const rest = words.slice(skipFlags(words, 1));
    return rest.length > 0 && directRunner(rest, cwd, scan);
  }
  if (tool !== "uv" && tool !== "poetry") return undefined;
  const at = skipFlags(words, 1);
  if (words[at] !== "run") return false;
  const rest = words.slice(skipFlags(words, at + 1));
  return rest.length > 0 && directRunner(rest, cwd, scan);
}
function directRunner(words: readonly string[], cwd: string, scan: Scan): boolean {
  const tool = words[0] ?? "";
  if (tool === "playwright" || tool === "stryker") return playwrightTarget(tool, words[1] ?? "");
  if (tool === "vitest" && hasConfig(words.slice(1), pathsAt(cachedRoot(cwd, scan), scan, "evalConfigs"))) return false;
  if (RUNNERS.has(tool)) return true;
  if (bunLikeTool(tool)) return (words[skipFlags(words, 1)] ?? "") === "test";
  if (tool === "node") return words.slice(1).includes("--test");
  if (pythonTool(tool)) return pythonModuleTest(words);
  const delegated = uvDelegated(words, tool, cwd, scan);
  if (delegated !== undefined) return delegated;
  return extraAt(cachedRoot(cwd, scan), scan).includes(tool);
}

function managerRunner(words: readonly string[], cwd: string, scan: Scan): boolean {
  const tool = words[0] ?? "";
  if (!PACKAGES.has(tool)) return false;
  const at = skipFlags(words, 1);
  const head = words[at] ?? "";
  if (head === "" || head === "run" || head === "run-script") return false;
  return directRunner([head, ...words.slice(at + 1)], cwd, scan);
}

const BUN_COMMANDS = new Set("add audit build bump create deploy init install link login logout migrate outdated patch pm publish remove run test uninstall unlink update upgrade whoami why info x i a r rm un v view".split(" "));

const TEST_SCRIPT = /^(?:test|test:.*|mutate|mutate:.*)$/;

const CHECK_TOOLS = new Set([
  "tsc", "tsgo", "effect-tsgo", "vue-tsc", "eslint", "stylelint", "oxlint", "biome", "prettier",
]);

function checksBody(body: string, cwd: string, scan: Scan): boolean {
  const listed = segments(body);
  if (listed.length === 0) return false;
  const checks = listAt(cachedRoot(cwd, scan), scan, "notTestCommands");
  return listed.every((segment) => {
    const words = commandWords(texts(segment)).map((word, at) => (at === 0 ? program(word) : word));
    const head = words[0];
    if (CHECK_TOOLS.has(head ?? "") || (head !== undefined && checks.includes(head))) return true;
    const { name } = scriptCall(words);
    if (name === undefined || name === "eval" || TEST_SCRIPT.test(name)) return false;
    const home = packageDir(words, cwd);
    const key = home + ":" + name;
    if (scan.seen.has(key)) return false;
    const script = scriptsAt(home)[name];
    if (typeof script !== "string") return false;
    return checksBody(script, home, childScan(scan, key));
  });
}

function scriptDirectories(words: readonly string[], cwd: string, scan: Scan): string[] {
  const { name: script, rest } = scriptCall(words);
  if (!script || script === "eval") return [];
  const home = packageDir(words, cwd);
  const key = home + ":" + script;
  if (scan.seen.has(key)) {
    if (!TEST_SCRIPT.test(script)) return [];
    const value = scriptsAt(home)[script];
    if (typeof value === "string" && checksBody(value, home, scan)) return [];
    return [home];
  }
  const value = scriptsAt(home)[script];
  if (typeof value === "string") {
    const depth = childScan(scan, key);
    const inner = testDirectories(value, home, depth);
    if (inner.length > 0) return inner;
    if (checksBody(value, home, depth)) return [];
  }
  if (directRunner([script, ...rest], home, scan)) return [home];
  return TEST_SCRIPT.test(script) ? [home] : [];
}

function isTestScript(bare: readonly string[], scripts: readonly RegExp[]): boolean {
  const [head = "", ...rest] = bare;
  const through = SCRIPT_RUNNERS.has(program(head)) ? rest : bare;
  const [first = ""] = through;
  if (first === "") return false;
  return scripts.some((script) => script.test(first));
}

const SHELLS = new Set(["sh", "bash", "dash", "zsh"]);

const SHELL_TEXT = new Set(["eval", "source", ".", "exec", "command"]);

const XARGS_VALUES = new Set([
  "-a", "--arg-file", "-d", "--delimiter", "-E", "--eof", "-I", "--replace",
  "-L", "--max-lines", "-n", "--max-args", "-P", "--max-procs", "-s", "--max-chars",
  "--process-slot-var",
]);

function pastXargs(words: readonly string[]): string[] {
  for (let at = 1; at < words.length; at += 1) {
    const word = words[at] ?? "";
    if (word === "--") return words.slice(at + 1);
    if (!word.startsWith("-") || word.length === 1) return words.slice(at);
    if (XARGS_VALUES.has(word)) at += 1;
  }
  return [];
}

function stripStep(rest: readonly string[]): string[] | undefined {
  const [head = "", ...tail] = rest;
  if (SHELL_TEXT.has(head)) return stripped(tail);
  if (program(head) === "xargs") return stripped(pastXargs(rest));
  return undefined;
}

function commandWords(raw: readonly string[]): string[] {
  let rest = stripped(raw);
  for (;;) {
    if (rest.length === 0) return rest;
    const next = stripStep(rest);
    if (next === undefined) return rest;
    rest = next;
  }
}

function evalSplit(raw: readonly string[]): { before: string[]; after: string[] } | undefined {
  let rest = stripped(raw);
  for (;;) {
    if (rest.length < 2) return undefined;
    const [head = ""] = rest;
    if (program(head) === "eval") return { before: raw.slice(0, raw.length - rest.length), after: rest.slice(1) };
    const next = stripStep(rest);
    if (next === undefined) return undefined;
    rest = next;
  }
}

function shellNested(words: readonly string[], here: string, scan: Scan): string[] | undefined {
  if (!SHELLS.has(words[0] ?? "")) return undefined;
  const flag = words.findIndex((word) => /^-[^-]*c[^-]*$/.test(word));
  if (flag === -1) return undefined;
  const nested = words[flag + 1];
  if (nested === undefined) return [];
  return testDirectories(nested, here, scan);
}
function wordDirs(words: readonly string[], bare: readonly string[], base: string, here: string, scan: Scan): string[] {
  if (scriptCall(words).name === "eval") return [];
  if (directRunner(words, here, scan)) return [here];
  if (managerRunner(words, here, scan)) return [here];
  if (isTestScript(bare, pathsAt(cachedRoot(here, scan), scan, "testScripts"))) return [here];
  return scriptDirectories(words, base, scan);
}
function testDirectories(command: string, cwd: string, scan: Scan = freshScan()): string[] {
  let dir = cwd;
  const found: string[] = [];
  for (const listed of segments(command)) {
    const raw = texts(listed);
    const split = evalSplit(raw);
    if (split !== undefined) {
      found.push(...testDirectories(split.after.join(" "), flagDir(split.before, dir, "", true), scan));
      continue;
    }
    const bare = commandWords(raw);
    const words = bare.map((word, at) => (at === 0 ? program(word) : word));
    if (words[0] === "cd" && words[1] !== undefined) {
      dir = resolve(dir, expandHome(words[1]));
      continue;
    }
    if (words.includes("--help") || words.includes("--version")) continue;
    const prefix = raw.slice(0, raw.length - bare.length);
    const base = flagDir(prefix, dir, "", true);
    const here = flagDir(words, base, words[0] ?? "");
    const shelled = shellNested(words, here, scan);
    if (shelled !== undefined) {
      found.push(...shelled);
      continue;
    }
    found.push(...wordDirs(words, bare, base, here, scan));
  }
  return found;
}

export function runsTests(command: string, cwd: string, seen: ReadonlySet<string> = new Set()): boolean {
  return testDirectories(command, cwd, freshScan(seen)).length > 0;
}

function rootOf(cwd: string): string {
  const git = spawnSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], { encoding: "utf8", timeout: 3_000 });
  return git.status === 0 ? git.stdout.trim() : cwd;
}



type HookPayload = { cwd?: string; tool_name?: string; tool_input?: Record<string, unknown> };

export function refusedTests(hook: string, payload: HookPayload, note?: (line: string) => void): string | undefined {
  if (hook !== "PreToolUse" || payload.tool_name !== "Bash") return undefined;
  const command = payload.tool_input?.command;
  if (typeof command !== "string") return undefined;
  const refusal = refuseLocalTests(command, payload.cwd ?? process.cwd(), note);
  return refusal === undefined ? undefined : JSON.stringify({ hookSpecificOutput: { hookEventName: hook, permissionDecision: "deny", permissionDecisionReason: refusal } });
}

export function refuseLocalTests(command: string, cwd: string, note?: (line: string) => void): string | undefined {
  if (process.env.CI === "true") return undefined;
  const scan = freshScan();
  const roots = new Set(testDirectories(command, cwd, scan).map((dir) => cachedRoot(dir, scan)));
  if (roots.size === 0) return undefined;
  const tested = [...roots].map((root) => cachedSkills(root, scan));
  for (const read of tested) {
    if (read !== undefined && "unreadable" in read) {
      const reason = `${read.path}: ${read.unreadable}.`;
      note?.(`local-tests: ${reason}`);
      return reason;
    }
  }
  for (const read of tested) {
    if (read !== undefined && "settings" in read && read.migration !== undefined) note?.(read.migration);
  }
  const blocked = tested.some((read) => read === undefined || !("settings" in read) || !read.settings.agentTests.allowLocal);
  if (!blocked) return undefined;
  note?.(LOCAL_TESTS_LINE);
  return REFUSAL;
}
