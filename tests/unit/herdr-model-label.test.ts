import { describe, expect, test } from "bun:test";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  contextUsed,
  displayAgent,
  elapsed,
  family,
  FAMILY_MARK,
  herdrPane,
  inForegroundJob,
  install,
  isWorkerSession,
  MAX_TOKEN,
  metadataRequest,
  REFRESH_MS,
  retractRequest,
  SOURCE,
  tokenCount,
  thinkingMark,
  tokensOf,
  WORKER_PREFIX,
  type Clock,
  type Context,
  type MetadataRequest,
  type Pi,
  type Request,
  type Snapshot,
  type Usage,
} from "../../harness/pi/extensions/herdr-model-label";

describe("herdrPane", () => {
  const inside = { HERDR_ENV: "1", HERDR_SOCKET_PATH: "/run/herdr.sock", HERDR_PANE_ID: "w1-2" };

  test("finds the pane and socket inside herdr", () => {
    expect(herdrPane(inside, "linux")).toEqual({ socket: "/run/herdr.sock", pane: "w1-2" });
  });

  test("reaches the socket through a named pipe on Windows", () => {
    expect(herdrPane(inside, "win32")?.socket).toBe("\\\\.\\pipe\\/run/herdr.sock");
  });

  test("is absent outside herdr or with either variable missing", () => {
    expect(herdrPane({}, "linux")).toBeUndefined();
    expect(herdrPane({ ...inside, HERDR_ENV: "0" }, "linux")).toBeUndefined();
    expect(herdrPane({ ...inside, HERDR_SOCKET_PATH: "" }, "linux")).toBeUndefined();
    expect(herdrPane({ ...inside, HERDR_PANE_ID: undefined }, "linux")).toBeUndefined();
  });
});

describe("inForegroundJob", () => {
  const reply = (pids: readonly number[]) =>
    JSON.stringify({ result: { type: "pane_process_info", process_info: { pane_id: "w1-2", foreground_processes: pids.map((pid) => ({ pid, name: "pi" })) } } });

  test("is true for a process in the pane's foreground job", () => {
    expect(inForegroundJob(reply([41, 42]), 42)).toBe(true);
  });

  test("is false for a process outside it, such as a pi nested in tmux", () => {
    expect(inForegroundJob(reply([41]), 42)).toBe(false);
    expect(inForegroundJob(reply([]), 42)).toBe(false);
  });

  test("is false when herdr gave no answer it can read", () => {
    expect(inForegroundJob(undefined, 42)).toBe(false);
    expect(inForegroundJob("not json", 42)).toBe(false);
    expect(inForegroundJob('{"error":{"code":"pane_not_found"}}', 42)).toBe(false);
    expect(inForegroundJob('{"result":{"process_info":{"foreground_processes":[{"pid":"42"}]}}}', 42)).toBe(false);
  });
});

test("displayAgent names the model and the thinking level", () => {
  expect(displayAgent("deepseek-v4-pro", "high")).toBe("pi · deepseek-v4-pro high");
});

describe("isWorkerSession", () => {
  test("is true only when FM_TASK_ID is a non-empty export", () => {
    expect(isWorkerSession({ FM_TASK_ID: "skills-herdr-worker-prefix" })).toBe(true);
    expect(isWorkerSession({})).toBe(false);
    expect(isWorkerSession({ FM_TASK_ID: "" })).toBe(false);
    expect(isWorkerSession({ FM_TASK_ID: undefined })).toBe(false);
  });
});

test("tokenCount shortens to k and M", () => {
  expect(tokenCount(812)).toBe("812");
  expect(tokenCount(45_200)).toBe("45k");
  expect(tokenCount(128_000)).toBe("128k");
  expect(tokenCount(999_499)).toBe("999k");
  expect(tokenCount(999_500)).toBe("1M");
  expect(tokenCount(1_000_000)).toBe("1M");
  expect(tokenCount(1_048_576)).toBe("1M");
  expect(tokenCount(1_500_000)).toBe("1.5M");
});

