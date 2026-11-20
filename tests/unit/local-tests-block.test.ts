import { afterAll, afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { LOCAL_TESTS_LINE, refuseLocalTests, runsTests } from "../../harness/local-tests/local-tests";
import { bashCall } from "../../src/dispatcher/pi-bash";

const root = mkdtempSync(join(tmpdir(), "skills-local-tests-"));
const { refusedTests } = await import("../../src/dispatcher/hook-harness");
const ci = process.env.CI;

afterEach(() => {
  if (ci === undefined) delete process.env.CI;
  else process.env.CI = ci;
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

function repoWith(name: string, agentTests: Record<string, unknown>): string {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, ".skills.json"), JSON.stringify({ agentTests }));
  return dir;
}

test.each(["bun test --watch", "npm run test:unit", "bunx vitest", "npx playwright test", "go test ./...", "python -m pytest"])(
  "recognises %s instead of allowing a test runner",
  (command) => expect(runsTests(command, root)).toBe(true),
);

test.each(["bun run build", "bun run lint", "bun run typecheck", "bin/lint", "npx playwright install", "echo bun test", 'for f in a; do echo "$f"; done', "if true; then echo hi; fi", "seq 3 | xargs -n 1 echo"])(
  "leaves %s available rather than blocking a non-test command",
  (command) => expect(runsTests(command, root)).toBe(false),
);

test("recognises configured commands only in their repository instead of treating them as built-in", () => {
  const configured = join(root, "configured");
  const other = join(root, "other");
  mkdirSync(configured, { recursive: true });
  mkdirSync(other, { recursive: true });
  writeFileSync(join(configured, ".skills.json"), JSON.stringify({ agentTests: { testCommands: ["custom-runner"] } }));
  writeFileSync(join(configured, "package.json"), JSON.stringify({ scripts: { verify: "custom-runner --all" } }));
  expect(runsTests("custom-runner", configured)).toBe(true);
  expect(runsTests("bunx custom-runner", configured)).toBe(true);
  expect(runsTests("bun run verify", configured)).toBe(true);
  expect(runsTests("custom-runner", other)).toBe(false);
});

test("follows a package script instead of allowing a renamed test command", () => {
  writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { verify: "bun run unit", unit: "bun test" } }));
  expect(runsTests("bun run verify", root)).toBe(true);
});

test.each([
  "bash -c 'bun test'",
  "pnpm vitest run",
  "yarn jest",
  "bun --cwd sub test",
  "npm --prefix sub test",
  "pnpm -C sub test",
  "pnpm --filter app test",
  "bun run --filter '*' test",
  "node --test",
  "npm t",
  "npm exec vitest run",
  "uv run pytest",
  "uv run --group dev pytest",
  "python -m unittest",
  "bash -lc 'bun test'",
  "npm -w app test",
  "yarn workspace app test",
  "uv run --with x pytest",
  "bun run vitest",
  'for f in a b; do bun test "$f"; done',
  "if true; then bun test; fi",
  "{ bun test; }",
  "! bun test",
  "eval bun test",
  'eval "bun test"',
  'eval \'cd x && bun test\'',
  'command eval "bun test"',
  'exec eval "bun test"',
  'xargs eval "bun test"',
  "exec bun test",
  "command bun test",
  "xargs -a args.txt bun test",
  "git ls-files '*.test.ts' | xargs bun test",
  "deno test",
  "poetry run pytest",
  "pnpm -w test",
  "pnpm -w vitest run",
])("blocks %s instead of missing a common test spelling", (command) => {
  const shapes = join(root, "shapes");
  mkdirSync(shapes, { recursive: true });
  expect(runsTests(command, shapes)).toBe(true);
});

