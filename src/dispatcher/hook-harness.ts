import { appendFileSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { dispatch, placed, repoGlobs, type Action, type Event, type Index, type Step } from "./dispatch";
import { decodeRunState, isRecord, START, type RunState } from "./run-state";
import { logLine } from "./dispatch-log";
import type { Change } from "./forbid";
import { VERIFY_BUDGET_SECONDS, fingerprint, sight, unreadableNote, verify } from "./gate";
import { steer, steeredLine, type Steered } from "./job-queue";
import { readProject, type Project } from "./project";
import { cappedNote, repoFiles } from "./repo-walk";
import { hear, isPlace, listenFor, readTranscript, type EntryReader, type Place } from "./transcript";
import { releasedText, type Gate } from "./verdict";

export const because = (e: unknown): string => (e instanceof Error ? e.message : String(e));

const HOME = process.env.HOME ?? homedir();

export const STATE = join(process.env.XDG_STATE_HOME ?? join(HOME, ".local", "state"), "skills");

const LOG_PATH = join(STATE, "dispatch.log");

export const named = (id: string): string => id.replace(/[^a-zA-Z0-9._-]/g, "-");

export const HOOKS = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "PreCompact", "Stop", "SessionEnd", "PostModelSwitch"] as const;
export type Hook = (typeof HOOKS)[number];

export const isHook = (value: string): value is Hook => (HOOKS as readonly string[]).includes(value);

export type Reply = { rules: string[]; text: string[]; refuse: boolean; told: string[] };

const SILENT: Reply = { rules: [], text: [], refuse: false, told: [] };

export function hookOutput(hook: Hook, said: string, mode: "context" | "deny" | "block", told = ""): string | undefined {
  const shown = told === "" ? {} : { systemMessage: told };
  if (said === "") return told === "" ? undefined : JSON.stringify(shown);
  if (mode === "deny") {
    return JSON.stringify({
      ...shown,
      hookSpecificOutput: { hookEventName: hook, permissionDecision: "deny", permissionDecisionReason: said },
    });
  }
  if (mode === "block") return JSON.stringify({ ...shown, decision: "block", reason: said });
  return JSON.stringify({ ...shown, hookSpecificOutput: { hookEventName: hook, additionalContext: said } });
}

function speak(action: Action): Reply {
  switch (action.type) {
    case "inject":
      return { ...SILENT, rules: [action.rule] };
    case "deliver":
      return { ...SILENT, rules: [action.rule], refuse: true };
    case "refuse":
      return { ...SILENT, text: [action.text], refuse: true };
    case "hold":
      return { ...SILENT, text: [action.text] };
    case "release":
      return { ...SILENT, told: [releasedText(action.why)] };
    case "verify":
    case "passed":
    case "pull":
    case "withdraw":
    case "trim":
    case "queue":
    case "broken":
    case "unjudged":
    case "switched":
    case "ignored":
    case "dropped":
      return SILENT;
    default:
      action satisfies never;
      return SILENT;
  }
}

const merge = (replies: readonly Reply[]): Reply => ({
  rules: replies.flatMap((r) => r.rules),
  text: replies.flatMap((r) => r.text),
  refuse: replies.some((r) => r.refuse),
  told: replies.flatMap((r) => r.told),
});

export function note(session: string, line: string): void {
  try {
    mkdirSync(dirname(LOG_PATH), { recursive: true });
    appendFileSync(LOG_PATH, `${new Date().toISOString()} ${session} ${line}\n`);
  } catch {
  }
}

type Held = { state: RunState; awaiting: Place[] };

function readState(path: string): Held {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!isRecord(parsed)) return { state: START, awaiting: [] };
    const { awaiting, ...state } = parsed;
    const decoded = decodeRunState(state);
    if (decoded === undefined) return { state: START, awaiting: [] };
    return { state: decoded, awaiting: Array.isArray(awaiting) ? awaiting.filter(isPlace) : [] };
  } catch {
  }
  return { state: START, awaiting: [] };
}

function writeState(path: string, session: string, { state, awaiting }: Held): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(awaiting.length > 0 ? { ...state, awaiting } : state, null, 2)}\n`);
  } catch (e) {
    note(session, `broken dispatcher: this session's state could not be written down: ${because(e)}`);
  }
}

