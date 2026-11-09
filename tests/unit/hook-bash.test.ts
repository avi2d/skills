import { describe, expect, test } from "bun:test";
import { isPending, resultEvent, trackBash } from "../../src/dispatcher/hook-bash";

const bash = (command: string) => ({ tool_name: "Bash", tool_input: { command } });

describe("bash start tracking", () => {
  test("a PreToolUse bash start is taken once, not twice", () => {
    const tracking = trackBash(true, bash("sleep 70"), []);
    expect(typeof tracking.take("sleep 70")).toBe("number");
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

  test("a queued rewrite moves the start to the rewritten command", () => {
    const tracking = trackBash(true, bash("bunx checks-test"), []);
    tracking.moved("pueue add -- bunx checks-test");
    expect(tracking.take("bunx checks-test")).toBeUndefined();
    expect(typeof tracking.take("pueue add -- bunx checks-test")).toBe("number");
  });

  test("a PostToolUse without a matching start is a read, not a tool result", () => {
    expect(resultEvent(bash("sleep 70"), () => undefined)).toBeUndefined();
  });

  test("a PostToolUse with a matching start reports the command and its seconds", () => {
    const event = resultEvent(bash("sleep 70"), () => Date.now() - 70_000);
    expect(event?.type).toBe("tool-result");
    if (event?.type !== "tool-result") return;
    expect(event.command).toBe("sleep 70");
    expect(event.seconds).toBeGreaterThanOrEqual(70);
    expect(event.seconds).toBeLessThan(75);
  });

  test("a persisted pending entry with a missing clock reading is not restored", () => {
    expect(isPending({ digest: "abc" })).toBe(false);
    expect(isPending({ digest: "abc", at: 1_700_000_000_000 })).toBe(true);
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
  });
});