test("honours a directory flag instead of reading scripts from the wrong directory", () => {
  delete process.env.CI;
  const flagged = join(root, "flagged");
  mkdirSync(flagged, { recursive: true });
  const sub = join(flagged, "sub");
  mkdirSync(sub, { recursive: true });
  writeFileSync(join(sub, "package.json"), JSON.stringify({ scripts: { verify: "bun test" } }));
  writeFileSync(join(flagged, "package.json"), JSON.stringify({ scripts: { verify: "tsc --noEmit" } }));
  mkdirSync(join(sub, "sub"), { recursive: true });
  writeFileSync(join(sub, "sub", "package.json"), JSON.stringify({ scripts: { verify: "tsc --noEmit" } }));
  expect(runsTests("npm --prefix sub run verify", flagged)).toBe(true);
  expect(runsTests("bun --cwd sub run verify", flagged)).toBe(true);
  expect(runsTests("pnpm -C sub verify", flagged)).toBe(true);
  expect(runsTests("env -C sub bun run verify", flagged)).toBe(true);
  expect(runsTests("FOO=1 env -C sub bun run verify", flagged)).toBe(true);
  expect(runsTests("time env -C sub bun run verify", flagged)).toBe(true);
  const savedHome = process.env.HOME;
  process.env.HOME = flagged;
  expect(runsTests("cd ~/sub && bun run verify", flagged)).toBe(true);
  if (savedHome === undefined) delete process.env.HOME;
  else process.env.HOME = savedHome;
  expect(runsTests("FOO=1 npm --prefix sub run verify", flagged)).toBe(true);
  expect(runsTests("time bun --cwd sub run verify", flagged)).toBe(true);
  expect(runsTests("bun run --cwd sub verify", flagged)).toBe(true);
  expect(runsTests("pnpm run --dir sub verify", flagged)).toBe(true);
  expect(runsTests("npm run verify --prefix sub", flagged)).toBe(true);
  const deep = join(sub, "deep");
  mkdirSync(deep, { recursive: true });
  expect(runsTests("bun run verify", deep)).toBe(true);
  expect(refuseLocalTests("npm --prefix sub run verify", flagged)).toContain("CI is the test run");
});

test("applies a leading directory flag once instead of resolving past the package", () => {
  delete process.env.CI;
  const repo = join(root, "repo");
  const sub = join(repo, "sub");
  mkdirSync(sub, { recursive: true });
  writeFileSync(join(repo, "package.json"), JSON.stringify({ scripts: { t: "bun test" } }));
  expect(runsTests("bun --cwd .. run t", sub)).toBe(true);
  expect(runsTests("npm --prefix .. run t", sub)).toBe(true);
  expect(runsTests("eval bun --cwd .. run t", sub)).toBe(true);
});

test("reads the package the directory flag names instead of one level deeper", () => {
  delete process.env.CI;
  const once = join(root, "once");
  const sub = join(once, "sub");
  mkdirSync(join(sub, "sub"), { recursive: true });
  writeFileSync(join(sub, "package.json"), JSON.stringify({ scripts: { t: "bun test" } }));
  writeFileSync(join(sub, "sub", "package.json"), JSON.stringify({ scripts: { t: "tsc --noEmit" } }));
  expect(runsTests("bun --cwd sub run t", once)).toBe(true);
  expect(runsTests("eval bun --cwd sub run t", once)).toBe(true);
});

test("runs a script body with its package root instead of the caller directory", () => {
  delete process.env.CI;
  const inner = join(root, "outer", "pkg", "inner");
  mkdirSync(inner, { recursive: true });
  mkdirSync(join(root, "outer", "pkg", "sub"), { recursive: true });
  writeFileSync(join(root, "outer", "pkg", "package.json"), JSON.stringify({ scripts: { down: "cd sub && bun test" } }));
  expect(runsTests("bun run down", inner)).toBe(true);
});

test("blocks bun shorthand instead of missing a script without run", () => {
  delete process.env.CI;
  const shorthand = join(root, "shorthand");
  mkdirSync(shorthand, { recursive: true });
  writeFileSync(join(shorthand, "package.json"), JSON.stringify({ scripts: { "test:unit": "bun test", verify: "bun test" } }));
  expect(runsTests("bun test:unit", shorthand)).toBe(true);
  expect(runsTests("bun verify", shorthand)).toBe(true);
});

test("leaves check scripts available instead of refusing their test-like names", () => {
  delete process.env.CI;
  const checks = join(root, "checks");
  mkdirSync(checks, { recursive: true });
  writeFileSync(join(checks, ".skills.json"), JSON.stringify({ agentTests: { notTestCommands: ["custom-lint"] } }));
  writeFileSync(join(checks, "package.json"), JSON.stringify({ scripts: {
    "test:types": "tsc --noEmit",
    "test:lint": "eslint .",
    "test:strict": "effect-tsgo --noEmit",
    "test:css": "stylelint src",
    "test:vue": "vue-tsc --noEmit",
    "test:smoke": "tsgo --noEmit",
    lint: "oxlint && custom-lint",
    "test:via": "bun run lint",
    "test:all": "bun run test:types",
    build: "bun test",
  } }));
  expect(runsTests("npm run test:types", checks)).toBe(false);
  expect(runsTests("bun run test:lint", checks)).toBe(false);
  expect(runsTests("bun run test:strict", checks)).toBe(false);
  expect(runsTests("bun run test:css", checks)).toBe(false);
  expect(runsTests("bun run test:vue", checks)).toBe(false);
  expect(runsTests("bun run test:smoke", checks)).toBe(false);
  expect(runsTests("bun run test:via", checks)).toBe(false);
  expect(runsTests("bun run test:all", checks)).toBe(true);
  expect(runsTests("bun build", checks)).toBe(false);
  expect(refuseLocalTests("npm run test:types", checks)).toBeUndefined();
  expect(refuseLocalTests("bun run test:via", checks)).toBeUndefined();
  rmSync(join(checks, ".skills.json"));
  expect(runsTests("bun run test:via", checks)).toBe(true);
});

