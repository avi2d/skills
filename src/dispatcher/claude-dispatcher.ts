import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { carriages, type Index } from "./dispatch";
import type { Change } from "./forbid";
import { standing } from "./repo-walk";
import {
  STATE,
  answer,
  because,
  handle,
  hookOutput,
  isHook,
  named,
  note,
  readPayload,
  sessionOf,
  type Hook,
  type HookAdapter,
  type Payload,
  type Reply,
  type Writes,
} from "./hook-harness";
import { readIndex } from "./read-index";
import { field, textsOf, type Entry } from "./transcript";

const INDEX_PATH = fileURLToPath(new URL("./dispatch.json", import.meta.url));

const handedDir = (session: string): string => join(STATE, "claude", `${named(session)}.parts`);

const handedPath = (session: string, prompt: string): string => join(handedDir(session), `${named(prompt)}.json`);

export const CONTEXT_LIMIT = 10_000;

export const PROMPT_HOOKS = 3;

export const HAND_OFF_WAIT_SECONDS = 16;

export function transcriptEntry(line: unknown): Entry | undefined {
  const at = field(line, "timestamp");
  if (typeof at !== "string") return undefined;
  const type = field(line, "type");
  const message = field(line, "message");
  if (type === "assistant") {
    const id = field(message, "id");
    return { at, carried: [], answer: { message: typeof id === "string" ? id : undefined } };
  }
  const attachment = field(line, "attachment");
  if (type === "attachment" && field(attachment, "type") === "hook_additional_context") {
    return { at, carried: textsOf(field(attachment, "content")) };
  }
  const content = field(message, "content");
  if (type === "user" && field(line, "toolDenialKind") !== undefined && Array.isArray(content)) {
    const denials = content.flatMap((part: unknown) => (field(part, "type") === "tool_result" ? textsOf(field(part, "content")) : []));
    return { at, carried: denials };
  }
  return undefined;
}

const MODEL_ID = /^([A-Za-z0-9][A-Za-z0-9._:-]*)(?:\[[A-Za-z0-9]+\])?$/;

function modelOf(payload: Payload): string | undefined {
  const [, id] = MODEL_ID.exec(payload.to_model ?? payload.model ?? "") ?? [];
  return id === undefined ? undefined : `claude-code/${id}`;
}

export function transcriptOf(payload: Payload): string | undefined {
  const main = payload.transcript_path;
  if (!main || !payload.agent_id) return main;
  return join(dirname(main), basename(main, ".jsonl"), "subagents", `agent-${payload.agent_id}.jsonl`);
}

function changeOf(tool: string | undefined, input: Record<string, unknown>, cwd: string | undefined): Change | undefined {
  const { file_path: path, content, old_string: old, new_string: now, replace_all: all } = input;
  if (typeof path !== "string") return undefined;
  if (tool === "Write" && typeof content === "string") return { path, before: standing(resolve(cwd ?? "", path)), content };
  if (tool === "Edit" && typeof old === "string" && typeof now === "string") {
    return { path, before: standing(resolve(cwd ?? "", path)), edits: [{ old, new: now, all: all === true }] };
  }
  return undefined;
}

function writesOf(payload: Payload): Writes {
  const input = payload.tool_input ?? {};
  const writing = payload.tool_name === "Write" || payload.tool_name === "Edit";
  const change = changeOf(payload.tool_name, input, payload.cwd);
  return {
    writes: writing && typeof input.file_path === "string" ? [input.file_path] : [],
    changes: change ? [change] : [],
  };
}

export function parts(index: Index, reply: Reply, limit: number): string[] {
  const packed: string[] = [];
  for (const piece of [...carriages(index, reply.rules, limit), ...reply.text]) {
    const last = packed.at(-1);
    if (last !== undefined && `${last}\n\n${piece}`.length <= limit) packed[packed.length - 1] = `${last}\n\n${piece}`;
    else packed.push(piece);
  }
  return packed;
}

