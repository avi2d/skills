import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { carriage } from "./dispatch";
import type { Change, CodexHunk } from "./forbid";
import { standing } from "./repo-walk";
import { answer, handle, isHook, readPayload, type HookAdapter, type Payload, type Writes } from "./hook-harness";
import { readIndex } from "./read-index";
import { field, readTranscript, textsOf, type Entry } from "./transcript";

const INDEX_PATH = fileURLToPath(new URL("./dispatch.json", import.meta.url));

type Patched = { path: string; content: string } | { path: string; edits: CodexHunk[] };

const HEADER = /^\*\*\* (Add|Update|Delete) File: (.+)$/;

const text = (lines: readonly string[]): string => lines.map((line) => `${line}\n`).join("");

function hunks(lines: readonly string[]): CodexHunk[] {
  const out: CodexHunk[] = [];
  let old: string[] = [];
  let now: string[] = [];
  let context: string | undefined;
  const close = (atEnd = false): void => {
    if (old.length > 0 || now.length > 0) {
      out.push({ old: text(old), new: text(now), ...(atEnd ? { atEnd } : {}), ...(context === undefined ? {} : { context }) });
    }
    old = [];
    now = [];
    context = undefined;
  };
  for (const line of lines) {
    if (line.startsWith("@@")) {
      close();
      if (line.startsWith("@@ ")) context = line.slice(3);
    }
    else if (line === "*** End of File") close(true);
    else if (line.startsWith("-")) old.push(line.slice(1));
    else if (line.startsWith("+")) now.push(line.slice(1));
    else if (!line.startsWith("*** ")) {
      old.push(line.slice(1));
      now.push(line.slice(1));
    }
  }
  close();
  return out;
}

export function readPatch(command: string): { writes: string[]; changes: Patched[] } {
  const writes: string[] = [];
  const changes: Patched[] = [];
  let file: { verb: string; path: string; lines: string[] } | undefined;
  const close = (): void => {
    if (file?.verb === "Add") {
      const content = file.lines.filter((line) => line.startsWith("+")).map((line) => line.slice(1));
      changes.push({ path: file.path, content: content.join("\n") });
    } else if (file?.verb === "Update") changes.push({ path: file.path, edits: hunks(file.lines) });
    file = undefined;
  };
  for (const line of command.split(/\r?\n/)) {
    const [, verb, path] = HEADER.exec(line) ?? [];
    if (verb !== undefined && path !== undefined) {
      close();
      file = { verb, path: path.trim(), lines: [] };
      writes.push(file.path);
    } else if (line === "*** End Patch") close();
    else file?.lines.push(line);
  }
  close();
  return { writes, changes };
}

const BLOCKED = /^(?:Command|Tool call) blocked by PreToolUse hook: /;

const ANSWERS = ["reasoning", "function_call", "custom_tool_call", "local_shell_call", "web_search_call", "tool_search_call"];

export function transcriptEntry(line: unknown): Entry | undefined {
  const at = field(line, "timestamp");
  const item = field(line, "payload");
  const type = field(item, "type");
  if (field(line, "type") !== "response_item" || typeof at !== "string" || typeof type !== "string") return undefined;
  if (type === "message") {
    if (field(item, "role") === "assistant") return { at, carried: [], answer: "once-fed-back" };
    const kinds = field(field(item, "internal_chat_message_metadata_passthrough"), "content_item_kinds");
    const parts = field(item, "content");
    const carried =
      Array.isArray(parts) && Array.isArray(kinds)
        ? parts.flatMap((part: unknown, i) => (kinds[i] === "hooks.additional_context" ? textsOf([part]) : []))
        : [];
    return carried.length > 0 ? { at, carried, fedBack: true } : undefined;
  }
  if (ANSWERS.includes(type)) return { at, carried: [], answer: "once-fed-back" };
  if (type === "function_call_output" || type === "custom_tool_call_output") {
    const output = textsOf(field(item, "output")).join("\n");
    return { at, carried: BLOCKED.test(output) ? [output] : [], fedBack: true };
  }
  return undefined;
}

const NAME = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

const named = (value: unknown): string | undefined => (typeof value === "string" && NAME.test(value) ? value : undefined);

function identityLines(path: string): unknown[] {
  let recorded: string | undefined;
  try {
    recorded = readTranscript(path);
  } catch {
    return [];
  }
  return (recorded ?? "").split("\n").flatMap((line, at) => {
    if (at > 0 && !line.includes("turn_context")) return [];
    try {
      const parsed: unknown = JSON.parse(line);
      return [parsed];
    } catch {
      return [];
    }
  });
}

function modelOf(payload: Payload): string | undefined {
  const { session_id: session, transcript_path: path } = payload;
  if (!session || !path) return undefined;
  let provider: string | undefined;
  let model: string | undefined;
  for (const line of identityLines(path)) {
    const item = field(line, "payload");
    if (field(line, "type") === "session_meta" && field(item, "id") === session) provider = named(field(item, "model_provider"));
    if (field(line, "type") === "turn_context") model = named(field(item, "model"));
  }
  return provider === undefined || model === undefined ? undefined : `${provider}/${model}`;
}

export function unsandboxed(payload: Payload): boolean {
  const path = payload.transcript_path;
  if (!path) return false;
  let policy: unknown;
  for (const line of identityLines(path)) {
    if (field(line, "type") === "turn_context") policy = field(field(line, "payload"), "sandbox_policy");
  }
  return field(policy, "type") === "danger-full-access";
}

function writesOf(payload: Payload): Writes {
  const input = payload.tool_input ?? {};
  const patch = payload.tool_name === "apply_patch" && typeof input.command === "string" ? input.command : "";
  const { writes, changes: patched } = readPatch(patch);
  const changes: Change[] = patched.map((change) => ({
    ...change,
    before: standing(resolve(payload.cwd ?? "", change.path)),
  }));
  return { writes, changes };
}

const CODEX: HookAdapter = {
  harness: "codex",
  entry: transcriptEntry,
  transcript: (payload) => payload.transcript_path,
  writes: writesOf,
  model: modelOf,
  rewriteDecision: "allow",
  unsandboxed,
  say: (reply, index) => [carriage(index, reply.rules), ...reply.text].filter((part) => part).join("\n\n"),
};

if (import.meta.main) {
  const payload = readPayload(readFileSync(0, "utf8"));
  const name = process.argv[2] ?? payload.hook_event_name ?? "";
  if (isHook(name)) await answer(payload, () => handle(CODEX, readIndex(INDEX_PATH, "codex"), name, payload));
}
