import type { AgentRun, Change } from "../../src/eval/eval-judges";
import type { Step, Transcript } from "../../src/eval/eval-transcript";

const transcript = (steps: Step[], answer = ""): Transcript => ({
  steps,
  answer,
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  cacheWrite1h: 0,
  requests: [],
  cost: 0,
  providerError: undefined,
  unreadable: 0,
});

export const bash = (command: string, result = "", failed = false): Step => ({ kind: "call", call: { id: command, tool: "bash", args: { command }, result, failed } });
export const failing = (command: string): Step => bash(command, "", true);
export const write = (path: string, content = ""): Step => ({ kind: "call", call: { id: path, tool: "write", args: { path, content }, result: "", failed: false } });
export const editWith = (path: string, args: Record<string, unknown>): Step => ({
  kind: "call",
  call: { id: path, tool: "edit", args: { path, ...args }, result: "", failed: false },
});
export const edit = (path: string, newText: string): Step => editWith(path, { edits: [{ oldText: "x", newText }] });
export const read = (path: string, result: string): Step => ({ kind: "call", call: { id: path, tool: "read", args: { path }, result, failed: false } });

export const run = (steps: Step[], changes: Change[] = [], answer = ""): AgentRun => ({ transcript: transcript(steps, answer), changes, commits: [], generated: {} });

export const added = (path: string, after: string): Change => ({ path, before: undefined, after });