test("thinkingMark shortens each level to one or two letters, and shows nothing for off", () => {
  expect(thinkingMark("off")).toBe("");
  expect(thinkingMark("minimal")).toBe("mn");
  expect(thinkingMark("low")).toBe("l");
  expect(thinkingMark("medium")).toBe("m");
  expect(thinkingMark("high")).toBe("h");
  expect(thinkingMark("xhigh")).toBe("xh");
  expect(thinkingMark("max")).toBe("mx");
});

describe("contextUsed", () => {
  test("prints the share used as a whole percent on a 1M window", () => {
    expect(contextUsed({ tokens: 412_000, contextWindow: 1_000_000 })).toBe("41%");
  });

  test("marks unknown usage on a 1M window as a percent", () => {
    expect(contextUsed({ tokens: null, contextWindow: 1_000_000 })).toBe("?%");
  });

  test("keeps used-over-window absolutes on a 200k window", () => {
    expect(contextUsed({ tokens: 90_000, contextWindow: 200_000 })).toBe("90k/200k");
    expect(contextUsed({ tokens: null, contextWindow: 200_000 })).toBe("?/200k");
  });

  test("keeps absolutes on the window just under 1M", () => {
    expect(contextUsed({ tokens: 450_000, contextWindow: 999_999 })).toBe("450k/1M");
  });

  test("is cleared when pi knows no window", () => {
    expect(contextUsed(undefined)).toBeNull();
    expect(contextUsed({ tokens: 10, contextWindow: 0 })).toBeNull();
  });
});

test("elapsed counts whole minutes, then hours and padded minutes", () => {
  expect(elapsed(59_999)).toBe("0m");
  expect(elapsed(12 * 60_000 + 30_000)).toBe("12m");
  expect(elapsed(59 * 60_000)).toBe("59m");
  expect(elapsed(65 * 60_000)).toBe("1h05m");
  expect(elapsed(26 * 3_600_000)).toBe("26h00m");
});

test("tokensOf keeps every value under 80 characters", () => {
  const long = "m".repeat(200);
  const tokens = tokensOf({ model: long, provider: "fake", thinking: "high", usage: undefined, elapsedMs: 0 } satisfies Snapshot);
  expect(tokens.model).toHaveLength(MAX_TOKEN);
  expect(displayAgent(long, "high")).toHaveLength(MAX_TOKEN);
});

test("tokensOf leads the model token with the given prefix, and with nothing by default", () => {
  const snapshot: Snapshot = { model: "deepseek-v4-pro", provider: "fake", thinking: "high", usage: undefined, elapsedMs: 0 };
  expect(tokensOf(snapshot).model).toBe("deepseek-v4-pro h");
  expect(tokensOf(snapshot, WORKER_PREFIX).model).toBe(`${WORKER_PREFIX}deepseek-v4-pro h`);
});

test("a worker's model token leads with the single-row branch glyph", () => {
  expect(WORKER_PREFIX).toBe("└ ");
});

test("tokensOf ends the model token at the model id when thinking is off", () => {
  const snapshot: Snapshot = { model: "deepseek-v4-pro", provider: "fake", thinking: "off", usage: undefined, elapsedMs: 0 };
  expect(tokensOf(snapshot).model).toBe("deepseek-v4-pro");
});

test("tokensOf keeps a worker row's single prefix on the first token, so the row reads on one line", () => {
  const snapshot: Snapshot = { model: "m", provider: "fake", thinking: "high", usage: { tokens: 45_000, contextWindow: 1_000_000 }, elapsedMs: 0 };
  expect(tokensOf(snapshot).ctx).toBe("5%");
  expect(tokensOf(snapshot, WORKER_PREFIX).ctx).toBe("5%");
});

describe("family", () => {
  test("names the family by provider, and under opencode-go by model id", () => {
    expect(family({ provider: "claude-bridge", id: "claude-opus-5-5" })).toBe("claude");
    expect(family({ provider: "openai-codex", id: "gpt-6-luna" })).toBe("codex");
    expect(family({ provider: "openai", id: "gpt-6.1-sol" })).toBe("codex");
    expect(family({ provider: "opencode-go", id: "deepseek-v4-pro" })).toBe("deepseek");
    expect(family({ provider: "opencode-go", id: "muse-spark-1.3-contributor" })).toBe("muse");
  });

  test("is absent for a model it does not know", () => {
    expect(family({ provider: "opencode-go", id: "glm-5.3" })).toBeUndefined();
    expect(family({ provider: "anthropic", id: "claude-opus-5-5" })).toBeUndefined();
    expect(family({ provider: "fake", id: "deepseek-v4-pro" })).toBeUndefined();
  });
});