const PAYLOAD_TEXT = [
  "hook_event_name",
  "session_id",
  "cwd",
  "source",
  "prompt",
  "tool_name",
  "transcript_path",
  "agent_id",
  "prompt_id",
  "model",
  "to_model",
] as const;

export type Payload = { [K in (typeof PAYLOAD_TEXT)[number]]?: string } & { tool_input?: Record<string, unknown> };

export function readPayload(raw: string): Payload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!isRecord(parsed)) return {};
  const payload: Payload = {};
  for (const key of PAYLOAD_TEXT) {
    const value = parsed[key];
    if (typeof value === "string") payload[key] = value;
  }
  if (isRecord(parsed.tool_input)) payload.tool_input = parsed.tool_input;
  return payload;
}

export const sessionOf = (payload: Payload): string => payload.session_id ?? "unnamed";

export type Writes = { writes: readonly string[]; changes: readonly Change[] };

export type HookAdapter = {
  harness: "claude" | "codex";
  entry: EntryReader;
  transcript: (payload: Payload) => string | undefined;
  writes: (payload: Payload) => Writes;
  say: (reply: Reply, index: Index, hook: Hook, payload: Payload) => string;
  model: (payload: Payload) => string | undefined;
  // Codex applies a rewritten input only beside an allow, and on Claude Code an allow would skip its own permission check.
  rewriteDecision?: "allow";
  unsandboxed?: (payload: Payload) => boolean;
  forget?: (session: string) => void;
};

type Lookups = {
  files: () => string[] | undefined;
  gate: () => Gate | undefined;
  project: () => Project | undefined;
  walked: () => RunState["walked"];
};

function lookupsFor(index: Index, hook: Hook, payload: Payload, checked: RunState): Lookups {
  const { cwd } = payload;
  let walked = checked.walked;
  return {
    files: () => {
      if (!cwd) return undefined;
      const found = repoFiles(cwd, repoGlobs(index, placed(checked, ["injected", "checked"])), checked.walked?.[cwd]);
      if (found.walked?.capped) {
        note(sessionOf(payload), cappedNote(cwd));
        walked = { ...checked.walked, [cwd]: found.walked };
      }
      return found.files;
    },
    gate: () => {
      const found = cwd ? sight(cwd) : undefined;
      if (found && "unreadable" in found) {
        if (hook === "Stop") note(sessionOf(payload), unreadableNote(found));
        return undefined;
      }
      return found?.gate;
    },
    project: () => (cwd ? readProject(cwd) : undefined),
    walked: () => walked,
  };
}

function promptEvent(payload: Payload, { files, gate, project }: Lookups): Event {
  const found = files();
  const declared = project();
  const at = gate();
  return {
    type: "prompt",
    ...(found ? { files: found } : {}),
    ...(declared ? { project: declared } : {}),
    ...(at ? { baseline: { root: at.root, tree: at.tree, ...(at.head === undefined ? {} : { head: at.head }) } } : {}),
    ...(payload.prompt ? { text: payload.prompt } : {}),
  };
}

function readOf(payload: Payload): string[] {
  const path = payload.tool_input?.file_path;
  if (payload.tool_name !== "Read" || typeof path !== "string") return [];
  try {
    return [realpathSync(resolve(payload.cwd ?? "", path))];
  } catch {
    return [];
  }
}

function toolCallEvent(payload: Payload, { writes, changes }: Writes): Event {
  return {
    type: "tool-call",
    tool: payload.tool_name ?? "",
    input: payload.tool_input ?? {},
    ...(writes.length > 0 ? { writes } : {}),
    ...(changes.length > 0 ? { changes } : {}),
  };
}

function eventFor(hook: Hook, payload: Payload, adapter: HookAdapter, lookups: Lookups, model: string | undefined): Event | undefined {
  switch (hook) {
    case "SessionStart":
      return payload.source === "compact"
        ? undefined
        : { type: "session-start", carrying: payload.source === "resume", ...(model === undefined ? {} : { model }) };
    case "UserPromptSubmit":
      return promptEvent(payload, lookups);
    case "PreToolUse":
      return toolCallEvent(payload, adapter.writes(payload));
    case "PostToolUse":
      return { type: "read", tool: payload.tool_name ?? "", paths: readOf(payload) };
    case "PreCompact":
      return { type: "compaction" };
    case "Stop": {
      const found = lookups.gate();
      return { type: "settled", ...(found ? { gate: found } : {}) };
    }
    case "SessionEnd":
      return { type: "session-end" };
    case "PostModelSwitch":
      return undefined;
    default:
      hook satisfies never;
      return undefined;
  }
}

