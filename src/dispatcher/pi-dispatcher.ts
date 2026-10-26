import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isReadToolResult,
  isToolCallEventType,
  type AgentBeforeSettleEventResult,
  type BeforeAgentStartEvent,
  type ContextEvent,
  type ContextEventResult,
  type ExtensionAPI,
  type ExtensionContext,
  type ExtensionUIContext,
  type MessageEndEvent,
  type SessionStartEvent,
  type ToolCallEvent,
  type ToolCallEventResult,
  type ToolResultEvent,
} from "@earendil-works/pi-coding-agent";
import {
  carriage,
  dispatch,
  repoGlobs,
  type Action,
  type Event,
  type Index,
} from "./dispatch";
import { START, type RunState } from "./run-state";
import { logLine } from "./dispatch-log";
import { releasedText } from "./verdict";
import { VERIFY_BUDGET_SECONDS, fingerprint, sight, unreadableNote, verify } from "./gate";
import type { Change, ClaudeEdit } from "./forbid";
import { steer, steeredLine } from "./job-queue";
import { readProject } from "./project";
import { readIndex } from "./read-index";
import { cappedNote, repoFiles, standing, type Listed } from "./repo-walk";

const because = (e: unknown): string => (e instanceof Error ? e.message : String(e));

const INDEX_PATH = fileURLToPath(new URL("./dispatch.json", import.meta.url));

const BUNDLE_DIR = dirname(fileURLToPath(import.meta.url));

function buildId(dir: string): string {
  try {
    const files = readdirSync(dir).sort();
    const hash = createHash("sha256");
    for (const file of files) {
      hash.update(file);
      hash.update(readFileSync(join(dir, file)));
    }
    return hash.digest("hex").slice(0, 12);
  } catch (e) {
    return `unreadable(${because(e)})`;
  }
}

const BUILD_ID = buildId(BUNDLE_DIR);

// node's `homedir()` reads `$HOME` every time, bun's answers from what the process started with.
const HOME = process.env.HOME ?? homedir();

const STATE = join(process.env.XDG_STATE_HOME ?? join(HOME, ".local", "state"), "skills");

const LOG_PATH = join(STATE, "dispatch.log");

const RULES = "skills-rule";

const GATE = "skills-gate";

const model = (ctx: { model: { provider: string; id: string } | undefined }): { model?: string } =>
  ctx.model ? { model: `${ctx.model.provider}/${ctx.model.id}` } : {};

// pi's own tools strip a leading `@` and expand `~` before they touch a path.
function onDisk(path: string, cwd: string): string {
  const bare = path.startsWith("@") ? path.slice(1) : path;
  return resolve(cwd, bare === "~" || bare.startsWith("~/") ? join(HOME, bare.slice(1)) : bare);
}

const mintName = (): string => `unnamed-${Math.random().toString(16).slice(2, 10)}`;

type DispatcherBase = {
  pi: ExtensionAPI;
  state: RunState;
  session: string;
  identified: boolean;
  topLevel: boolean;
  failed: string | undefined;
  shutDown: boolean;
  inForce: Set<string>;
  looked: { cwd: string; files: string[]; walked?: Listed } | undefined;
};

type Dispatcher =
  | (DispatcherBase & { readonly status: "loaded"; readonly index: Index })
  | (DispatcherBase & { readonly status: "broken"; readonly reason: string });

function note(dispatcher: Dispatcher, line: string): void {
  try {
    mkdirSync(dirname(LOG_PATH), { recursive: true });
    appendFileSync(LOG_PATH, `${new Date().toISOString()} ${dispatcher.session} ${line}\n`);
  } catch {
  }
}

function repository(dispatcher: Dispatcher, cwd: string): string[] {
  const { looked } = dispatcher;
  const recorded = looked?.cwd === cwd ? looked.walked : undefined;
  if (looked?.cwd === cwd && !recorded) return looked.files;
  let globs: string[];
  switch (dispatcher.status) {
    case "loaded":
      globs = repoGlobs(dispatcher.index);
      break;
    case "broken":
      globs = [];
      break;
  }
  const found = repoFiles(cwd, globs, recorded);
  if (found.tracked) dispatcher.looked = { cwd, files: found.files };
  if (found.walked?.capped) {
    note(dispatcher, cappedNote(cwd));
    dispatcher.looked = { cwd, files: found.files, walked: found.walked };
  }
  return found.files;
}

