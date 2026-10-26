import { parseSkillBlock, type SessionEntry } from "@earendil-works/pi-coding-agent";

const MAX_NAME = 60;
const SESSION_START_PREFIX = "\u2063FIRSTMATE_OP: v1 session-start:";
const WORKER_LAUNCH_PREFIX = "\u2063FIRSTMATE_OP: v1 launch-brief:";
const MAIN_SESSION = "";

function firstLine(prompt: string): string {
  const line = prompt.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  const collapsed = line.replace(/\s+/g, " ");
  if (collapsed.length <= MAX_NAME) return collapsed;
  return collapsed.slice(0, MAX_NAME - 1).trimEnd() + "…";
}

function firstmateName(prompt: string): string | undefined {
  if (prompt.includes(SESSION_START_PREFIX)) return MAIN_SESSION;
  if (!prompt.startsWith(WORKER_LAUNCH_PREFIX)) return undefined;
  return prompt.match(/\/state\/([^/\s]+)\.inbox(?:\b|$)/)?.[1];
}

export function nameOf(prompt: string): string | undefined {
  const firstmate = firstmateName(prompt);
  if (firstmate !== undefined) return firstmate || undefined;
  const skill = parseSkillBlock(prompt);
  if (!skill) return firstLine(prompt) || undefined;
  return firstLine(`/${skill.name} ${skill.userMessage ?? ""}`) || undefined;
}

function textOf(content: string | readonly { readonly type: string; readonly text?: string }[]): string {
  if (typeof content === "string") return content;
  return content.map((part) => part.text ?? "").join("\n");
}

function userPromptsOf(entries: readonly SessionEntry[]): string[] {
  return entries.flatMap((entry) => (entry.type === "message" && entry.message.role === "user" ? [textOf(entry.message.content)] : []));
}

// The empty name clears the persisted one; undefined leaves a non-Firstmate session as it is.
function firstmateBranchName(entries: readonly SessionEntry[]): string | undefined {
  const isSessionStart = (entry: SessionEntry) => entry.type === "custom_message" && textOf(entry.content).includes(SESSION_START_PREFIX);
  if (entries.some(isSessionStart)) return MAIN_SESSION;
  const userPrompts = userPromptsOf(entries);
  if (userPrompts.some((prompt) => prompt.includes(SESSION_START_PREFIX))) return MAIN_SESSION;
  const [first] = userPrompts;
  return first === undefined ? undefined : firstmateName(first);
}

type Context = { readonly mode: string; readonly sessionManager: { getBranch(): readonly SessionEntry[] } };

export type Pi = {
  on(event: "session_start", handler: (event: unknown, ctx: Context) => void): unknown;
  on(event: "context", handler: (event: unknown, ctx: Context) => void): unknown;
  getSessionName(): string | undefined;
  setSessionName(name: string): void;
};

export default function (pi: Pi): void {
  // Per session: module scope would outlive it and name only the first session of the run.
  let named = false;

  const applyFirstmateName = (entries: readonly SessionEntry[]): boolean => {
    const name = firstmateBranchName(entries);
    if (name === undefined) return false;
    if ((pi.getSessionName() ?? MAIN_SESSION) !== name) pi.setSessionName(name);
    return true;
  };

  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    named = applyFirstmateName(ctx.sessionManager.getBranch());
  });

  // Not before_agent_start: messages other extensions return from it, such as the session-start digest, reach the branch only after it.
  pi.on("context", (_event, ctx) => {
    if (named) return;
    if (ctx.mode !== "tui") return;
    named = true;
    const entries = ctx.sessionManager.getBranch();
    if (applyFirstmateName(entries)) return;
    if (pi.getSessionName()) return;
    const name = nameOf(userPromptsOf(entries).at(-1) ?? "");
    if (name) pi.setSessionName(name);
  });
}
