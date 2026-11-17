import { afterAll, afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LOCAL_TESTS_LINE, refuseLocalTests, runsTests } from "../../harness/local-tests/local-tests";
import { bashCall } from "../../src/dispatcher/pi-bash";

const root = mkdtempSync(join(tmpdir(), "skills-local-tests-"));
process.env.XDG_STATE_HOME = join(root, "state");
const { refusedTests } = await import("../../src/dispatcher/hook-harness");
const ci = process.env.CI;

afterEach(() => {
  if (ci === undefined) delete process.env.CI;
  else process.env.CI = ci;
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

test.each(["bun test --watch", "npm run test:unit", "bunx checks-browser", "npx playwright test", "go test ./...", "python -m pytest"])(
  "recognises %s instead of allowing a test runner",
  (command) => expect(runsTests(command, root)).toBe(true),
);

test.each(["bun run build", "bun run lint", "bun run typecheck", "bin/lint", "npx playwright install", "echo bun test"])(
  "leaves %s available rather than blocking a non-test command",
  (command) => expect(runsTests(command, root)).toBe(false),
);

test("follows a package script instead of allowing a renamed test command", () => {
  writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { verify: "bun run unit", unit: "bun test" } }));
  expect(runsTests("bun run verify", root)).toBe(true);
});

test.each([
  "bin/fm-test-run.sh",
  "sh bin/worker.test.sh",
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
])("blocks %s instead of missing a common test spelling", (command) => {
  const shapes = join(root, "shapes");
  mkdirSync(shapes, { recursive: true });
  expect(runsTests(command, shapes)).toBe(true);
});

test("blocks a workspace fan-out instead of trusting a recursive test script", () => {
  const mono = join(root, "mono");
  mkdirSync(mono, { recursive: true });
  writeFileSync(join(mono, "package.json"), JSON.stringify({ scripts: { test: "pnpm -r test" } }));
  expect(runsTests("pnpm test", mono)).toBe(true);
});

test("allows an eval script instead of blocking the documented local sweep", () => {
  delete process.env.CI;
  const sweep = join(root, "sweep");
  mkdirSync(sweep, { recursive: true });
  writeFileSync(join(sweep, "package.json"), JSON.stringify({ scripts: { eval: "vitest run --config evals/vitest.config.ts --configLoader runner" } }));
  expect(runsTests("bun run eval", sweep)).toBe(false);
  expect(refuseLocalTests("bun run eval", sweep)).toBeUndefined();
});

test("allows the evals config instead of treating a sweep as a test run", () => {
  expect(runsTests("vitest run --config evals/vitest.config.ts", root)).toBe(false);
});

test("checks the target repository instead of allowing a script that changes directory", () => {
  delete process.env.CI;
  const allowed = join(root, "allowed");
  const blocked = join(root, "blocked");
  mkdirSync(allowed, { recursive: true });
  mkdirSync(blocked, { recursive: true });
  writeFileSync(join(allowed, "checks.config.ts"), 'export default { localTests: "allowed" };\n');
  writeFileSync(join(allowed, "package.json"), JSON.stringify({ scripts: { cross: "cd ../blocked && bun test" } }));
  expect(refuseLocalTests("bun run cross", allowed)).toContain("localTests is blocked");
});

test("uses the kit default instead of allowing tests when the setting is absent", () => {
  delete process.env.CI;
  rmSync(join(root, "checks.config.ts"), { force: true });
  expect(refuseLocalTests("bun test", root)).toContain("localTests is blocked");
  expect(refuseLocalTests("bun test", root)).toContain("CI is the test run");
});

test("respects localTests allowed instead of refusing the repository's tests", () => {
  delete process.env.CI;
  writeFileSync(join(root, "checks.config.ts"), 'export default { localTests: "allowed" };\n');
  expect(refuseLocalTests("bun test", root)).toBeUndefined();
});

test("pi refuses a nested bash call instead of sending it to the queue", () => {
  delete process.env.CI;
  rmSync(join(root, "checks.config.ts"), { force: true });
  const event = { type: "tool_call", toolName: "bash", toolCallId: "parent/1", parentToolCallId: "parent", input: { command: "bun test" } } as const;
  const clock = new Map();
  const lines: string[] = [];
  expect(bashCall(clock, event, root, (line) => { lines.push(line); })).toEqual({ block: true, reason: expect.stringContaining("localTests is blocked") });
  expect(clock.size).toBe(0);
  expect(lines).toContain(LOCAL_TESTS_LINE);
});

test("Bash hook denies a test command before execution", () => {
  delete process.env.CI;
  rmSync(join(root, "checks.config.ts"), { force: true });
  const reply = refusedTests("PreToolUse", { tool_name: "Bash", tool_input: { command: "bun test" }, cwd: root });
  expect(reply).toContain('"permissionDecision":"deny"');
  expect(reply).toContain("localTests is blocked");
});

test("the hook denial lands in the dispatch log instead of vanishing", () => {
  delete process.env.CI;
  rmSync(join(root, "checks.config.ts"), { force: true });
  refusedTests("PreToolUse", { tool_name: "Bash", tool_input: { command: "bun test" }, cwd: root, session_id: "local-tests-log" });
  expect(readFileSync(join(root, "state", "skills", "dispatch.log"), "utf8")).toContain(LOCAL_TESTS_LINE);
});

test("the hook ignores a foreign tool instead of refusing outside its shape", () => {
  delete process.env.CI;
  expect(refusedTests("PreToolUse", { tool_name: "exec_command", tool_input: { command: "bun test" }, cwd: root })).toBeUndefined();
});

test("lets CI run tests instead of applying the local block", () => {
  process.env.CI = "true";
  expect(refuseLocalTests("bun test", root)).toBeUndefined();
});
