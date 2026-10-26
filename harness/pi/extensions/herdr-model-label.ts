import net from "node:net";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

export const SOURCE = "skills:pi-model";

type Env = Readonly<Record<string, string | undefined>>;

export type HerdrPane = { readonly socket: string; readonly pane: string };

export function herdrPane(env: Env, os: NodeJS.Platform = process.platform): HerdrPane | undefined {
  const socket = env.HERDR_SOCKET_PATH;
  const pane = env.HERDR_PANE_ID;
  if (env.HERDR_ENV !== "1" || !socket || !pane) return undefined;
  return { socket: os === "win32" ? `\\\\.\\pipe\\${socket}` : socket, pane };
}

export const MAX_TOKEN = 79;

export type Usage = { readonly tokens: number | null; readonly contextWindow: number };

export type ModelRef = { readonly provider: string; readonly id: string };

export type Family = "claude" | "codex" | "deepseek" | "muse";

export const FAMILY_MARK = {
  claude: "\uEC82",
  codex: "\uEC81",
  deepseek: "\u{F18B4}",
  muse: "\u221E",
} as const satisfies Record<Family, string>;

export function family(model: ModelRef): Family | undefined {
  switch (model.provider) {
    case "claude-bridge":
      return "claude";
    case "openai":
    case "openai-codex":
      return "codex";
    case "opencode-go":
      if (model.id.startsWith("deepseek")) return "deepseek";
      if (model.id.startsWith("muse")) return "muse";
      return undefined;
    default:
      return undefined;
  }
}

const FAMILY_NAME = {
  claude: "claude-",
  codex: "gpt-",
  deepseek: "deepseek-",
  muse: "muse-",
} as const satisfies Record<Family, string>;

const SHOWN_SUFFIX: Readonly<Record<string, string>> = { "-contributor": "-c" };

function shownName(rest: string): string {
  for (const [suffix, short] of Object.entries(SHOWN_SUFFIX)) {
    if (rest.endsWith(suffix)) return `${rest.slice(0, -suffix.length)}${short}`;
  }
  return rest;
}

// A Nerd Font mark draws wider than the one cell herdr counts, so one space leaves it touching the name.
function markedName(model: ModelRef): string {
  const name = family(model);
  if (name === undefined) return model.id;
  const prefix = FAMILY_NAME[name];
  const rest = model.id.startsWith(prefix) ? model.id.slice(prefix.length) : model.id;
  return `${FAMILY_MARK[name]}  ${shownName(rest)}`;
}

export type ThinkingLevel = ReturnType<ExtensionAPI["getThinkingLevel"]>;

const THINKING_MARK = {
  off: "",
  minimal: "mn",
  low: "l",
  medium: "m",
  high: "h",
  xhigh: "xh",
  max: "mx",
} as const satisfies Record<ThinkingLevel, string>;

export function thinkingMark(level: ThinkingLevel): string {
  return THINKING_MARK[level];
}

export type Snapshot = {
  readonly model: string;
  readonly provider: string;
  readonly thinking: ThinkingLevel;
  readonly usage: Usage | undefined;
  readonly elapsedMs: number;
};

export type Tokens = { readonly model: string; readonly ctx: string | null; readonly elapsed: string };

const clip = (value: string): string => (value.length <= MAX_TOKEN ? value : `${value.slice(0, MAX_TOKEN - 1)}…`);

export function displayAgent(model: string, thinking: string): string {
  return clip(`pi · ${model} ${thinking}`);
}

export function tokenCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 999_500) return `${Math.round(n / 1000)}k`;
  return `${Number((n / 1_000_000).toFixed(1))}M`;
}

export function contextUsed(usage: Usage | undefined): string | null {
  if (!usage || usage.contextWindow <= 0) return null;
  if (usage.contextWindow >= 1_000_000) {
    if (usage.tokens === null) return "?%";
    return `${Math.round((usage.tokens / usage.contextWindow) * 100)}%`;
  }
  const window = tokenCount(usage.contextWindow);
  if (usage.tokens === null) return `?/${window}`;
  return `${tokenCount(usage.tokens)}/${window}`;
}