test("each family's mark is its Nerd Font or Unicode code point", () => {
  const marks: Readonly<Record<string, string>> = FAMILY_MARK;
  expect(marks).toEqual({
    claude: String.fromCodePoint(0xec82),
    codex: String.fromCodePoint(0xec81),
    deepseek: String.fromCodePoint(0xf18b4),
    muse: String.fromCodePoint(0x221e),
  });
});

describe("tokensOf with a known family", () => {
  const snapshot = (provider: string, model: string): Snapshot => ({ model, provider, thinking: "high", usage: undefined, elapsedMs: 0 });

  test("swaps the family name leading the model id for the family mark and two spaces", () => {
    expect(tokensOf(snapshot("claude-bridge", "claude-opus-5-5")).model).toBe(`${FAMILY_MARK.claude}  opus-5-5 h`);
    expect(tokensOf(snapshot("openai-codex", "gpt-6-luna")).model).toBe(`${FAMILY_MARK.codex}  6-luna h`);
    expect(tokensOf(snapshot("openai", "gpt-6.1-sol")).model).toBe(`${FAMILY_MARK.codex}  6.1-sol h`);
    expect(tokensOf(snapshot("opencode-go", "deepseek-v4-pro")).model).toBe(`${FAMILY_MARK.deepseek}  v4-pro h`);
    expect(tokensOf(snapshot("opencode-go", "muse-spark-1.3-contributor")).model).toBe(`${FAMILY_MARK.muse}  spark-1.3-c h`);
  });

  test("shortens a trailing -contributor to -c in the shown name, leaving display_agent whole", () => {
    expect(tokensOf(snapshot("opencode-go", "muse-spark-1.3-contributor")).model).toBe(`${FAMILY_MARK.muse}  spark-1.3-c h`);
    expect(metadataRequest("w1-2", snapshot("opencode-go", "muse-spark-1.3-contributor"), 7).params.display_agent).toBe(
      "pi · muse-spark-1.3-contributor high",
    );
  });

  test("keeps a model id that does not lead with the family name whole", () => {
    expect(tokensOf(snapshot("claude-bridge", "opus-5-5")).model).toBe(`${FAMILY_MARK.claude}  opus-5-5 h`);
    expect(tokensOf(snapshot("openai-codex", "codex-mini")).model).toBe(`${FAMILY_MARK.codex}  codex-mini h`);
  });

  test("puts the mark after the worker prefix", () => {
    expect(tokensOf(snapshot("claude-bridge", "claude-opus-5-5"), WORKER_PREFIX).model).toBe(`${WORKER_PREFIX}${FAMILY_MARK.claude}  opus-5-5 h`);
  });

  test("leaves the model id whole for an unknown model", () => {
    expect(tokensOf(snapshot("opencode-go", "glm-5.3"), WORKER_PREFIX).model).toBe(`${WORKER_PREFIX}glm-5.3 h`);
    expect(tokensOf(snapshot("anthropic", "claude-opus-5-5")).model).toBe("claude-opus-5-5 h");
  });

  test("keeps the mark and the 79-character cap on a long model id", () => {
    const model = tokensOf(snapshot("opencode-go", `deepseek-${"m".repeat(200)}`), WORKER_PREFIX).model;
    expect(model).toHaveLength(MAX_TOKEN);
    expect(model.startsWith(`${WORKER_PREFIX}${FAMILY_MARK.deepseek}  mmm`)).toBe(true);
  });

  test("leaves display_agent without a mark", () => {
    expect(metadataRequest("w1-2", snapshot("claude-bridge", "claude-opus-5-5"), 7).params.display_agent).toBe("pi · claude-opus-5-5 high");
  });
});

test("tokensOf leaves ctx null, prefix or not, when there is no usage", () => {
  const snapshot: Snapshot = { model: "m", provider: "fake", thinking: "high", usage: undefined, elapsedMs: 0 };
  expect(tokensOf(snapshot).ctx).toBeNull();
  expect(tokensOf(snapshot, WORKER_PREFIX).ctx).toBeNull();
});

