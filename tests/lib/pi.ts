import { mkdirSync, mkdtempSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import { Schema } from "effect";
import { ENTRY, INDEX, PI_BUNDLE, bundle } from "../../src/generate/bundle";
import type { Index } from "../../src/dispatcher/dispatch";
import { valueOf } from "./effect";

// Each isolated test file loads pi cold, and loading it here keeps that out of its first test's timeout.
await import("@earendil-works/pi-coding-agent");

const repo = new URL("../../", import.meta.url).pathname;

const SettleResult = Schema.Struct({
  continue: Schema.optionalKey(Schema.Boolean),
  entries: Schema.optionalKey(Schema.Array(Schema.Struct({ type: Schema.String, content: Schema.optionalKey(Schema.Unknown) }))),
});
type SettleResult = typeof SettleResult.Type;
const decodeSettleResult = Schema.decodeUnknownSync(Schema.UndefinedOr(SettleResult));
const decodeContextResult = Schema.decodeUnknownSync(
  Schema.UndefinedOr(Schema.Struct({ messages: Schema.optionalKey(Schema.Array(Schema.Struct({ content: Schema.optionalKey(Schema.Unknown) }))) })),
);

type Ctx = {
  ui: Pick<ExtensionUIContext, "notify" | "setWorkingMessage">;
  sessionManager: { getSessionFile: () => string | undefined };
  cwd: string;
  model: { provider: string; id: string } | undefined;
  signal: AbortSignal | undefined;
};

export type Driven = {
  home: string;
  notified: string[];
  tools: () => string[];
  switchTo: (provider: string, id?: string) => Promise<void>;
  prompt: (text: string) => Promise<void>;
  custom: (text: string) => Promise<void>;
  beforeSettle: (said?: string) => Promise<SettleResult | undefined>;
  quit: () => Promise<void>;
  carried: () => Promise<string | undefined>;
  call: (tool: string, input: Record<string, unknown>) => Promise<unknown>;
  result: (tool: string, input: Record<string, unknown>, isError?: boolean) => Promise<void>;
};

const sessions: Array<() => Promise<void>> = [];

export async function closeSessions(): Promise<void> {
  for (const close of sessions.splice(0)) await close();
}

function restore(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

export const HELD = ["read", "bash", "edit", "write", "ffgrep", "fffind", "web_search"];

export type LoadOptions = {
  sessionFile?: false | string;
  provider?: string;
  modelId?: string;
  held?: readonly string[];
  active?: readonly string[];
  all?: readonly string[];
  cwd?: string;
  sessionStart?: false;
};

export async function load(index: Index, options: LoadOptions = {}): Promise<Driven> {
  return loadRaw(`${JSON.stringify(index, null, 2)}\n`, options);
}

export async function loadRaw(contents: string, options: LoadOptions = {}): Promise<Driven> {
  const home = mkdtempSync(join(tmpdir(), "skills-pi-"));
  const dir = join(home, "extension");
  mkdirSync(dir, { recursive: true });
  symlinkSync(join(repo, "node_modules"), join(home, "node_modules"), "dir");
  for (const [dest, bytes] of await valueOf(bundle(PI_BUNDLE, repo))) writeFileSync(join(dir, basename(dest)), bytes);
  writeFileSync(join(dir, INDEX), contents);

  const notified: string[] = [];
  const listeners = new Map<string, Array<(event: unknown, ctx: Ctx) => unknown>>();
  let ctx: Ctx = {
    ui: { notify: (message) => notified.push(message), setWorkingMessage: () => {} },
    sessionManager: { getSessionFile: () => (options.sessionFile === false ? undefined : (options.sessionFile ?? join(dir, "session.jsonl"))) },
    cwd: options.cwd ?? home,
    model: options.provider ? { provider: options.provider, id: options.modelId ?? "a-model" } : undefined,
    signal: undefined,
  };

  let active = [...(options.active ?? options.held ?? HELD)];

  const pi = {
    getAllTools() {
      return (options.all ?? options.held ?? HELD).map((name) => ({ name, sourceInfo: { path: `/${name}.ts` } }));
    },
    getActiveTools() {
      return active;
    },
    setActiveTools(names: string[]) {
      active = names;
    },
    on(event: string, handler: (event: unknown, ctx: Ctx) => unknown) {
      listeners.set(event, [...(listeners.get(event) ?? []), handler]);
    },
  };

  const emit = async (event: string, payload: unknown): Promise<void> => {
    for (const handler of listeners.get(event) ?? []) await handler(payload, ctx);
  };

  sessions.push(async () => {
    await emit("session_shutdown", {});
    unlinkSync(join(home, "node_modules"));
    rmSync(home, { recursive: true, force: true });
  });

  const was = { HOME: process.env.HOME, XDG_STATE_HOME: process.env.XDG_STATE_HOME };
  process.env.HOME = home;
  process.env.XDG_STATE_HOME = join(home, "state");
  try {
    const extension: (api: typeof pi) => void = (await import(pathToFileURL(join(dir, ENTRY)).href)).default;
    extension(pi);
  } finally {
    for (const [name, value] of Object.entries(was)) restore(name, value);
  }

  if (options.sessionStart !== false) await emit("session_start", { reason: "new" });

  return {
    home,
    notified,
    tools: () => active,
    switchTo: async (provider, id = "another-model") => {
      const previousModel = ctx.model;
      ctx.model = { provider, id };
      await emit("model_select", { type: "model_select", model: ctx.model, previousModel, source: "command" });
    },
    prompt: async (text) => {
      await emit("before_agent_start", { type: "before_agent_start", messageType: "user", prompt: text });
    },
    custom: async (text) => {
      await emit("before_agent_start", {
        type: "before_agent_start",
        messageType: "custom",
        message: { customType: "test", content: text, display: false },
      });
    },
    beforeSettle: async (said = "") => {
      const content = said ? [{ type: "text", text: said }] : [];
      await emit("message_end", { message: { role: "assistant", content, stopReason: "stop" } });
      let result: SettleResult | undefined;
      for (const handler of listeners.get("agent_before_settle") ?? []) {
        const returned = decodeSettleResult(await handler({ type: "agent_before_settle" }, ctx));
        result = returned ?? result;
      }
      return result;
    },
    quit: async () => {
      await emit("session_shutdown", { type: "session_shutdown", reason: "quit" });
      ctx = new Proxy(ctx, {
        get: () => {
          throw new Error("This extension ctx is stale after session replacement or reload.");
        },
      });
    },
    call: async (toolName, input) => {
      let out: unknown;
      for (const handler of listeners.get("tool_call") ?? []) out = await handler({ type: "tool_call", toolName, toolCallId: "t1", input }, ctx);
      return out;
    },
    result: async (toolName, input, isError = false) => {
      await emit("tool_result", { type: "tool_result", toolName, toolCallId: "t1", input, content: [], isError, details: undefined });
    },
    carried: async () => {
      await emit("before_agent_start", {});
      let out: string | undefined;
      for (const handler of listeners.get("context") ?? []) {
        const result = decodeContextResult(await handler({ messages: [] }, ctx));
        const content = result?.messages?.[0]?.content;
        if (typeof content === "string") out = content;
      }
      return out;
    },
  };
}
