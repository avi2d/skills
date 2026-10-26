import { describe, expect, test } from "bun:test";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { buildLedger, callFigures, compact, toolFigure } from "../../harness/pi/extensions/transcript-style/turns";

type Usage = { readonly input: number; readonly output: number; readonly cacheRead: number; readonly cacheWrite: number; readonly reasoning?: number };

type Message = Extract<SessionEntry, { readonly type: "message" }>["message"];

let clock = 1_000;
let sequence = 0;

const base = () => ({ id: `e${(sequence += 1)}`, parentId: null, timestamp: new Date(clock).toISOString() });

const message = (body: Message): SessionEntry => ({ ...base(), type: "message", message: body });

const user = (text: string): SessionEntry => message({ role: "user", content: [{ type: "text", text }], timestamp: (clock += 1) });

const assistant = (usage: Usage, toolCallIds: readonly string[] = [], model = "m"): SessionEntry =>
  message({
    role: "assistant",
    content: toolCallIds.map((id) => ({ type: "toolCall", id, name: "bash", arguments: {} })),
    api: "anthropic-messages",
    provider: "p",
    model,
    usage: { ...usage, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: toolCallIds.length ? "toolUse" : "stop",
    timestamp: (clock += 1),
  });

const result = (toolCallId: string, chars: number): SessionEntry =>
  message({ role: "toolResult", toolCallId, toolName: "bash", content: [{ type: "text", text: "x".repeat(chars) }], isError: false, timestamp: (clock += 1) });

const compaction = (): SessionEntry => ({ ...base(), type: "compaction", summary: "s", firstKeptEntryId: "e1", tokensBefore: 0 });

const queued = (chars: number): SessionEntry => ({ ...base(), type: "custom_message", customType: "note", content: "x".repeat(chars), display: true });

const shell = (chars: number, excludeFromContext: boolean): SessionEntry =>
  message({ role: "bashExecution", command: "ls", output: "x".repeat(chars), exitCode: 0, cancelled: false, truncated: false, excludeFromContext, timestamp: (clock += 1) });

describe("buildLedger", () => {
  test("numbers model calls across the whole session, prompts included", () => {
    const ledger = buildLedger([
      user("a"),
      assistant({ input: 10, output: 5, cacheRead: 0, cacheWrite: 0 }, ["t1"]),
      result("t1", 40),
      assistant({ input: 10, output: 5, cacheRead: 30, cacheWrite: 0 }),
      user("b"),
      assistant({ input: 10, output: 5, cacheRead: 60, cacheWrite: 0 }),
    ]);
    expect([...ledger.turnsByTimestamp.values()].map(({ number }) => number)).toEqual([1, 2, 3]);
    expect(ledger.turns).toBe(3);
  });

  test("measures a lone result as the context growth beyond the previous output", () => {
    const ledger = buildLedger([user("a"), assistant({ input: 2, output: 64, cacheRead: 0, cacheWrite: 1791 }, ["t1"]), result("t1", 207), assistant({ input: 6, output: 44, cacheRead: 1791, cacheWrite: 206 })]);
    expect(ledger.tools.get("t1")).toEqual({ basis: "measured", tokens: 1791 + 206 + 6 - (2 + 1791) - 64 });
  });

  test("splits the growth across parallel results by their estimated share", () => {
    const ledger = buildLedger([
      user("a"),
      assistant({ input: 0, output: 0, cacheRead: 1000, cacheWrite: 0 }, ["t1", "t2"]),
      result("t1", 3000),
      result("t2", 1000),
      assistant({ input: 0, output: 0, cacheRead: 3000, cacheWrite: 0 }),
    ]);
    expect([ledger.tools.get("t1"), ledger.tools.get("t2")]).toEqual([
      { basis: "estimated", tokens: 1500 },
      { basis: "estimated", tokens: 500 },
    ]);
  });

  test("shares the growth with a message queued after the result, since the next call carries it too", () => {
    const ledger = buildLedger([user("a"), assistant({ input: 0, output: 100, cacheRead: 1000, cacheWrite: 0 }, ["t1"]), result("t1", 800), queued(3200), assistant({ input: 0, output: 0, cacheRead: 2100, cacheWrite: 0 })]);
    expect(ledger.tools.get("t1")).toEqual({ basis: "estimated", tokens: 200 });
  });

  test("leaves a shell run kept out of context out of the growth", () => {
    const ledger = buildLedger([user("a"), assistant({ input: 0, output: 100, cacheRead: 1000, cacheWrite: 0 }, ["t1"]), result("t1", 800), shell(3200, true), assistant({ input: 0, output: 0, cacheRead: 1300, cacheWrite: 0 })]);
    expect(ledger.tools.get("t1")).toEqual({ basis: "measured", tokens: 200 });
    const shared = buildLedger([user("a"), assistant({ input: 0, output: 100, cacheRead: 1000, cacheWrite: 0 }, ["t1"]), result("t1", 800), shell(3200, false), assistant({ input: 0, output: 0, cacheRead: 2100, cacheWrite: 0 })]);
    expect(shared.tools.get("t1")?.basis).toBe("estimated");
  });

  test("falls back to the estimate until the next call lands, across a compaction and across a model change", () => {
    const pending = buildLedger([user("a"), assistant({ input: 100, output: 1, cacheRead: 0, cacheWrite: 0 }, ["t1"]), result("t1", 400)]);
    expect(pending.tools.get("t1")).toEqual({ basis: "estimated", tokens: 100 });
    const compacted = buildLedger([
      user("a"),
      assistant({ input: 100, output: 1, cacheRead: 0, cacheWrite: 0 }, ["t1"]),
      result("t1", 400),
      compaction(),
      assistant({ input: 900, output: 1, cacheRead: 0, cacheWrite: 0 }),
    ]);
    expect(compacted.tools.get("t1")?.basis).toBe("estimated");
    const switched = buildLedger([user("a"), assistant({ input: 100, output: 1, cacheRead: 0, cacheWrite: 0 }, ["t1"]), result("t1", 400), assistant({ input: 900, output: 1, cacheRead: 0, cacheWrite: 0 }, [], "other")]);
    expect(switched.tools.get("t1")?.basis).toBe("estimated");
  });
});

describe("figures", () => {
  test.each([
    [999, "999"],
    [1000, "1.0k"],
    [9949, "9.9k"],
    [9950, "10k"],
    [186_000, "186k"],
    [1_200_000, "1.2M"],
  ])("compact %d", (tokens, said) => expect(compact(tokens)).toBe(said));

  test("a call says its context, its output with thinking, and the cache split", () => {
    const figures = callFigures({ input: 2, output: 140, cacheRead: 4516, cacheWrite: 17363, reasoning: 13, cost: 0 });
    expect(figures.map(({ text }) => text)).toEqual(["in 22k", "out 140 (13 thinking)", "R4.5k W17k"]);
  });

  test("a measured result is a growth and an estimated one is approximate", () => {
    expect([toolFigure({ basis: "measured", tokens: 142 }), toolFigure({ basis: "estimated", tokens: 52 })]).toEqual(["+142", "≈52"]);
  });
});
