import type { Event } from "./dispatch";
import { digestCommand } from "./rerun";
import { isRecord } from "./run-state";

type HookPayload = { tool_name?: string; tool_input?: Record<string, unknown> };

export type PendingBash = { digest: string; at: number };

export const isPending = (value: unknown): value is PendingBash =>
  isRecord(value) && typeof value.digest === "string" && typeof value.at === "number";

const bashCommandOf = (payload: HookPayload): string | undefined => {
  if ((payload.tool_name ?? "").toLowerCase() !== "bash") return undefined;
  const command = payload.tool_input?.command;
  return typeof command === "string" ? command : undefined;
};

export const trackBash = (
  preToolUse: boolean,
  payload: HookPayload,
  seed: readonly PendingBash[],
): {
  pending: PendingBash[];
  take: (command: string) => number | undefined;
  dropStarted: () => void;
  moved: (command: string) => void;
} => {
  const kept = [...seed];
  const startedAt = preToolUse ? bashCommandOf(payload) : undefined;
  const started = startedAt === undefined ? undefined : { digest: digestCommand(startedAt), at: Date.now() };
  if (started !== undefined) {
    kept.push(started);
    if (kept.length > 32) kept.splice(0, kept.length - 32);
  }
  const take = (command: string): number | undefined => {
    const position = kept.findIndex((entry) => entry.digest === digestCommand(command));
    if (position === -1) return undefined;
    const [match] = kept.splice(position, 1);
    return match?.at;
  };
  const dropStarted = (): void => {
    if (started === undefined) return;
    const position = kept.indexOf(started);
    if (position !== -1) kept.splice(position, 1);
  };
  const moved = (command: string): void => {
    dropStarted();
    if (started !== undefined) kept.push({ digest: digestCommand(command), at: started.at });
  };
  return { pending: kept, take, dropStarted, moved };
};

export const resultEvent = (payload: HookPayload, take: (command: string) => number | undefined): Event | undefined => {
  const command = bashCommandOf(payload);
  const at = command === undefined ? undefined : take(command);
  if (command === undefined || at === undefined) return undefined;
  return { type: "tool-result", tool: payload.tool_name ?? "", command, seconds: (Date.now() - at) / 1000 };
};