test("metadataRequest sets the display agent and the three tokens under this extension's source, scoped to pi", () => {
  const snapshot: Snapshot = { model: "deepseek-v4-pro", provider: "fake", thinking: "high", usage: { tokens: 45_000, contextWindow: 1_000_000 }, elapsedMs: 65 * 60_000 };
  expect(metadataRequest("w1-2", snapshot, 7)).toEqual({
    id: `${SOURCE}:7`,
    method: "pane.report_metadata",
    params: {
      pane_id: "w1-2",
      source: SOURCE,
      agent: "pi",
      display_agent: "pi · deepseek-v4-pro high",
      tokens: { model: "deepseek-v4-pro h", ctx: "5%", elapsed: "1h05m" },
      seq: 7,
    },
  });
});

test("metadataRequest leads tokens.model alone with the given prefix, leaving display_agent untouched", () => {
  const snapshot: Snapshot = { model: "deepseek-v4-pro", provider: "fake", thinking: "high", usage: { tokens: 159_000, contextWindow: 1_000_000 }, elapsedMs: 8 * 60_000 };
  expect(metadataRequest("w1-2", snapshot, 7, WORKER_PREFIX)).toEqual({
    id: `${SOURCE}:7`,
    method: "pane.report_metadata",
    params: {
      pane_id: "w1-2",
      source: SOURCE,
      agent: "pi",
      display_agent: "pi · deepseek-v4-pro high",
      tokens: { model: `${WORKER_PREFIX}deepseek-v4-pro h`, ctx: "16%", elapsed: "8m" },
      seq: 7,
    },
  });
});

test("pi's own API is what install takes", () => {
  const takes = (pi: ExtensionAPI): Pi => pi;
  expect(typeof takes).toBe("function");
});

type ThinkingLevel = ReturnType<Pi["getThinkingLevel"]>;
type Handler = (event: unknown, ctx: Context) => void;

function installed(level: ThinkingLevel, env: Record<string, string | undefined> = {}) {
  const state: { level: ThinkingLevel; now: number; ticking: (() => void) | undefined; stopped: number } = {
    level,
    now: 1_000_000,
    ticking: undefined,
    stopped: 0,
  };
  const handlers = new Map<string, Handler>();
  function on(event: string, handler: Handler): void {
    handlers.set(event, handler);
  }
  const pi: Pi = { on, getThinkingLevel: () => state.level };
  const clock: Clock = {
    now: () => state.now,
    every: (ms, tick) => {
      expect(ms).toBe(REFRESH_MS);
      state.ticking = tick;
      return () => {
        state.ticking = undefined;
        state.stopped += 1;
      };
    },
  };
  const sent: MetadataRequest[] = [];
  const retracted: Request[] = [];
  const isReport = (request: Request): request is MetadataRequest => request.params.tokens.model !== null;
  install(pi, "w1-2", (request) => (isReport(request) ? sent : retracted).push(request), clock, env);
  const ctx = (mode: ExtensionContext["mode"], model?: string, usage?: Usage, provider = "fake"): Context => ({
    mode,
    model: model === undefined ? undefined : { id: model, provider },
    getContextUsage: () => usage,
  });
  const fire = (event: string, c: Context): unknown => (handlers.get(event) ?? expect.unreachable(`no ${event} handler`))({}, c);
  const stop = () => fire("session_shutdown", ctx("tui"));
  return { state, sent, retracted, ctx, fire, stop };
}

