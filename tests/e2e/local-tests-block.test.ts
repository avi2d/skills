import { spawnSync } from "node:child_process";
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LOCAL_TESTS_LINE } from "../../harness/local-tests/local-tests";

const root = mkdtempSync(join(tmpdir(), "skills-local-tests-log-"));
const ci = process.env.CI;

afterEach(() => {
  if (ci === undefined) delete process.env.CI;
  else process.env.CI = ci;
});

test("the hook denial lands in the dispatch log instead of vanishing", () => {
  delete process.env.CI;
  rmSync(join(root, "checks.config.ts"), { force: true });
  const probe = join(root, "log-probe.ts");
  writeFileSync(
    probe,
    `import { refusedTests } from ${JSON.stringify(new URL("../../src/dispatcher/hook-harness", import.meta.url).href)};\n` +
      `refusedTests("PreToolUse", { tool_name: "Bash", tool_input: { command: "bun test" }, cwd: ${JSON.stringify(root)}, session_id: "local-tests-log" });\n`,
  );
  const ran = spawnSync(process.execPath, [probe], { env: { ...process.env, XDG_STATE_HOME: join(root, "state") } });
  expect(ran.status).toBe(0);
  expect(readFileSync(join(root, "state", "skills", "dispatch.log"), "utf8")).toContain(LOCAL_TESTS_LINE);
  rmSync(root, { recursive: true, force: true });
});
