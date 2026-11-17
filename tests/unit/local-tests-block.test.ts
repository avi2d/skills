import { afterAll, afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { refuseLocalTests, runsTests } from "../../harness/local-tests/local-tests";
import { refusedTests } from "../../src/dispatcher/local-tests";
import { bashCall } from "../../src/dispatcher/pi-bash";

const root = mkdtempSync(join(tmpdir(), "skills-local-tests-"));
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

test.each(["bun run build", "bun run lint", "bun run typecheck", "npx playwright install", "echo bun test"])(
  "leaves %s available rather than blocking a non-test command",
  (command) => expect(runsTests(command, root)).toBe(false),
);

test("follows a package script instead of allowing a renamed test command", () => {
  writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { verify: "bun run unit", unit: "bun test" } }));
  expect(runsTests("bun run verify", root)).toBe(true);
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
  expect(bashCall(clock, event, root, () => {})).toEqual({ block: true, reason: expect.stringContaining("localTests is blocked") });
  expect(clock.size).toBe(0);
});

test.each(["Bash", "exec_command"])("%s hook denies a test command before execution", (tool) => {
  delete process.env.CI;
  rmSync(join(root, "checks.config.ts"), { force: true });
  const reply = refusedTests("PreToolUse", { tool_name: tool, tool_input: { command: "bun test" }, cwd: root });
  expect(reply).toContain('"permissionDecision":"deny"');
  expect(reply).toContain("localTests is blocked");
});

test("lets CI run tests instead of applying the local block", () => {
  process.env.CI = "true";
  expect(refuseLocalTests("bun test", root)).toBeUndefined();
});