async function judged(index: Index, done: Step, session: string, settle: (state: RunState) => void): Promise<Action[]> {
  const asked = done.actions.find((action) => action.type === "verify");
  if (!asked) return [];
  const { seconds, verdict } = await verify(asked.root, asked.checks, VERIFY_BUDGET_SECONDS, asked.base);
  const after = fingerprint(asked.root) ?? asked.tree;
  const step = dispatch(index, { type: "verdict", tree: asked.tree, after, seconds, verdict }, done.state);
  settle(step.state);
  for (const action of step.actions) note(session, logLine(action));
  return step.actions;
}

function steeredCall(adapter: HookAdapter, payload: Payload): Steered | undefined {
  const command = payload.tool_input?.command;
  if (payload.tool_name !== "Bash" || typeof command !== "string") return undefined;
  if (adapter.unsandboxed?.(payload) === false) return undefined;
  const steered = steer(command, payload.cwd ?? process.cwd());
  if (steered !== undefined) note(sessionOf(payload), steeredLine(steered));
  return steered;
}

function rewriteOutput(adapter: HookAdapter, updatedInput: Record<string, unknown>, told: string): string {
  const decision = adapter.rewriteDecision === undefined ? {} : { permissionDecision: adapter.rewriteDecision };
  return JSON.stringify({
    ...(told === "" ? {} : { systemMessage: told }),
    hookSpecificOutput: { hookEventName: "PreToolUse", ...decision, updatedInput },
  });
}

const modeOf = (hook: Hook, reply: Reply, actions: readonly Action[]): "context" | "deny" | "block" => {
  if (reply.refuse) return "deny";
  return hook === "Stop" && actions.some((a) => a.type === "hold") ? "block" : "context";
};

export async function handle(adapter: HookAdapter, index: Index, hook: Hook, payload: Payload): Promise<string | undefined> {
  const session = sessionOf(payload);
  const at = new Date().toISOString();
  const path = join(STATE, adapter.harness, `${named(session)}.json`);
  const before = readState(path);
  const heard = hear(index, before.state, before.awaiting, readTranscript, adapter.entry, hook === "SessionEnd");
  for (const line of [...heard.notes, ...heard.actions.map(logLine)]) note(session, line);

  const checked = heard.state;
  const lookups = lookupsFor(index, hook, payload, checked);
  const model = adapter.model(payload);
  const event = eventFor(hook, payload, adapter, lookups, model);

  const switched =
    hook !== "SessionStart" && model !== undefined && model !== checked.model
      ? dispatch(index, { type: "model-switch", model }, checked)
      : { actions: [], state: checked };
  const stepped = event ? dispatch(index, event, switched.state) : { actions: [], state: switched.state };
  const done: Step = { actions: [...switched.actions, ...stepped.actions], state: stepped.state };
  const listening = listenFor(heard.awaiting, done.state, done.actions, adapter.transcript(payload), at);
  const settle = (state: RunState): void => {
    if (hook === "SessionEnd") {
      rmSync(path, { force: true });
      adapter.forget?.(session);
      return;
    }
    const walked = lookups.walked();
    const kept = walked === undefined || walked === checked.walked ? state : { ...state, walked };
    writeState(path, session, { state: kept, awaiting: listening.awaiting });
  };
  settle(done.state);
  for (const line of [...done.actions.map(logLine), ...listening.notes]) note(session, line);
  if (!event) return undefined;

  const actions = [...done.actions, ...(await judged(index, done, session, settle))];
  const reply = merge(actions.map(speak));
  const mode = modeOf(hook, reply, actions);
  const told = reply.told.join("\n");
  const steered = hook === "PreToolUse" && mode !== "deny" ? steeredCall(adapter, payload) : undefined;
  if (steered?.type === "refuse") return hookOutput(hook, steered.text, "deny", told);
  if (steered?.type === "queue") return rewriteOutput(adapter, { ...payload.tool_input, command: steered.command }, told);
  return hookOutput(hook, adapter.say(reply, index, hook, payload), mode, told);
}

export async function answer(payload: Payload, reply: () => Promise<string | undefined>): Promise<void> {
  try {
    const out = await reply();
    if (out) process.stdout.write(out);
  } catch (e) {
    note(sessionOf(payload), `broken dispatcher: ${because(e)}`);
  }
}
