import { describe, expect, test } from "bun:test";
import { isPending, resultEvent, trackBash, writeResultEvent } from "../../src/dispatcher/hook-bash";
import { digestCommand, stripped } from "../../src/dispatcher/rerun";

const bash = (command: string) => ({ tool_name: "Bash", tool_input: { command } });

describe("bash start tracking", () => {
  test("a PreToolUse bash start is taken once, not twice", () => {
    const tracking = trackBash(true, bash("sleep 70"), []);
    expect(typeof tracking.take("sleep 70")?.at).toBe("number");
    expect(tracking.take("sleep 70")).toBeUndefined();
  });

  test("a non-bash tool call leaves no start behind", () => {
    const tracking = trackBash(true, { tool_name: "Read", tool_input: { path: "x" } }, []);
    expect(tracking.pending).toEqual([]);
  });

  test("a refused start is dropped, so its PostToolUse cannot seed slow state", () => {
    const tracking = trackBash(true, bash("sleep 70"), []);
    tracking.dropStarted();
    expect(tracking.pending).toEqual([]);
    expect(tracking.take("sleep 70")).toBeUndefined();
  });

  test("a queued rewrite keeps the original digests, so its completion still enforces a filtered rerun", () => {
    const tracking = trackBash(true, bash("bunx checks-test"), []);
    tracking.moved("pueue add -- bunx checks-test");
    expect(tracking.take("bunx checks-test")).toBeUndefined();
    const taken = tracking.take("pueue add -- bunx checks-test");
    expect(taken?.digest).toBe(digestCommand("pueue add -- bunx checks-test"));
    expect(taken?.full).toBe(digestCommand("bunx checks-test"));
    expect(taken?.canon).toBe(digestCommand(stripped("bunx checks-test")));
    const retry = trackBash(true, bash("bunx checks-test"), []);
    retry.moved("pueue add -- bunx checks-test");
    const event = resultEvent({ tool_name: "Bash", tool_input: { command: "pueue add -- bunx checks-test" } }, retry.take);
    expect(event?.type).toBe("tool-result");
    if (event?.type !== "tool-result") return;
    expect(event.command).toBe("pueue add -- bunx checks-test");
    expect(event.full).toBe(digestCommand("bunx checks-test"));
    expect(event.canon).toBe(digestCommand(stripped("bunx checks-test")));
  });

  test("a PostToolUse without a matching start is a read, not a tool result", () => {
    expect(resultEvent(bash("sleep 70"), () => undefined)).toBeUndefined();
  });

  test("a start records whether stdout reaches a file, and a stderr-only redirection records nothing saved", () => {
    expect(trackBash(true, bash("sleep 70 > out.log"), []).pending[0]?.saved).toBe(true);
    expect(trackBash(true, bash("sleep 70 2> err.log"), []).pending[0]?.saved).toBe(false);
  });

  test("a PostToolUseFailure marks the bash result failed, so a failed slow run stays recorded without clearing the guard", () => {
    const event = resultEvent(
      { tool_name: "Bash", tool_input: { command: "sleep 70" }, hook_event_name: "PostToolUseFailure" },
      () => ({ digest: "x", full: "x", canon: "x", mutating: false, saved: false, at: Date.now() - 70_000 }),
    );
    expect(event?.type).toBe("tool-result");
    if (event?.type !== "tool-result") return;
    expect(event.failed).toBe(true);
  });

  test("a Write or Edit PostToolUse reports its file as a write result, and a failed one keeps the guard", () => {
    expect(writeResultEvent({ tool_name: "Write", tool_input: { file_path: "src/a.ts" } }, [])).toEqual({
      type: "write-result",
      tool: "Write",
      writes: ["src/a.ts"],
    });
    expect(
      writeResultEvent({ tool_name: "Edit", tool_input: { file_path: "src/a.ts" }, hook_event_name: "PostToolUseFailure" }, []),
    ).toEqual({ type: "write-result", tool: "Edit", writes: ["src/a.ts"], failed: true });
    expect(writeResultEvent({ tool_name: "Bash", tool_input: { command: "ls" } }, [])).toBeUndefined();
    expect(writeResultEvent({ tool_name: "apply_patch", tool_input: {} }, ["a.txt", "b.txt"])).toEqual({
      type: "write-result",
      tool: "apply_patch",
      writes: ["a.txt", "b.txt"],
    });
    expect(writeResultEvent({ tool_name: "apply_patch", tool_input: {} }, [])).toBeUndefined();
  });

  test("a PostToolUse with a matching start reports the command and its seconds", () => {
    const event = resultEvent(bash("sleep 70"), () => ({ digest: "x", full: "x", canon: "x", mutating: false, saved: false, at: Date.now() - 70_000 }));
    expect(event?.type).toBe("tool-result");
    if (event?.type !== "tool-result") return;
    expect(event.command).toBe("sleep 70");
    expect(event.seconds).toBeGreaterThanOrEqual(70);
    expect(event.seconds).toBeLessThan(75);
  });

  test("a persisted pending entry with a missing clock reading is not restored", () => {
    expect(isPending({ digest: "abc" })).toBe(false);
    expect(isPending({ digest: "abc", at: 1_700_000_000_000 })).toBe(false);
    expect(isPending({ digest: "abc", full: "f", canon: "c", mutating: false, saved: false, at: 1_700_000_000_000 })).toBe(true);
  });

  test("a persisted entry holds a digest, never the command text", () => {
    const tracking = trackBash(true, bash("TOKEN=secret sleep 70"), []);
    expect(tracking.pending).toHaveLength(1);
    const entry = tracking.pending[0];
    expect(entry).toBeDefined();
    if (entry === undefined) return;
    expect("command" in entry).toBe(false);
    expect(entry.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(tracking.pending)).not.toContain("secret");
    expect(entry.full).toMatch(/^[0-9a-f]{64}$/);
    expect(entry.canon).toMatch(/^[0-9a-f]{64}$/);
  });
});
