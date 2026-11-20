import { spawnSync } from "node:child_process";
import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LOCAL_TESTS_LINE } from "../../harness/local-tests/local-tests";
import { GENERATED_ROOT } from "../lib/generated-root";

const entry = join(GENERATED_ROOT, "claude-code", "dispatcher", "index.ts");

test.each([
  { agentTests: { allowLocal: false, testCommands: ["example-runner"] } },
  { localTests: { blocked: true, commands: ["example-runner"] } },
])("denies a configured runner and records it instead of silently dropping the hook result: %j", (config) => {
  const root = mkdtempSync(join(tmpdir(), "skills-local-tests-log-"));
  try {
    writeFileSync(join(root, ".skills.json"), JSON.stringify(config));
    const payload = {
      tool_name: "Bash",
      tool_input: { command: "example-runner" },
      cwd: root,
      session_id: "local-tests-log",
    };
    const ran = spawnSync(process.execPath, [entry, "PreToolUse"], {
      env: { ...process.env, CI: "false", TMPDIR: root, XDG_STATE_HOME: join(root, "state") },
      input: JSON.stringify(payload),
      encoding: "utf8",
    });
    expect(ran.status).toBe(0);
    expect(ran.stdout).toContain('"permissionDecision":"deny"');
    expect(ran.stdout).toContain("CI is the test run");
    const log = readFileSync(join(root, "state", "skills", "dispatch.log"), "utf8");
    expect(log).toContain(LOCAL_TESTS_LINE);
    const migration = log.split("\n").filter((line) => line.includes("Replace localTests"));
    if ("localTests" in config) {
      expect(migration).toEqual([expect.stringContaining("commands to agentTests.testCommands")]);
    } else {
      expect(migration).toEqual([]);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