function perform(dispatcher: Dispatcher, action: Action, ui: ExtensionUIContext | undefined): void {
  switch (action.type) {
    case "inject":
    case "deliver":
      dispatcher.inForce.add(action.rule);
      return;
    case "withdraw":
      dispatcher.inForce.delete(action.rule);
      return;
    case "trim":
      dispatcher.pi.setActiveTools(action.tools);
      return;
    case "release":
      ui?.notify(releasedText(action.why), "warning");
      return;
    case "verify":
    case "passed":
    case "pull":
    case "hold":
    case "queue":
    case "broken":
    case "unjudged":
    case "switched":
    case "ignored":
    case "dropped":
    case "refuse":
      return;
    default:
      action satisfies never;
      return;
  }
}

function step(dispatcher: Dispatcher, event: Event, ui?: ExtensionUIContext): Action[] {
  switch (dispatcher.status) {
    case "broken":
      return [];
    case "loaded": {
      const done = dispatch(dispatcher.index, event, dispatcher.state);
      dispatcher.state = done.state;
      for (const action of done.actions) note(dispatcher, logLine(action));
      for (const action of done.actions) perform(dispatcher, action, ui);
      return done.actions;
    }
  }
}

function onSessionStart(dispatcher: Dispatcher, event: SessionStartEvent, ctx: ExtensionContext): void {
  const file = ctx.sessionManager.getSessionFile()?.split(/[\\/]/).pop();
  if (file) dispatcher.session = file;
  dispatcher.identified = true;
  dispatcher.topLevel = true;
  dispatcher.shutDown = false;
  note(dispatcher, `build ${BUILD_ID}`);
  dispatcher.inForce.clear();
  dispatcher.failed = undefined;

  switch (dispatcher.status) {
    case "broken":
      note(dispatcher, `broken dispatcher: ${dispatcher.reason}`);
      return;
    case "loaded": {
      dispatcher.state = START;
      const holding = dispatcher.pi.getActiveTools();
      step(dispatcher, { type: "session-start", carrying: event.reason === "reload", holding, ...model(ctx) }, ctx.ui);
      return;
    }
  }
}

function onPrompt(dispatcher: Dispatcher, event: BeforeAgentStartEvent, ctx: ExtensionContext): void {
  // 1.1.0 sends no messageType, and every such event is a user prompt.
  if (event.messageType === "custom") return;
  if (!dispatcher.identified) {
    dispatcher.identified = true;
    note(dispatcher, `build ${BUILD_ID}`);
    note(dispatcher, `this context reached a prompt with no session start, so pi is running it as an in-process sub-agent`);
  }
  const found = dispatcher.topLevel ? sight(ctx.cwd) : undefined;
  const at =
    found && "gate" in found
      ? { root: found.gate.root, tree: found.gate.tree, ...(found.gate.head === undefined ? {} : { head: found.gate.head }) }
      : undefined;
  const project = readProject(ctx.cwd);
  step(dispatcher, {
    type: "prompt",
    files: repository(dispatcher, ctx.cwd),
    text: event.prompt,
    ...(project ? { project } : {}),
    ...(at ? { baseline: at } : {}),
    ...model(ctx),
  });
}

function onContext(dispatcher: Dispatcher, event: ContextEvent): ContextEventResult | undefined {
  switch (dispatcher.status) {
    case "broken":
      return undefined;
    case "loaded": {
      const content = carriage(dispatcher.index, [...dispatcher.inForce]);
      step(dispatcher, { type: "requested", carrying: content ?? "", read: "request" });
      if (!content) return undefined;
      return {
        messages: [{ role: "custom" as const, customType: RULES, content, display: false, timestamp: Date.now() }, ...event.messages],
      };
    }
  }
}

function onToolCall(dispatcher: Dispatcher, event: ToolCallEvent, ctx: ExtensionContext): ToolCallEventResult | undefined {
  const writing = isToolCallEventType("write", event) || isToolCallEventType("edit", event);
  const changes: Change[] = [];
  if (isToolCallEventType("write", event)) {
    const { path, content } = event.input;
    changes.push({ path, before: standing(onDisk(path, ctx.cwd)), content });
  } else if (isToolCallEventType("edit", event)) {
    const { path, edits } = event.input;
    const replacements: ClaudeEdit[] = edits.map(({ oldText, newText }) => ({ old: oldText, new: newText, all: false }));
    changes.push({ path, before: standing(onDisk(path, ctx.cwd)), edits: replacements });
  }
  const refusals = step(dispatcher, {
    type: "tool-call",
    tool: event.toolName,
    input: event.input,
    ...(writing ? { writes: [event.input.path] } : {}),
    changes,
  }).flatMap((action) => (action.type === "refuse" ? [action.text] : []));
  if (refusals.length > 0) return { block: true, reason: refusals.join("\n\n") };
  return isToolCallEventType("bash", event) ? queue(dispatcher, event.input, ctx.cwd) : undefined;
}