function promptParts(session: string, index: Index, reply: Reply, prompt: string | undefined): string[] {
  if (!prompt) {
    const whole = parts(index, reply, Number.POSITIVE_INFINITY);
    const size = whole[0]?.length ?? 0;
    if (size > CONTEXT_LIMIT) {
      note(session, `broken dispatcher: Claude Code named no prompt_id, so this prompt's ${size} characters went out in one hook, past the ${CONTEXT_LIMIT} it previews`);
    }
    return whole;
  }
  const split = parts(index, reply, CONTEXT_LIMIT);
  if (split.length <= PROMPT_HOOKS) return split;
  note(
    session,
    `broken dispatcher: this prompt came to ${split.length} parts of up to ${CONTEXT_LIMIT} characters and ${PROMPT_HOOKS} prompt hooks carry them, so the last went out past the limit`,
  );
  return [...split.slice(0, PROMPT_HOOKS - 1), split.slice(PROMPT_HOOKS - 1).join("\n\n")];
}

function handOff(session: string, prompt: string, later: readonly string[]): void {
  const path = handedPath(session, prompt);
  try {
    rmSync(handedDir(session), { recursive: true, force: true });
    mkdirSync(handedDir(session), { recursive: true });
    writeFileSync(`${path}.partial`, JSON.stringify(later));
    renameSync(`${path}.partial`, path);
  } catch (e) {
    note(session, `broken dispatcher: this prompt's later parts could not be handed to the other prompt hooks: ${because(e)}`);
  }
}

function release(payload: Payload): void {
  const prompt = payload.prompt_id;
  if (!prompt) return;
  const session = sessionOf(payload);
  if (!existsSync(handedPath(session, prompt))) handOff(session, prompt, []);
}

const pause = (ms: number): Promise<void> => new Promise((wake) => setTimeout(wake, ms));

function handed(path: string): string[] {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (Array.isArray(parsed) && parsed.every((part): part is string => typeof part === "string")) return parsed;
  throw new Error(`${path} does not hold the parts one prompt hook hands the others`);
}

async function carry(payload: Payload, slot: number): Promise<string | undefined> {
  const prompt = payload.prompt_id;
  if (!prompt) return undefined;
  const session = sessionOf(payload);
  const path = handedPath(session, prompt);
  const deadline = Date.now() + HAND_OFF_WAIT_SECONDS * 1000;
  while (!existsSync(path)) {
    if (Date.now() >= deadline) {
      note(session, `broken dispatcher: prompt hook ${slot} waited ${HAND_OFF_WAIT_SECONDS}s for the first to hand it a part, and nothing came`);
      return undefined;
    }
    await pause(20);
  }
  const part = handed(path)[slot - 2];
  return part === undefined ? undefined : hookOutput("UserPromptSubmit", part, "context");
}

function say(reply: Reply, index: Index, hook: Hook, payload: Payload): string {
  if (hook !== "UserPromptSubmit") return parts(index, reply, Number.POSITIVE_INFINITY)[0] ?? "";
  const session = sessionOf(payload);
  const [said = "", ...later] = promptParts(session, index, reply, payload.prompt_id);
  if (payload.prompt_id) handOff(session, payload.prompt_id, later);
  return said;
}

const CLAUDE: HookAdapter = {
  harness: "claude",
  entry: transcriptEntry,
  transcript: transcriptOf,
  writes: writesOf,
  say,
  model: modelOf,
  forget: (session) => rmSync(handedDir(session), { recursive: true, force: true }),
};

if (import.meta.main) {
  const payload = readPayload(readFileSync(0, "utf8"));
  const [name = "", part] = (process.argv[2] ?? payload.hook_event_name ?? "").split("/");
  const slot = Number(part);
  const carrier = name === "UserPromptSubmit" && slot >= 2;
  if (isHook(name)) {
    await answer(payload, () => (carrier ? carry(payload, slot) : handle(CLAUDE, readIndex(INDEX_PATH, "claude-code"), name, payload)));
    if (name === "UserPromptSubmit" && !carrier) release(payload);
  }
}