test("blocks a test-named script instead of trusting an unrecognised body", () => {
  delete process.env.CI;
  const named = join(root, "named");
  mkdirSync(named, { recursive: true });
  writeFileSync(join(named, "package.json"), JSON.stringify({ scripts: { test: "turbo run test", "test:ci": "node scripts/run-tests.mjs", "test:mixed": "tsc --noEmit && node scripts/run-tests.mjs", "test:checks": "tsc --noEmit && eslint ." } }));
  expect(runsTests("npm test", named)).toBe(true);
  expect(runsTests("bun run test", named)).toBe(true);
  expect(runsTests("bun run test:ci", named)).toBe(true);
  expect(runsTests("bun run test:mixed", named)).toBe(true);
  expect(runsTests("bun run test:checks", named)).toBe(false);
});

test("blocks a workspace fan-out instead of trusting a recursive test script", () => {
  const mono = join(root, "mono");
  mkdirSync(mono, { recursive: true });
  writeFileSync(join(mono, "package.json"), JSON.stringify({ scripts: { test: "pnpm -r test" } }));
  expect(runsTests("pnpm test", mono)).toBe(true);
});

const evalScripts = { sweep: "vitest run --config evals/vitest.config.ts --configLoader runner" };

test("allows an eval script in a repository that names its evals config instead of blocking the documented local sweep", () => {
  delete process.env.CI;
  const sweep = repoWith("sweep", { evalConfigs: ["evals/vitest.config.ts"] });
  writeFileSync(join(sweep, "package.json"), JSON.stringify({ scripts: evalScripts }));
  expect(runsTests("bun run sweep", sweep)).toBe(false);
  expect(refuseLocalTests("bun run sweep", sweep)).toBeUndefined();
});

test("blocks an eval script in a repository that does not name its evals config instead of exempting every vitest run", () => {
  delete process.env.CI;
  const plain = repoWith("plain-sweep", {});
  writeFileSync(join(plain, "package.json"), JSON.stringify({ scripts: evalScripts }));
  expect(refuseLocalTests("bun run sweep", plain)).toContain("CI is the test run");
});

test("allows a vitest run on an evals config only in the repository that names it instead of on any config", () => {
  const named = repoWith("named-evals", { evalConfigs: ["evals/vitest.config.ts"] });
  expect(runsTests("vitest run --config evals/vitest.config.ts", named)).toBe(false);
  expect(runsTests("vitest run -c ./evals/vitest.config.ts", named)).toBe(false);
  expect(runsTests("vitest run --config=evals/vitest.config.ts", named)).toBe(false);
  expect(runsTests("vitest run --config other.config.ts", named)).toBe(true);
  expect(runsTests("vitest run --config evals/vitest.config.ts", repoWith("unnamed-evals", {}))).toBe(true);
});

test("does not block bin/fm-test-run.sh in a repository that does not name it instead of keeping the built-in name", () => {
  delete process.env.CI;
  const unnamed = repoWith("unnamed-script", {});
  expect(refuseLocalTests("bin/fm-test-run.sh", unnamed)).toBeUndefined();
  expect(refuseLocalTests("sh bin/worker.test.sh", unnamed)).toBeUndefined();
});

test("blocks a script path the repository names in agentTests.testScripts instead of only the built-in shapes", () => {
  delete process.env.CI;
  const scripted = repoWith("named-script", { testScripts: ["bin/fm-test-run.sh", "bin/*.test.sh"] });
  expect(refuseLocalTests("bin/fm-test-run.sh", scripted)).toContain("CI is the test run");
  expect(refuseLocalTests("bin/fm-test-run.sh --watch", scripted)).toContain("CI is the test run");
  expect(refuseLocalTests("sh bin/worker.test.sh", scripted)).toContain("CI is the test run");
  expect(refuseLocalTests("bin/lint.sh", scripted)).toBeUndefined();
  expect(refuseLocalTests("bin/sub/worker.test.sh", scripted)).toBeUndefined();
});

