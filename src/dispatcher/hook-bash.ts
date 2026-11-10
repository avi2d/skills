import type { Event } from "./dispatch";
import { bashLooksMutating, digestCommand, savesStdout, stripped } from "./rerun";
import { isRecord } from "./run-state";

type HookPayload = { tool_name?: string; tool_input?: Record<string, unknown>; tool_response?: unknown; hook_event_name?: string };

export type PendingBash = {
  digest: string;
  full: string;
  canon: string;
  mutating: boolean;
  saved: boolean;
  at: number;
};

export const isPending = (value: unknown): value is PendingBash =>
  isRecord(value) &&
  typeof value.digest === "string" &&
  typeof value.at === "number" &&
  typeof value.full === "string" &&
  typeof value.canon === "string" &&
  typeof value.mutating === "boolean" &&
  typeof value.saved === "boolean";

const bashCommandOf = (payload: HookPayload): string | undefined => {
  if ((payload.tool_name ?? "").toLowerCase() !== "bash") return undefined;
  const command = payload.tool_input?.command;
  return typeof command === "string" ? command : undefined;
};

const failedOf = (response: unknown): boolean =>
  isRecord(response) && (response.isError === true || response.failed === true || response.success === false);

export const trackBash = (
  preToolUse: boolean,
  payload: HookPayload,
  seed: readonly PendingBash[],
): {
  pending: PendingBash[];
  take: (command: string) => PendingBash | undefined;
  dropStarted: () => void;
  moved: (command: string) => void;
} => {
  const kept = [...seed];
  const raw = preToolUse ? bashCommandOf(payload) : undefined;
  const started =
    raw === undefined
      ? undefined
      : {
          digest: digestCommand(raw),
          full: digestCommand(raw),
          canon: digestCommand(stripped(raw)),
          mutating: bashLooksMutating(raw),
          saved: savesStdout(raw),
          at: Date.now(),
        };
  if (started !== undefined) {
    kept.push(started);
    if (kept.length > 32) kept.splice(0, kept.length - 32);
  }
  const take = (command: string): PendingBash | undefined => {
    const position = kept.findLastIndex((entry) => entry.digest === digestCommand(command));
    if (position === -1) return undefined;
    const [match] = kept.splice(position, 1);
    return match;
  };
  const dropStarted = (): void => {
    if (started === undefined) return;
    const position = kept.indexOf(started);
    if (position !== -1) kept.splice(position, 1);
  };
  const moved = (command: string): void => {
    dropStarted();
    if (started !== undefined) kept.push({ ...started, digest: digestCommand(command) });
  };
  return { pending: kept, take, dropStarted, moved };
};

export const resultEvent = (
  payload: HookPayload,
  take: (command: string) => PendingBash | undefined,
): Event | undefined => {
  const command = bashCommandOf(payload);
  const found = command === undefined ? undefined : take(command);
  if (command === undefined || found === undefined) return undefined;
  return {
    type: "tool-result",
    tool: payload.tool_name ?? "",
    command,
    seconds: (Date.now() - found.at) / 1000,
    full: found.full,
    canon: found.canon,
    mutating: found.mutating,
    saved: found.saved,
    ...(failedOf(payload.tool_response) || payload.hook_event_name === "PostToolUseFailure" ? { failed: true } : {}),
  };
};

export const writeResultEvent = (payload: HookPayload, writes: readonly string[]): Event | undefined => {
  const tool = (payload.tool_name ?? "").toLowerCase();
  const input = payload.tool_input ?? {};
  const path =
    tool === "write" || tool === "edit"
      ? [input.file_path, input.path].find((value): value is string => typeof value === "string")
      : tool === "apply_patch"
        ? writes[0]
        : undefined;
  if (path === undefined) return undefined;
  return {
    type: "write-result",
    tool: payload.tool_name ?? "",
    writes: tool === "apply_patch" ? writes : [path],
    ...(payload.hook_event_name === "PostToolUseFailure" ? { failed: true } : {}),
  };
};
