import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unsandboxed } from "../../src/dispatcher/codex-dispatcher";

describe("whether a Codex turn runs unsandboxed, since a queued job runs outside any sandbox", () => {
  const root = mkdtempSync(join(tmpdir(), "skills-sandbox-"));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  const rollout = (...policies: Array<Record<string, unknown>>): string => {
    const path = join(root, `${policies.length}-${Math.random().toString(36).slice(2)}.jsonl`);
    const turns = policies.map((policy) => JSON.stringify({ type: "turn_context", payload: { sandbox_policy: policy } }));
    writeFileSync(path, [JSON.stringify({ type: "session_meta", payload: { id: "s1" } }), ...turns].join("\n"));
    return path;
  };

  test("full access is unsandboxed", () => {
    expect(unsandboxed({ transcript_path: rollout({ type: "danger-full-access" }) })).toBe(true);
  });

  test("a restricted sandbox is not, whatever its network setting", () => {
    expect(unsandboxed({ transcript_path: rollout({ type: "workspace-write", network_access: true }) })).toBe(false);
    expect(unsandboxed({ transcript_path: rollout({ type: "workspace-write", network_access: false }) })).toBe(false);
    expect(unsandboxed({ transcript_path: rollout({ type: "read-only" }) })).toBe(false);
  });

  test("the latest turn decides, because a session can change its sandbox between turns", () => {
    expect(unsandboxed({ transcript_path: rollout({ type: "danger-full-access" }, { type: "read-only" }) })).toBe(false);
  });

  test("an unreadable or absent rollout is not, so an unknown sandbox runs the command as it is", () => {
    expect(unsandboxed({ transcript_path: join(root, "missing.jsonl") })).toBe(false);
    expect(unsandboxed({})).toBe(false);
  });
});