test("keeps this repository's own names blocked through its .skills.json instead of the shared code", () => {
  delete process.env.CI;
  const repo = fileURLToPath(new URL("../../", import.meta.url));
  expect(refuseLocalTests("bin/fm-test-run.sh", repo)).toContain("CI is the test run");
  expect(refuseLocalTests("sh bin/worker.test.sh", repo)).toContain("CI is the test run");
  expect(refuseLocalTests("vitest run --config evals/vitest.config.ts", repo)).toBeUndefined();
  expect(refuseLocalTests("bun run eval", repo)).toBeUndefined();
});

test("checks the target repository instead of allowing a script that changes directory", () => {
  delete process.env.CI;
  const allowed = join(root, "allowed");
  const blocked = join(root, "blocked");
  mkdirSync(allowed, { recursive: true });
  mkdirSync(blocked, { recursive: true });
  writeFileSync(join(allowed, ".skills.json"), JSON.stringify({ agentTests: { allowLocal: true } }));
  writeFileSync(join(allowed, "package.json"), JSON.stringify({ scripts: { cross: "cd ../blocked && bun test" } }));
  expect(refuseLocalTests("bun run cross", allowed)).toContain("agentTests.allowLocal");
});

test("refuses local test commands instead of treating a missing setting as permission", () => {
  delete process.env.CI;
  expect(refuseLocalTests("bun test", root)).toContain("agentTests.allowLocal");
  expect(refuseLocalTests("bun test", repoWith("default", {}))).toContain("agentTests.allowLocal");
});

test("respects agentTests.allowLocal instead of always refusing tests", () => {
  delete process.env.CI;
  expect(refuseLocalTests("bun test", repoWith("explicit-allow", { allowLocal: true }))).toBeUndefined();
});

test("inverts a legacy blocked: false instead of treating it as a refusal", () => {
  delete process.env.CI;
  const dir = join(root, "legacy-allow");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, ".skills.json"), JSON.stringify({ localTests: { blocked: false } }));
  expect(refuseLocalTests("bun test", dir)).toBeUndefined();
});

test("names a non-boolean allowLocal rather than coercing it or treating it as absent", () => {
  delete process.env.CI;
  const dir = repoWith("wrong-allow", { allowLocal: "no" });
  expect(refuseLocalTests("bun test", dir)).toBe(`${join(dir, ".skills.json")}: agentTests.allowLocal must be a boolean.`);
});

test("names a misspelled key rather than running a command against invalid settings", () => {
  delete process.env.CI;
  const dir = repoWith("typo", { testComands: ["example-runner"] });
  expect(refuseLocalTests("bun test", dir)).toContain("unknown key: agentTests.testComands");
  expect(refuseLocalTests("git status", dir)).toBeUndefined();
});

test("still refuses a configured runner when another key is bad instead of failing open", () => {
  delete process.env.CI;
  const dir = repoWith("bad-allow-custom", { allowLocal: "no", testCommands: ["example-runner"] });
  expect(refuseLocalTests("example-runner", dir)).toBe(`${join(dir, ".skills.json")}: agentTests.allowLocal must be a boolean.`);
});

test("pi refuses a nested bash call instead of sending it to the queue", () => {
  delete process.env.CI;
  const event = { type: "tool_call", toolName: "bash", toolCallId: "parent/1", parentToolCallId: "parent", input: { command: "bun test" } } as const;
  const clock = new Map();
  const lines: string[] = [];
  expect(bashCall(clock, event, root, (line) => { lines.push(line); })).toEqual({ block: true, reason: expect.stringContaining("agentTests.allowLocal") });
  expect(clock.size).toBe(0);
  expect(lines).toContain(LOCAL_TESTS_LINE);
});

test("the hook ignores a foreign tool instead of refusing outside its shape", () => {
  delete process.env.CI;
  expect(refusedTests("PreToolUse", { tool_name: "exec_command", tool_input: { command: "bun test" }, cwd: root })).toBeUndefined();
});

test("lets CI run tests instead of applying the local block", () => {
  process.env.CI = "true";
  expect(refuseLocalTests("bun test", root)).toBeUndefined();
});
