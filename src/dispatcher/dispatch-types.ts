import type { Change, Forbid } from "./forbid";
import type { Harness } from "./harness";
import type { Project } from "./project";
import type { ScopeCondition } from "./scope-condition";
import type { GateAction, Settled, Tree, Verdict } from "./verdict";
import type { IndexedProfile, Trim } from "./model-scope";
import type { RunState } from "./run-state";

export type IndexedRule = {
  name: string;
  triggers: ScopeCondition[];
  text: string;
  forbid?: Forbid;
  inactive?: true;
};

export type HubBody = { name: string; skill: string };

export type Index = {
  harness: Harness;
  rules: IndexedRule[];
  profiles: IndexedProfile[];
  hub: HubBody[];
};

export type Event =
  | { type: "session-start"; carrying?: boolean; model?: string; holding?: string[] }
  | { type: "prompt"; files?: string[]; project?: Project; model?: string; baseline?: Tree; text?: string }
  | { type: "model-switch"; model?: string }
  | { type: "session-end" }
  | {
      type: "tool-call";
      tool: string;
      input: Record<string, unknown>;
      writes?: readonly string[];
      changes?: readonly Change[];
    }
  | { type: "read"; tool: string; paths: readonly string[] }
  | {
      type: "write-result";
      tool: string;
      writes: readonly string[];
      failed?: boolean;
    }
  | {
      type: "tool-result";
      tool: string;
      command: string;
      seconds: number;
      failed?: boolean;
      full?: string;
      canon?: string;
      mutating?: boolean;
      saved?: boolean;
    }
  | { type: "requested"; carrying: string; read: "request" | "transcript"; rules?: readonly string[] }
  | { type: "compaction" }
  | Settled
  | Verdict;

export type Action =
  | { type: "inject"; rule: string; why: string; text: string }
  | { type: "deliver"; rule: string; why: string; text: string }
  | { type: "queue"; rule: string; why: string }
  | { type: "dropped"; rule: string; why: string }
  | { type: "broken"; rule: string; why: string }
  | { type: "unjudged"; rule: string; why: string }
  | { type: "switched"; rule: string; to: "on" | "off"; why: string }
  | { type: "ignored"; why: string }
  | { type: "pull"; body: string; why: string }
  | { type: "refuse"; rule: string; why: string; text: string }
  | { type: "rerun-refused"; why: string; text: string }
  | { type: "withdraw"; rule: string; why: string }
  | Trim
  | GateAction;

export type Step = { actions: Action[]; state: RunState };