function onToolResult(dispatcher: Dispatcher, event: ToolResultEvent, ctx: ExtensionContext): void {
  const { path } = event.input;
  if (!isReadToolResult(event) || event.isError || typeof path !== "string") return;
  let read: string;
  try {
    read = realpathSync(onDisk(path, ctx.cwd));
  } catch {
    return;
  }
  step(dispatcher, { type: "read", tool: event.toolName, paths: [read] });
}

function queue(dispatcher: Dispatcher, input: { command: string }, cwd: string): ToolCallEventResult | undefined {
  const steered = steer(input.command, cwd);
  if (steered === undefined) return undefined;
  note(dispatcher, steeredLine(steered));
  if (steered.type === "refuse") return { block: true, reason: steered.text };
  input.command = steered.command;
  return undefined;
}

function onMessageEnd(dispatcher: Dispatcher, event: MessageEndEvent): void {
  const message = event.message;
  if (message.role !== "assistant") return;
  dispatcher.failed =
    message.stopReason === "error" || message.stopReason === "aborted"
      ? `the turn ended as ${message.stopReason}${message.errorMessage ? `: ${message.errorMessage}` : ""}`
      : undefined;
}

function boundary(actions: readonly Action[]): AgentBeforeSettleEventResult | undefined {
  for (const action of actions) {
    if (action.type === "hold") {
      return { entries: [{ type: "custom_message", customType: GATE, content: action.text, display: true }], continue: true };
    }
    if (action.type === "release") {
      return { entries: [{ type: "custom_message", customType: GATE, content: releasedText(action.why), display: true }] };
    }
  }
  return undefined;
}

// A read of the field would stay narrowed across an await, during which session_shutdown can set it.
const shutDown = (dispatcher: Dispatcher): boolean => dispatcher.shutDown;

async function onBeforeSettle(dispatcher: Dispatcher, ctx: ExtensionContext): Promise<AgentBeforeSettleEventResult | undefined> {
  // Pi still settles a turn its quit aborted, after session_shutdown, when every ctx read throws.
  if (shutDown(dispatcher) || !dispatcher.topLevel) return undefined;
  switch (dispatcher.status) {
    case "broken":
      return undefined;
    case "loaded":
      break;
  }
  const found = sight(ctx.cwd);
  if (found && "unreadable" in found) {
    note(dispatcher, unreadableNote(found));
    return undefined;
  }
  const { failed } = dispatcher;
  const done = step(dispatcher, { type: "settled", ...(failed ? { failed } : {}), ...(found ? { gate: found.gate } : {}) }, ctx.ui);
  const asked = done.find((action) => action.type === "verify");
  if (!asked) return boundary(done);
  ctx.ui.setWorkingMessage(`verifying: ${asked.checks.map((check) => check.command).join(", then ")}`);
  try {
    const { seconds, verdict } = await verify(asked.root, asked.checks, VERIFY_BUDGET_SECONDS, asked.base);
    if (shutDown(dispatcher)) return undefined;
    const after = fingerprint(asked.root) ?? asked.tree;
    return boundary(step(dispatcher, { type: "verdict", tree: asked.tree, after, seconds, verdict }, ctx.ui));
  } finally {
    if (!shutDown(dispatcher)) ctx.ui.setWorkingMessage();
  }
}

function loaded(pi: ExtensionAPI): Dispatcher {
  const base: DispatcherBase = {
    pi,
    state: START,
    session: mintName(),
    identified: false,
    topLevel: false,
    failed: undefined,
    shutDown: false,
    inForce: new Set<string>(),
    looked: undefined,
  };
  try {
    return { ...base, status: "loaded", index: readIndex(INDEX_PATH, "pi") };
  } catch (e) {
    return { ...base, status: "broken", reason: because(e) };
  }
}

export default function (pi: ExtensionAPI): void {
  const dispatcher = loaded(pi);
  pi.on("session_start", (event, ctx) => onSessionStart(dispatcher, event, ctx));
  pi.on("before_agent_start", (event, ctx) => onPrompt(dispatcher, event, ctx));
  pi.on("model_select", (event) => {
    step(dispatcher, { type: "model-switch", model: `${event.model.provider}/${event.model.id}` });
  });
  pi.on("context", (event) => onContext(dispatcher, event));
  pi.on("tool_call", (event, ctx) => onToolCall(dispatcher, event, ctx));
  pi.on("tool_result", (event, ctx) => onToolResult(dispatcher, event, ctx));
  pi.on("session_compact", () => {
    step(dispatcher, { type: "compaction" });
  });
  pi.on("session_shutdown", () => {
    dispatcher.shutDown = true;
    step(dispatcher, { type: "session-end" });
  });
  pi.on("message_end", (event) => onMessageEnd(dispatcher, event));
  pi.on("agent_before_settle", async (_event, ctx) => onBeforeSettle(dispatcher, ctx));
}
