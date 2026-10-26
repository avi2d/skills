import { describe, expect, test } from "bun:test";
import type { AssistantMessage, Usage } from "@earendil-works/pi-ai";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import extension from "../../harness/pi/extensions/haiku-compaction";
import {
  HAIKU_MODEL,
  HAIKU_PROVIDER,
  SUMMARIZATION_SYSTEM_PROMPT,
  combineUsage,
  conversationOf,
  cumulativeFileOps,
  fileListsOf,
  historyPromptOf,
  mergeSplitSummary,
  haikuCompactionEnabled,
  isMuseSession,
  summarizeSession,
  summarizedByHaiku,
  turnPrefixPromptOf,
  withFileOps,
  type Context,
  type Pi,
} from "../../harness/pi/extensions/haiku-compaction";

type Event = Parameters<typeof summarizeSession>[0];

const OPUS = { provider: "claude-bridge", id: "claude-opus-5-5" };
const MUSE = { provider: "opencode-go", id: "muse-spark-1.3-contributor" };
type Registry = Context["modelRegistry"];

const usageOf = (input: number, output: number): Usage => ({
  input,
  output,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: input + output,
  cost: { input, output, cacheRead: 0, cacheWrite: 0, total: input + output },
});

const responseOf = (text: string, usage: Usage = usageOf(10, 20)): AssistantMessage => ({
  role: "assistant",
  content: [{ type: "text", text }],
  api: "claude-bridge",
  provider: "claude-bridge",
  model: HAIKU_MODEL,
  usage,
  stopReason: "stop",
  timestamp: Date.now(),
});

const userOf = (text: string): AgentMessage => ({ role: "user", content: text, timestamp: 0 });

const preparationOf = (
  messages: AgentMessage[],
  overrides: Partial<Event["preparation"]> = {},
): Event["preparation"] => ({
  firstKeptEntryId: "keep-1",
  messagesToSummarize: messages,
  turnPrefixMessages: [],
  isSplitTurn: false,
  tokensBefore: 4242,
  fileOps: { read: new Set<string>(), written: new Set<string>(), edited: new Set<string>() },
  settings: { enabled: true, reserveTokens: 100000, keepRecentTokens: 20000 },
  ...overrides,
});

const eventOf = (
  messages: AgentMessage[],
  overrides: Partial<Event["preparation"]> = {},
  branchEntries: Event["branchEntries"] = [],
): Event => ({
  type: "session_before_compact",
  preparation: preparationOf(messages, overrides),
  branchEntries,
  reason: "threshold",
  willRetry: false,
  signal: new AbortController().signal,
});

const priorHookOf = (readFiles: string[], modifiedFiles: string[]): Event["branchEntries"][number] => ({
  type: "compaction",
  id: "compaction-prior",
  parentId: null,
  timestamp: "2026-01-01T00:00:00.000Z",
  summary: "prior",
  firstKeptEntryId: "keep-1",
  tokensBefore: 0,
  fromHook: true,
  details: { readFiles, modifiedFiles },
});

const registryOf = (
  complete: Registry["complete"],
  found = true,
): { registry: Registry; calls: Parameters<Registry["complete"]>[] } => {
  const calls: Parameters<Registry["complete"]>[] = [];
  const haiku = found ? { id: HAIKU_MODEL, maxTokens: 200000 } : undefined;
  return {
    calls,
    registry: {
      find: (provider: string, modelId: string) => (provider === HAIKU_PROVIDER && modelId === HAIKU_MODEL ? haiku : undefined),
      complete: (...args) => {
        calls.push(args);
        return complete(...args);
      },
    },
  };
};

const settled = async (event: Event, ctx: Context, enabled = true) => summarizeSession(event, ctx, enabled);