export function elapsed(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}m`;
}

export const WORKER_PREFIX = "└ ";

// FM_TASK_ID is exported only to ship and scout panes, never to the main or secondmate session.
export function isWorkerSession(env: Env): boolean {
  return env.FM_TASK_ID !== undefined && env.FM_TASK_ID !== "";
}

export function tokensOf(snapshot: Snapshot, prefix = ""): Tokens {
  const name = markedName({ provider: snapshot.provider, id: snapshot.model });
  const thinking = thinkingMark(snapshot.thinking);
  return {
    model: clip(`${prefix}${name}${thinking === "" ? "" : ` ${thinking}`}`),
    ctx: contextUsed(snapshot.usage),
    elapsed: elapsed(snapshot.elapsedMs),
  };
}

export type MetadataRequest = {
  readonly id: string;
  readonly method: "pane.report_metadata";
  readonly params: {
    readonly pane_id: string;
    readonly source: string;
    readonly agent: "pi";
    readonly display_agent: string;
    readonly tokens: Tokens;
    readonly seq: number;
  };
};

export function metadataRequest(pane: string, snapshot: Snapshot, seq: number, prefix = ""): MetadataRequest {
  return {
    id: `${SOURCE}:${seq}`,
    method: "pane.report_metadata",
    params: {
      pane_id: pane,
      source: SOURCE,
      agent: "pi",
      display_agent: displayAgent(snapshot.model, snapshot.thinking),
      tokens: tokensOf(snapshot, prefix),
      seq,
    },
  };
}

export type RetractRequest = {
  readonly id: string;
  readonly method: "pane.report_metadata";
  readonly params: {
    readonly pane_id: string;
    readonly source: string;
    readonly agent: "pi";
    readonly tokens: { readonly [K in keyof Tokens]: null };
    readonly seq: number;
  };
};

export type Request = MetadataRequest | RetractRequest;

// herdr drops display_agent once the pane stops being pi, yet keeps the tokens for whatever agent runs next.
export function retractRequest(pane: string, seq: number): RetractRequest {
  return {
    id: `${SOURCE}:${seq}`,
    method: "pane.report_metadata",
    params: { pane_id: pane, source: SOURCE, agent: "pi", tokens: { model: null, ctx: null, elapsed: null }, seq },
  };
}

function call(socket: string, request: object, timeoutMs = 1000): Promise<string | undefined> {
  return new Promise((resolve) => {
    const conn = net.createConnection(socket);
    let reply = "";
    const finish = (line: string | undefined) => {
      clearTimeout(timer);
      conn.destroy();
      resolve(line);
    };
    const timer = setTimeout(() => finish(undefined), timeoutMs);
    timer.unref();
    conn.on("connect", () => conn.write(`${JSON.stringify(request)}\n`));
    conn.on("data", (chunk) => {
      reply += chunk.toString();
      const end = reply.indexOf("\n");
      if (end >= 0) finish(reply.slice(0, end));
    });
    conn.on("error", () => finish(undefined));
    conn.on("end", () => finish(undefined));
  });
}

export async function send(socket: string, request: object, timeoutMs = 1000): Promise<boolean> {
  return (await call(socket, request, timeoutMs)) !== undefined;
}

function result(reply: string | undefined, key: string): unknown {
  if (reply === undefined) return undefined;
  try {
    return field(field(JSON.parse(reply), "result"), key);
  } catch {
    return undefined;
  }
}

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
}

async function paneIsPi(herdr: HerdrPane): Promise<boolean> {
  const reply = await call(herdr.socket, { id: `${SOURCE}:pane`, method: "pane.get", params: { pane_id: herdr.pane } });
  return field(result(reply, "pane"), "agent") === "pi";
}

// A pi started in tmux or any other terminal of its own inherits HERDR_PANE_ID, yet herdr's agent for the pane is the pane's foreground job.
export function inForegroundJob(reply: string | undefined, pid: number): boolean {
  const processes = field(result(reply, "process_info"), "foreground_processes");
  return Array.isArray(processes) && processes.some((entry) => field(entry, "pid") === pid);
}

async function ownsPane(herdr: HerdrPane, pid: number): Promise<boolean> {
  const reply = await call(herdr.socket, { id: `${SOURCE}:process`, method: "pane.process_info", params: { pane_id: herdr.pane } });
  return inForegroundJob(reply, pid);
}

export type Poll = { readonly attempts: number; readonly intervalMs: number };

async function piDetected(herdr: HerdrPane, poll: Poll): Promise<boolean> {
  for (let attempt = 0; attempt < poll.attempts; attempt += 1) {
    if (await paneIsPi(herdr)) return true;
    await new Promise((resolve) => setTimeout(resolve, poll.intervalMs).unref());
  }
  return false;
}

// herdr answers ok yet drops a pi-scoped report that arrives before it has detected pi in the pane.
export function deliverAsPaneAgent(
  herdr: HerdrPane,
  pid: number,
  poll: Poll = { attempts: 50, intervalMs: 100 },
): (request: Request) => Promise<void> {
  let queue = Promise.resolve();
  return (request) => {
    queue = queue.then(async () => {
      if ((await ownsPane(herdr, pid)) && (await piDetected(herdr, poll))) await send(herdr.socket, request);
    });
    return queue;
  };
}

export type Context = {
  readonly mode: ExtensionContext["mode"];
  readonly model: ModelRef | undefined;
  getContextUsage(): Usage | undefined;
};

type Handler = (event: unknown, ctx: Context) => void;

export type Pi = {
  on(event: "session_start", handler: Handler): unknown;
  on(event: "model_select", handler: Handler): unknown;
  on(event: "thinking_level_select", handler: Handler): unknown;
  on(event: "turn_end", handler: Handler): unknown;
  on(event: "session_compact", handler: Handler): unknown;
  on(event: "session_tree", handler: Handler): unknown;
  on(event: "session_shutdown", handler: () => Promise<void>): unknown;
  getThinkingLevel(): ThinkingLevel;
};

export type Clock = {
  readonly now: () => number;
  readonly every: (ms: number, tick: () => void) => () => void;
};

export const REFRESH_MS = 30_000;

const realClock: Clock = {
  now: Date.now,
  every: (ms, tick) => {
    const timer = setInterval(tick, ms);
    timer.unref();
    return () => clearInterval(timer);
  },
};

export function install(pi: Pi, pane: string, deliver: (request: Request) => unknown, clock: Clock, env: Env): void {
  const prefix = isWorkerSession(env) ? WORKER_PREFIX : "";
  let seq = clock.now() * 1000;
  let startedAt = clock.now();
  let latest: Snapshot | undefined;
  let reported: string | undefined;
  let stopTimer: (() => void) | undefined;

  const report = () => {
    if (!latest || !latest.model) return;
    const snapshot = { ...latest, elapsedMs: clock.now() - startedAt };
    const key = JSON.stringify([displayAgent(snapshot.model, snapshot.thinking), tokensOf(snapshot, prefix)]);
    if (key === reported) return;
    reported = key;
    seq += 1;
    deliver(metadataRequest(pane, snapshot, seq, prefix));
  };

  const observe: Handler = (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    // The timer below outlives a session replacement, and every ctx call after one throws, so the tick reads values taken here.
    const model = ctx.model;
    latest = {
      model: model === undefined ? "" : model.id,
      provider: model?.provider ?? "",
      thinking: pi.getThinkingLevel(),
      usage: ctx.getContextUsage(),
      elapsedMs: 0,
    };
    report();
  };

  const stop = () => {
    stopTimer?.();
    stopTimer = undefined;
  };

  pi.on("session_start", (event, ctx) => {
    if (ctx.mode !== "tui") return;
    stop();
    startedAt = clock.now();
    stopTimer = clock.every(REFRESH_MS, report);
    observe(event, ctx);
  });
  pi.on("model_select", observe);
  pi.on("thinking_level_select", observe);
  pi.on("turn_end", observe);
  pi.on("session_compact", observe);
  pi.on("session_tree", observe);
  pi.on("session_shutdown", async () => {
    stop();
    latest = undefined;
    if (reported === undefined) return;
    reported = undefined;
    seq += 1;
    await deliver(retractRequest(pane, seq));
  });
}

export default function (pi: Pi): void {
  const herdr = herdrPane(process.env);
  if (!herdr) return;
  const deliver = deliverAsPaneAgent(herdr, process.pid);
  install(pi, herdr.pane, deliver, realClock, process.env);
}
