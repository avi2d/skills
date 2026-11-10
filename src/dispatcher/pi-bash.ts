import type { ToolCallEvent, ToolCallEventResult, ToolResultEvent } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { steer, steeredLine } from "./job-queue";
import type { Event } from "./dispatch";

export type BashClock = Map<string, { command: string; at: number }>;

export const bashCall = (
  clock: BashClock,
  event: ToolCallEvent,
  cwd: string,
  note: (line: string) => void,
): ToolCallEventResult | undefined => {
  if (!isToolCallEventType("bash", event)) return undefined;
  const { command } = event.input;
  const steered = steer(command, cwd);
  if (steered === undefined) {
    clock.set(event.toolCallId, { command, at: Date.now() });
    return undefined;
  }
  note(steeredLine(steered));
  if (steered.type === "refuse") return { block: true, reason: steered.text };
  clock.set(event.toolCallId, { command, at: Date.now() });
  if (steered.type === "pass") return undefined;
  event.input.command = steered.command;
  return undefined;
};

export const finishedBash = (clock: BashClock, event: ToolResultEvent): Extract<Event, { type: "tool-result" }> | undefined => {
  const started = clock.get(event.toolCallId);
  if (started === undefined) return undefined;
  clock.delete(event.toolCallId);
  if (event.toolName.toLowerCase() !== "bash" || typeof event.input.command !== "string") return undefined;
  return {
    type: "tool-result",
    tool: event.toolName,
    command: started.command,
    seconds: (Date.now() - started.at) / 1000,
    ...(event.isError ? { failed: true } : {}),
  };
};
