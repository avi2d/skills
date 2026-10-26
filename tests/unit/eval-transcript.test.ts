import { expect, test } from "bun:test";
import { bytesOf, transcriptOf } from "../../src/eval/eval-transcript";

const usage = (input: number, output: number, total = 0, cacheRead = 0, cacheWrite = 0, cacheWrite1h = 0) => ({ input, output, cacheRead, cacheWrite, cacheWrite1h, totalTokens: input + output + cacheRead + cacheWrite, cost: { total } });

const end = (message: Record<string, unknown>): string => JSON.stringify({ type: "message_end", message });

const assistant = (content: unknown[], stopReason = "toolUse", extra: Record<string, unknown> = {}) =>
  end({ role: "assistant", content, api: "faux", provider: "scripted", model: "agent", usage: usage(100, 10, 0.5), stopReason, ...extra });

const result = (toolCallId: string, text: string, isError = false) =>
  end({ role: "toolResult", toolCallId, toolName: "bash", content: [{ type: "text", text }], isError, timestamp: 1 });

const stream = [
  JSON.stringify({ type: "session", version: 3, id: "s", timestamp: "t", cwd: "/r" }),
  JSON.stringify({ type: "agent_start" }),
  end({ role: "system", content: "", sections: {} }),
  end({ role: "user", content: [{ type: "text", text: "fix it" }], timestamp: 1 }),
  JSON.stringify({ type: "message_update", usage: usage(1, 1), assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "x" } }),
  assistant([
    { type: "thinking", thinking: "hmm" },
    { type: "text", text: "Looking first." },
    { type: "toolCall", id: "a", name: "bash", arguments: { command: "bun test" } },
  ]),
  JSON.stringify({ type: "tool_execution_end", toolCallId: "a", toolName: "bash", result: {}, isError: true }),
  result("a", "1 fail", true),
  assistant([{ type: "toolCall", id: "b", name: "write", arguments: { path: "src/a.ts", content: "x" } }]),
  result("b", "Successfully wrote to src/a.ts"),
  assistant([{ type: "text", text: "Done." }], "stop", { usage: usage(5, 2, 0.5, 1500, 500, 100) }),
  JSON.stringify({ type: "agent_settled" }),
];

test("a pi JSON stream becomes its steps in order, each call carrying its result", () => {
  const transcript = transcriptOf(stream);
  expect(transcript.steps).toEqual([
    { kind: "say", text: "Looking first." },
    { kind: "call", call: { id: "a", tool: "bash", args: { command: "bun test" }, result: "1 fail", failed: true } },
    { kind: "call", call: { id: "b", tool: "write", args: { path: "src/a.ts", content: "x" }, result: "Successfully wrote to src/a.ts", failed: false } },
    { kind: "say", text: "Done." },
  ]);
  expect(transcript.answer).toBe("Done.");
  expect([transcript.input, transcript.output, transcript.cacheRead, transcript.cacheWrite, transcript.cacheWrite1h, transcript.cost]).toEqual([205, 22, 1500, 500, 100, 1.5]);
  expect(transcript.requests.at(-1)).toEqual({ input: 5, output: 2, cacheRead: 1500, cacheWrite: 500, cacheWrite1h: 100, cost: 0.5 });
  expect(transcript.providerError).toBeUndefined();
  expect(transcript.unreadable).toBe(0);
});

test("a line that is not an event, and a result for no call, are counted rather than dropped unseen", () => {
  const transcript = transcriptOf(["not json", end({ role: "assistant", content: "no" }), result("ghost", "x"), ""]);
  expect(transcript.unreadable).toBe(3);
  expect(transcript.steps).toEqual([]);
});

test("a run whose last reply is a provider error carries that error", () => {
  const transcript = transcriptOf([assistant([], "error", { errorMessage: "429 rate limited" })]);
  expect(transcript.providerError).toBe("429 rate limited");
  expect(transcriptOf([assistant([], "error"), assistant([{ type: "text", text: "ok" }], "stop")]).providerError).toBeUndefined();
});

test("bytes are counted as UTF-8, not as UTF-16 code units", () => {
  expect(bytesOf("héllo")).toBe(6);
});