describe("haiku-compaction", () => {
  test("the extension registers for the compact hook", async () => {
    type Handler = Parameters<Pi["on"]>[1];
    const seen: { name: string; handler: Handler }[] = [];
    let settings: unknown = { haikuCompaction: { enabled: false } };
    const pi: Pi = {
      on: (name, handler) => {
        seen.push({ name, handler });
        return () => {};
      },
      getSettings: () => settings,
    };
    extension(pi);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.name).toBe("session_before_compact");
    const handler = seen[0]?.handler ?? expect.unreachable("a handler is registered");
    const { registry, calls } = registryOf(async () => responseOf("summary"));
    const ctx: Context = { model: OPUS, modelRegistry: registry };
    expect(await handler({ type: "other" }, ctx)).toBeUndefined();
    expect(calls).toEqual([]);
    expect(await handler(eventOf([userOf("hi")]), ctx)).toBeUndefined();
    expect(calls).toEqual([]);
    settings = {};
    const enabled = await handler(eventOf([userOf("hi")]), ctx);
    expect(enabled?.compaction?.summary).toContain("summary");
    expect(calls).toHaveLength(1);
  });

  test("leaves a non-Claude session for pi's own compaction", async () => {
    const { registry, calls } = registryOf(async () => responseOf("summary"));
    const result = await settled(eventOf([userOf("hi")]), { model: { provider: "openrouter", id: "deepseek/deepseek-v4-pro-0813" }, modelRegistry: registry }, true);
    expect(result).toBeUndefined();
    expect(calls).toEqual([]);
  });

  test("leaves an OpenCode Go session on another model for pi's own compaction", async () => {
    const { registry, calls } = registryOf(async () => responseOf("summary"));
    const result = await settled(eventOf([userOf("hi")]), { model: { provider: "opencode-go", id: "deepseek-v4-pro" }, modelRegistry: registry }, true);
    expect(result).toBeUndefined();
    expect(calls).toEqual([]);
  });

  test("summarizes a Muse session with Haiku and keeps pi's entry fields", async () => {
    const { registry, calls } = registryOf(async () => responseOf("## Goal\nHaiku wrote this."));
    const result = await settled(eventOf([userOf("do the thing")]), { model: MUSE, modelRegistry: registry }, true);
    expect(result?.compaction?.summary).toContain("Haiku wrote this.");
    expect(result?.compaction?.firstKeptEntryId).toBe("keep-1");
    expect(result?.compaction?.usage).toEqual(usageOf(10, 20));
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0].id).toBe(HAIKU_MODEL);
  });

  test("the kill switch also leaves a Muse session for pi's own compaction", async () => {
    const { registry, calls } = registryOf(async () => responseOf("summary"));
    const result = await settled(eventOf([userOf("hi")]), { model: MUSE, modelRegistry: registry }, haikuCompactionEnabled({ haikuCompaction: { enabled: false } }));
    expect(result).toBeUndefined();
    expect(calls).toEqual([]);
  });

  test("summarizes a Claude session with Haiku and keeps pi's entry fields", async () => {
    const { registry, calls } = registryOf(async () => responseOf("## Goal\nHaiku wrote this."));
    const result = await settled(eventOf([userOf("do the thing")]), { model: OPUS, modelRegistry: registry }, true);
    expect(result?.compaction?.summary).toContain("Haiku wrote this.");
    expect(result?.compaction?.firstKeptEntryId).toBe("keep-1");
    expect(result?.compaction?.tokensBefore).toBe(4242);
    expect(result?.compaction?.usage).toEqual(usageOf(10, 20));
    expect(result?.compaction?.details).toEqual({ readFiles: [], modifiedFiles: [] });
    expect(calls).toHaveLength(1);
    const first = calls[0] ?? expect.unreachable("Haiku is called once");
    expect(first[0].id).toBe(HAIKU_MODEL);
    expect(first[1].systemPrompt).toBe(SUMMARIZATION_SYSTEM_PROMPT);
    expect(first[1].messages[0]?.content[0]?.text).toContain("<conversation>");
    expect(first[1].messages[0]?.content[0]?.text).toContain("context checkpoint summary");
  });

  test("stays on when the kill switch is absent", async () => {
    const { registry } = registryOf(async () => responseOf("summary"));
    const result = await settled(eventOf([userOf("hi")]), { model: OPUS, modelRegistry: registry }, haikuCompactionEnabled({}));
    expect(result?.compaction?.summary).toContain("summary");
  });

  test("fails open when the kill switch is off", async () => {
    const { registry, calls } = registryOf(async () => responseOf("summary"));
    const result = await settled(eventOf([userOf("hi")]), { model: OPUS, modelRegistry: registry }, haikuCompactionEnabled({ haikuCompaction: { enabled: false } }));
    expect(result).toBeUndefined();
    expect(calls).toEqual([]);
  });

  test("fails open when Haiku is not in the registry", async () => {
    const { registry, calls } = registryOf(async () => responseOf("summary"), false);
    const result = await settled(eventOf([userOf("hi")]), { model: OPUS, modelRegistry: registry }, true);
    expect(result).toBeUndefined();
    expect(calls).toEqual([]);
  });

  test("fails open when Haiku errors", async () => {
    const { registry } = registryOf(async () => {
      throw new Error("provider down");
    });
    const result = await settled(eventOf([userOf("hi")]), { model: OPUS, modelRegistry: registry }, true);
    expect(result).toBeUndefined();
  });

  test("fails open on an empty summary", async () => {
    const { registry } = registryOf(async () => responseOf("   \n  "));
    const result = await settled(eventOf([userOf("hi")]), { model: OPUS, modelRegistry: registry }, true);
    expect(result).toBeUndefined();
  });

  test("fails open on a length stop", async () => {
    const failedLength = { ...responseOf("partial"), stopReason: "length" as const };
    const { registry: lengthRegistry } = registryOf(async () => failedLength);
    const lengthResult = await settled(eventOf([userOf("hi")]), { model: OPUS, modelRegistry: lengthRegistry }, true);
    expect(lengthResult).toBeUndefined();
  });

  test("fails open on an error stop", async () => {
    const failed = { ...responseOf("partial"), stopReason: "error" as const };
    const { registry } = registryOf(async () => failed);
    const result = await settled(eventOf([userOf("hi")]), { model: OPUS, modelRegistry: registry }, true);
    expect(result).toBeUndefined();
  });

  test("fails open when Haiku calls a tool", async () => {
    const tooling: AssistantMessage = {
      ...responseOf("summary"),
      content: [{ type: "toolCall", id: "call-1", name: "read", arguments: { path: "notes.txt" } }],
    };
    const { registry } = registryOf(async () => tooling);
    const result = await settled(eventOf([userOf("hi")]), { model: OPUS, modelRegistry: registry }, true);
    expect(result).toBeUndefined();
  });

  test("fails open on abort", async () => {
    const { registry, calls } = registryOf(async () => responseOf("summary"));
    const controller = new AbortController();
    controller.abort();
    const event = eventOf([userOf("hi")]);
    const result = await settled({ ...event, signal: controller.signal }, { model: OPUS, modelRegistry: registry }, true);
    expect(result).toBeUndefined();
    expect(calls).toEqual([]);
  });

  test("merges a split turn the way pi does", async () => {
    const seen: string[] = [];
    const { registry, calls } = registryOf(async (_model, context) => {
      seen.push(context.messages[0]?.content[0]?.text ?? expect.unreachable("a user message is sent"));
      return responseOf(seen.length === 1 ? "## Goal\nHistory." : "Prefix checkpoint.", usageOf(seen.length, seen.length * 10));
    });
    const event = eventOf(
      [userOf("early work")],
      {
        isSplitTurn: true,
        turnPrefixMessages: [userOf("later work")],
        fileOps: { read: new Set(["b.ts", "a.ts"]), written: new Set<string>(), edited: new Set(["b.ts"]) },
      },
      [priorHookOf(["prior.ts"], ["edited-prior.ts"])],
    );
    const result = await settled(event, { model: OPUS, modelRegistry: registry }, true);
      expect(calls).toHaveLength(2);
      expect(seen[0]).toContain("context checkpoint summary");
      expect(seen[1]).toContain("# Instructions");
      expect(result?.compaction?.summary).toContain("History.");
      expect(result?.compaction?.summary).toContain("**Turn Context (split turn):**");
      expect(result?.compaction?.summary).toContain("Prefix checkpoint.");
      expect(result?.compaction?.summary).toContain("<read-files>\na.ts\nprior.ts\n</read-files>");
      expect(result?.compaction?.summary).toContain("<modified-files>\nb.ts\nedited-prior.ts\n</modified-files>");
      expect(result?.compaction?.summary).toContain("prior.ts");
      expect(result?.compaction?.summary).toContain("edited-prior.ts");
      expect(result?.compaction?.details).toEqual({ readFiles: ["a.ts", "prior.ts"], modifiedFiles: ["b.ts", "edited-prior.ts"] });
      expect(result?.compaction?.usage).toEqual(usageOf(3, 30));
  });

  test("reuses a previous summary without a second history call when nothing new arrived", async () => {
    const { registry, calls } = registryOf(async () => responseOf("Prefix checkpoint.", usageOf(7, 8)));
    const event = eventOf([], { isSplitTurn: true, turnPrefixMessages: [userOf("later")], previousSummary: "OLD" });
    const result = await settled(event, { model: OPUS, modelRegistry: registry }, true);
    expect(calls).toHaveLength(1);
    expect(result?.compaction?.summary).toContain("OLD");
    expect(result?.compaction?.summary).toContain("Turn Context (split turn)");
    expect(result?.compaction?.usage).toEqual(usageOf(7, 8));
  });

  test("marks absent history the way pi does", async () => {
    const { registry } = registryOf(async () => responseOf("Prefix checkpoint."));
    const event = eventOf([], { isSplitTurn: true, turnPrefixMessages: [userOf("later")] });
    const result = await settled(event, { model: OPUS, modelRegistry: registry }, true);
    expect(result?.compaction?.summary).toContain("No prior history.");
  });

  test("builds pi's history prompt", () => {
    const initial = historyPromptOf("chat", undefined, undefined);
    expect(initial).toContain("context checkpoint summary");
    expect(initial).toContain("name the file path instead of restating its content");
    expect(initial).not.toContain("<previous-summary>");
    const update = historyPromptOf("chat", "OLD", undefined);
    expect(update).toContain("NEW conversation messages");
    expect(update).toContain("<previous-summary>\nOLD\n</previous-summary>");
    const focused = historyPromptOf("chat", undefined, "costs");
    expect(focused).toContain("Additional focus: costs");
  });

  test("frames pi's turn prefix prompt", () => {
    const prompt = turnPrefixPromptOf("chat");
    expect(prompt).toContain("# Conversation");
    expect(prompt).toContain("# Instructions");
    expect(prompt).toContain("name the file path instead of restating its content");
  });

  test("a provider-only model fails open the way pi did before", async () => {
    expect(summarizedByHaiku({ provider: "claude-bridge" })).toBe(false);
    expect(isMuseSession(MUSE)).toBe(true);
    expect(isMuseSession(OPUS)).toBe(false);
    const { registry: openRegistry, calls: openCalls } = registryOf(async () => responseOf("summary"));
    const openResult = await settled(eventOf([userOf("hi")]), { model: { provider: "claude-bridge" }, modelRegistry: openRegistry }, true);
    expect(openResult).toBeUndefined();
    expect(openCalls).toEqual([]);
  });

  test("a Muse session keeps URLs while a Claude session keeps the origin prompt", async () => {
    const originHistory = "<conversation>\nchat\n</conversation>\n\nThe messages above are a conversation to summarize. Create a structured context checkpoint summary that another LLM will use to continue the work.\n\nUse this EXACT format:\n\n## Goal\n[What is the user trying to accomplish? Can be multiple items if the session covers different tasks.]\n\n## Constraints & Preferences\n- [Any constraints, preferences, or requirements mentioned by user]\n- [Or \"(none)\" if none were mentioned]\n\n## Progress\n### Done\n- [x] [Completed tasks/changes]\n\n### In Progress\n- [ ] [Current work]\n\n### Blocked\n- [Issues preventing progress, if any]\n\n## Key Decisions\n- **[Decision]**: [Brief rationale]\n\n## Next Steps\n1. [Ordered list of what should happen next]\n\n## Critical Context\n- [Any data, examples, or references needed to continue]\n- [Or \"(none)\" if not applicable]\n\nKeep each section concise. Preserve exact file paths, function names, and error messages. When a fact already lives in a file the conversation names, name the file path instead of restating its content.";
    expect(historyPromptOf("chat", undefined, undefined)).toBe(originHistory);
    expect(turnPrefixPromptOf("chat")).not.toContain("Never drop a URL");
    expect(historyPromptOf("chat", undefined, undefined, true)).toContain("Never drop a URL");
    expect(turnPrefixPromptOf("chat", true)).toContain("Never drop a URL");
    const seen: string[] = [];
    const { registry } = registryOf(async (_model, context) => {
      seen.push(context.messages[0]?.content[0]?.text ?? "");
      return responseOf("## Goal\nDone.");
    });
    await settled(eventOf([userOf("chat")]), { model: OPUS, modelRegistry: registry }, true);
    await settled(eventOf([userOf("chat")]), { model: MUSE, modelRegistry: registry }, true);
    expect(seen).toHaveLength(2);
    expect(seen[0]).not.toContain("Never drop a URL");
    expect(seen[1]).toBe((seen[0] ?? "") + " Keep every URL that appears in the conversation, with what it points to. Never drop a URL.");
  });

  test("merges a split summary the way pi does", () => {
    expect(mergeSplitSummary("H", "P")).toBe("H\n\n---\n\n**Turn Context (split turn):**\n\nP");
  });

  test("lists files the way pi does", () => {
    expect(fileListsOf({ read: new Set(["b.ts", "a.ts"]), edited: new Set(["b.ts"]), written: new Set(["c.ts"]) })).toEqual({
      readFiles: ["a.ts"],
      modifiedFiles: ["b.ts", "c.ts"],
    });
    expect(withFileOps("S", { read: new Set<string>(), edited: new Set<string>(), written: new Set<string>() })).toBe("S");
  });

  test("sums usage the way pi does", () => {
    const first = { ...usageOf(1, 2), reasoning: 5 };
    const second = { ...usageOf(10, 20), cacheWrite1h: 3 };
    expect(combineUsage(first, second)).toEqual({
      input: 11,
      output: 22,
      cacheRead: 0,
      cacheWrite: 0,
      cacheWrite1h: 3,
      reasoning: 5,
      totalTokens: 33,
      cost: { input: 11, output: 22, cacheRead: 0, cacheWrite: 0, total: 33 },
    });
  });

  test("carries files from an earlier Haiku compaction", async () => {
    const { registry } = registryOf(async () => responseOf("## Goal\nDone."));
    const event = eventOf(
      [userOf("new work")],
      { fileOps: { read: new Set(["c.ts"]), written: new Set<string>(), edited: new Set<string>() } },
      [priorHookOf(["a.ts"], ["b.ts"])],
    );
    const result = await settled(event, { model: OPUS, modelRegistry: registry }, true);
    expect(result?.compaction?.details).toEqual({ readFiles: ["a.ts", "c.ts"], modifiedFiles: ["b.ts"] });
    expect(result?.compaction?.summary).toContain("a.ts");
    expect(result?.compaction?.summary).toContain("c.ts");
    expect(result?.compaction?.summary).toContain("b.ts");
  });

  test("merges every earlier Haiku compaction", () => {
    const merged = cumulativeFileOps(
      { read: new Set(["c.ts"]), written: new Set<string>(), edited: new Set<string>() },
      [priorHookOf(["a.ts"], ["b.ts"]), priorHookOf(["d.ts"], ["e.ts"])],
    );
    expect(fileListsOf(merged)).toEqual({ readFiles: ["a.ts", "c.ts", "d.ts"], modifiedFiles: ["b.ts", "e.ts"] });
  });

  test("reads the kill switch the way pi holds it", () => {
    expect(summarizedByHaiku(OPUS)).toBe(true);
    expect(summarizedByHaiku({ provider: "openrouter", id: "z-ai/glm-5.3" })).toBe(false);
    expect(summarizedByHaiku(undefined)).toBe(false);
    expect(summarizedByHaiku(MUSE)).toBe(true);
    expect(summarizedByHaiku({ provider: "opencode-go", id: "muse-spark-1.4" })).toBe(true);
    expect(summarizedByHaiku({ provider: "opencode-go", id: "glm-5.3" })).toBe(false);
    expect(summarizedByHaiku({ provider: "openrouter", id: "muse-spark-1.3-contributor" })).toBe(false);
    expect(haikuCompactionEnabled({})).toBe(true);
    expect(haikuCompactionEnabled({ haikuCompaction: { enabled: true } })).toBe(true);
    expect(haikuCompactionEnabled({ haikuCompaction: { enabled: false } })).toBe(false);
    expect(haikuCompactionEnabled("nope")).toBe(true);
    expect(haikuCompactionEnabled(null)).toBe(true);
    expect(conversationOf([userOf("hello")])).toContain("hello");
  });
});