describe("install", () => {
  test("reports at session start and on each model or thinking change, once per label", () => {
    const { state, sent, ctx, fire } = installed("high");

    fire("session_start", ctx("tui", "deepseek-v4-pro"));
    fire("model_select", ctx("tui", "deepseek-v4-pro"));
    fire("model_select", ctx("tui", "qwen3-coder"));
    state.level = "low";
    fire("thinking_level_select", ctx("tui", "qwen3-coder"));

    expect(sent.map((r) => r.params.display_agent)).toEqual([
      "pi · deepseek-v4-pro high",
      "pi · qwen3-coder high",
      "pi · qwen3-coder low",
    ]);
    expect(sent.map((r) => r.params.tokens.model)).toEqual(["deepseek-v4-pro h", "qwen3-coder h", "qwen3-coder l"]);
    expect(sent.every((r) => r.params.pane_id === "w1-2")).toBe(true);
    const seqs = sent.map((r) => r.params.seq);
    expect(new Set(seqs).size).toBe(seqs.length);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
  });

  test("refreshes the context after every turn", () => {
    const { sent, ctx, fire } = installed("high");
    fire("session_start", ctx("tui", "m", { tokens: null, contextWindow: 200_000 }));
    fire("turn_end", ctx("tui", "m", { tokens: 20_000, contextWindow: 200_000 }));
    fire("turn_end", ctx("tui", "m", { tokens: 20_000, contextWindow: 200_000 }));
    fire("turn_end", ctx("tui", "m", { tokens: 90_000, contextWindow: 200_000 }));
    expect(sent.map((r) => r.params.tokens.ctx)).toEqual(["?/200k", "20k/200k", "90k/200k"]);
  });

  test("refreshes the context when a compaction or a tree jump changes it between turns", () => {
    const { sent, ctx, fire } = installed("high");
    fire("session_start", ctx("tui", "m", { tokens: 180_000, contextWindow: 200_000 }));
    fire("session_compact", ctx("tui", "m", { tokens: 30_000, contextWindow: 200_000 }));
    fire("session_tree", ctx("tui", "m", { tokens: 120_000, contextWindow: 200_000 }));
    expect(sent.map((r) => r.params.tokens.ctx)).toEqual(["180k/200k", "30k/200k", "120k/200k"]);
  });

  test("a timer refreshes the elapsed time since session start, and stops on shutdown", () => {
    const { state, sent, ctx, fire, stop } = installed("high");
    fire("session_start", ctx("tui", "m"));
    const tick = () => (state.ticking ?? expect.unreachable("no timer running"))();

    state.now += REFRESH_MS;
    tick();
    state.now += REFRESH_MS;
    tick();
    state.now += 64 * 60_000;
    tick();
    expect(sent.map((r) => r.params.tokens.elapsed)).toEqual(["0m", "1m", "1h05m"]);

    stop();
    expect(state.ticking).toBeUndefined();
    expect(state.stopped).toBe(1);
  });

  test("a new session restarts the clock and replaces the timer", () => {
    const { state, sent, ctx, fire } = installed("high");
    fire("session_start", ctx("tui", "m"));
    state.now += 10 * 60_000;
    fire("turn_end", ctx("tui", "m"));
    fire("session_start", ctx("tui", "m"));
    expect(state.stopped).toBe(1);
    expect(state.ticking).toBeDefined();
    expect(sent.map((r) => r.params.tokens.elapsed)).toEqual(["0m", "10m", "0m"]);
  });

  test("shutdown retracts the reported tokens, so the next agent in the pane does not show them", async () => {
    const { sent, retracted, ctx, fire, stop } = installed("high");
    fire("session_start", ctx("tui", "m", { tokens: 20_000, contextWindow: 200_000 }));
    await stop();
    expect(retracted).toEqual([retractRequest("w1-2", (sent.at(-1)?.params.seq ?? 0) + 1)]);
    expect(retracted[0]?.params.tokens).toEqual({ model: null, ctx: null, elapsed: null });

    await stop();
    expect(retracted).toHaveLength(1);
  });

  test("a session started after shutdown reports again", async () => {
    const { sent, ctx, fire, stop } = installed("high");
    fire("session_start", ctx("tui", "m"));
    await stop();
    fire("session_start", ctx("tui", "m"));
    expect(sent.map((r) => r.params.display_agent)).toEqual(["pi · m high", "pi · m high"]);
  });

  test("shutdown retracts nothing when nothing was reported", async () => {
    const { retracted, ctx, fire, stop } = installed("high");
    fire("session_start", ctx("print", "m"));
    await stop();
    expect(retracted).toEqual([]);
  });

  test("reports nothing and starts no timer in print, json or RPC mode", () => {
    const { state, sent, ctx, fire } = installed("high");
    for (const mode of ["print", "json", "rpc"] as const) {
      fire("session_start", ctx(mode, "m"));
      fire("model_select", ctx(mode, "n"));
      fire("thinking_level_select", ctx(mode, "n"));
      fire("turn_end", ctx(mode, "n"));
    }
    expect(sent).toEqual([]);
    expect(state.ticking).toBeUndefined();
  });

  test("reports nothing until a model is selected", () => {
    const { sent, ctx, fire } = installed("off");
    fire("session_start", ctx("tui"));
    expect(sent).toEqual([]);
    fire("model_select", ctx("tui", "m"));
    expect(sent.map((r) => r.params.display_agent)).toEqual(["pi · m off"]);
  });

  test("leads tokens.model with the worker prefix when FM_TASK_ID is set, and not for the main session", () => {
    const worker = installed("high", { FM_TASK_ID: "skills-herdr-worker-prefix" });
    worker.fire("session_start", worker.ctx("tui", "m"));
    expect(worker.sent.map((r) => r.params.tokens.model)).toEqual([`${WORKER_PREFIX}m h`]);

    const main = installed("high", {});
    main.fire("session_start", main.ctx("tui", "m"));
    expect(main.sent.map((r) => r.params.tokens.model)).toEqual(["m h"]);
  });

  test("leaves tokens.ctx without a prefix in a worker session as in the main session", () => {
    const usage = { tokens: 159_000, contextWindow: 1_000_000 };

    const worker = installed("high", { FM_TASK_ID: "skills-herdr-worker-prefix" });
    worker.fire("session_start", worker.ctx("tui", "m", usage));
    expect(worker.sent.map((r) => r.params.tokens.ctx)).toEqual(["16%"]);

    const main = installed("high", {});
    main.fire("session_start", main.ctx("tui", "m", usage));
    expect(main.sent.map((r) => r.params.tokens.ctx)).toEqual(["16%"]);
  });

  test("leads tokens.model with the family mark of the selected model", () => {
    const worker = installed("high", { FM_TASK_ID: "skills-herdr-worker-prefix" });
    worker.fire("session_start", worker.ctx("tui", "claude-opus-5-5", undefined, "claude-bridge"));
    worker.fire("model_select", worker.ctx("tui", "gpt-6-luna", undefined, "openai-codex"));
    worker.fire("model_select", worker.ctx("tui", "glm-5.3", undefined, "opencode-go"));
    expect(worker.sent.map((r) => r.params.tokens.model)).toEqual([
      `${WORKER_PREFIX}${FAMILY_MARK.claude}  opus-5-5 h`,
      `${WORKER_PREFIX}${FAMILY_MARK.codex}  6-luna h`,
      `${WORKER_PREFIX}glm-5.3 h`,
    ]);
  });
});

describe("session replacement", () => {
  const staleAfterReplacement =
    "This extension ctx is stale after session replacement or reload. Do not use a captured pi or command ctx after ctx.newSession(), ctx.fork(), ctx.switchSession(), or ctx.reload().";

  function replaceable(inner: Context): { current: Context; replace: () => void } {
    let stale = false;
    const fail = (): never => {
      throw new Error(staleAfterReplacement);
    };
    return {
      current: {
        get mode() {
          if (stale) fail();
          return inner.mode;
        },
        get model() {
          if (stale) fail();
          return inner.model;
        },
        getContextUsage: () => {
          if (stale) fail();
          return inner.getContextUsage();
        },
      },
      replace: () => {
        stale = true;
      },
    };
  }

  test("a tick after a replacement between turn_end and settle reports the handler's snapshot", () => {
    const { state, sent, ctx, fire } = installed("high");
    const start = replaceable(ctx("tui", "m"));
    const turn = replaceable(ctx("tui", "m", { tokens: 20_000, contextWindow: 200_000 }));
    fire("session_start", start.current);
    fire("turn_end", turn.current);
    turn.replace();
    state.now += 2 * REFRESH_MS;
    const tick = state.ticking ?? expect.unreachable("no timer running");
    expect(() => tick()).not.toThrow();
    expect(sent.map((r) => r.params.tokens.ctx)).toEqual([null, "20k/200k", "20k/200k"]);
    expect(sent.map((r) => r.params.display_agent)).toEqual(["pi · m high", "pi · m high", "pi · m high"]);
  });
});
