import { judged, type Change, type Forbid } from "./forbid";
import { compileGlob, matchesGlob } from "./glob";
import type { Harness } from "./harness";
import type { Project } from "./project";
import type { ScopeCondition } from "./scope-condition";
import {
  onSettled,
  onVerdict,
  promptedGate,
  type GateAction,
  type Judged,
  type Settled,
  type Tree,
  type Verdict,
} from "./verdict";
import { handedBack, scopedFor, trimming, type IndexedProfile, type Trim } from "./model-scope";
import { lifecycleOf, type RuleLifecycle, type RunState } from "./run-state";

export type { IndexedProfile } from "./model-scope";

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
  | { type: "requested"; carrying: string; read: "request" | "transcript"; rules?: readonly string[] }
  | { type: "compaction" }
  | Settled
  | Verdict;

export type { RuleLifecycle, RunState } from "./run-state";

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
  | { type: "withdraw"; rule: string; why: string }
  | Trim
  | GateAction;

export type Step = { actions: Action[]; state: RunState };

const inDeclaredOrder = (index: Index, names: readonly string[]): IndexedRule[] => index.rules.filter((r) => names.includes(r.name));

export const placed = (state: RunState, states: readonly RuleLifecycle["state"][]): string[] =>
  Object.entries(state.rules)
    .filter(([, lifecycle]) => states.includes(lifecycle.state))
    .map(([name]) => name);

const at = (state: RunState, rule: string): RuleLifecycle["state"] | undefined => lifecycleOf(state.rules, rule)?.state;

export const PREAMBLE = "The following rules are in force for this session. Follow them.";

const carried = (texts: readonly string[]): string => [PREAMBLE, ...texts].join("\n\n");

export function carriages(index: Index, inForce: readonly string[], limit: number): string[] {
  const parts: string[][] = [];
  for (const rule of index.rules.filter((r) => inForce.includes(r.name))) {
    const last = parts.at(-1);
    if (last && carried([...last, rule.text]).length <= limit) last.push(rule.text);
    else parts.push([rule.text]);
  }
  return parts.map(carried);
}

export function carriage(index: Index, inForce: readonly string[]): string | undefined {
  return carriages(index, inForce, Number.POSITIVE_INFINITY)[0];
}

export function repoGlobs(index: Index, injected: readonly string[] = []): string[] {
  const globs: string[] = [];
  for (const rule of index.rules) {
    if (injected.includes(rule.name)) continue;
    for (const trigger of rule.triggers) {
      if (trigger.predicate === "repo-contains") globs.push(trigger.glob);
    }
  }
  return globs;
}

const withdrawals = (index: Index, held: readonly string[], model: string, project: Project | undefined): Array<Extract<Action, { type: "withdraw" }>> =>
  inDeclaredOrder(index, held)
    .filter((rule) => !eligible(index, rule, model, project))
    .map((rule) => ({ type: "withdraw", rule: rule.name, why: `the session's model is now ${model}, whose Profile does not name it` }));

function onModelSwitch(index: Index, event: Extract<Event, { type: "model-switch" }>, state: RunState): Step {
  const { model: _, ...rest } = state;
  const held = Object.keys(state.rules);
  const withdrawn = event.model === undefined ? [] : withdrawals(index, held, event.model, state.project);
  const stays = (name: string) => !withdrawn.some((action) => action.rule === name);
  return {
    actions: [...withdrawn, ...handedBack(index, state.model, event.model, state.holding)],
    state: {
      ...rest,
      rules: Object.fromEntries(Object.entries(state.rules).filter(([name]) => stays(name))),
      ...(event.model === undefined ? {} : { model: event.model }),
    },
  };
}

function onSessionStart(index: Index, event: Extract<Event, { type: "session-start" }>, state: RunState): Step {
  const { walked: _walked, gate: _gate, project: _project, model: _model, holding: _holding, ...fresh } = state;
  const identity = { ...(event.model === undefined ? {} : { model: event.model }), ...(event.holding ? { holding: event.holding } : {}) };
  const opening = trimming(index, event.model, event.holding);

  // A carrying start continues the session, so resetting here would re-inject the whole rule set.
  if (event.carrying) {
    const { holding: _held, ...continued } = state;
    return { actions: opening, state: { ...continued, ...identity } };
  }
  return { actions: opening, state: { ...fresh, rules: {}, ...identity } };
}

const readable = (project: Project | undefined) => (project && "declares" in project ? project : undefined);

const switchedOff = (rule: IndexedRule, project: Project | undefined): boolean => readable(project)?.off.includes(rule.name) ?? false;

function switchedOn(rule: IndexedRule, project: Project | undefined): boolean {
  if (switchedOff(rule, project)) return false;
  return rule.inactive !== true || (readable(project)?.on.includes(rule.name) ?? false);
}

// A project switch reaches a Rule the session's Profile leaves out, even when another Profile names it.
function eligible(index: Index, rule: IndexedRule, model: string | undefined, project: Project | undefined): boolean {
  return scopedFor(index, rule, model) || (readable(project)?.on.includes(rule.name) ?? false);
}

const sameProject = (a: Project | undefined, b: Project | undefined): boolean => JSON.stringify(a) === JSON.stringify(b);

function switchChanges(index: Index, rule: IndexedRule, to: "on" | "off", model: string | undefined): boolean {
  const reaches = rule.inactive !== true && scopedFor(index, rule, model);
  return to === "on" ? !reaches : reaches || rule.forbid !== undefined;
}

function heard(index: Index, project: Project | undefined, model: string | undefined): Action[] {
  if (!project) return [];
  if ("unreadable" in project) {
    const why = `${project.path} ${project.unreadable}, so no Rule fires on what it declares and none of its switches apply`;
    return [{ type: "ignored", why }];
  }
  const actions: Action[] = [];
  const switches = [
    { to: "on", names: project.on },
    { to: "off", names: project.off },
  ] as const;
  for (const { to, names } of switches) {
    for (const name of names) {
      const rule = index.rules.find((r) => r.name === name);
      if (!rule) {
        actions.push({ type: "ignored", why: `${project.path} switches ${name} ${to}, and ${index.harness} carries no Rule of that name` });
        continue;
      }
      if (switchChanges(index, rule, to, model)) actions.push({ type: "switched", rule: name, to, why: `${project.path} switches it ${to}` });
    }
  }
  return actions;
}

function promptTriggered(rule: IndexedRule, declared: readonly string[], files: readonly string[] | undefined): string | undefined {
  for (const trigger of rule.triggers) {
    if (trigger.predicate === "always") return "always";
    if (trigger.predicate === "declares" && declared.includes(trigger.key)) return `declares matched ${trigger.key}`;
    if (trigger.predicate === "repo-contains" && files) {
      const pattern = compileGlob(trigger.glob);
      const hit = files.find((file) => pattern.test(file));
      if (hit) return `repo-contains matched ${hit}`;
    }
  }
  return undefined;
}

function dueAtPrompt(index: Index, event: Extract<Event, { type: "prompt" }>, state: RunState): Array<{ rule: IndexedRule; why: string }> {
  const model = event.model ?? state.model;
  const declared = readable(event.project)?.declares ?? [];
  return index.rules.flatMap((rule) => {
    if (!switchedOn(rule, event.project) || !eligible(index, rule, model, event.project)) return [];
    const lifecycle = lifecycleOf(state.rules, rule.name);
    if (lifecycle !== undefined) return lifecycle.state === "pending" ? [{ rule, why: lifecycle.why }] : [];
    const why = promptTriggered(rule, declared, event.files);
    return why === undefined ? [] : [{ rule, why }];
  });
}

function onPrompt(index: Index, event: Extract<Event, { type: "prompt" }>, state: RunState): Step {
  const { project } = event;
  const due = dueAtPrompt(index, event, state);
  const gate = promptedGate(state.gate, event);
  const { project: _, ...rest } = state;
  const rules: Record<string, RuleLifecycle> = {};
  for (const [name, lifecycle] of Object.entries(state.rules)) {
    if (lifecycle.state !== "pending") rules[name] = lifecycle;
  }
  for (const { rule } of due) rules[rule.name] = { state: "injected" };
  return {
    actions: [
      ...(sameProject(project, state.project) ? [] : heard(index, project, event.model ?? state.model)),
      ...due.map(({ rule, why }): Action => ({ type: "inject", rule: rule.name, why, text: rule.text })),
    ],
    state: {
      ...rest,
      rules,
      ...(gate ? { gate } : {}),
      ...(project ? { project } : {}),
      ...(event.model === undefined ? {} : { model: event.model }),
    },
  };
}

function onSessionEnd(index: Index, state: RunState): Step {
  const due = inDeclaredOrder(index, placed(state, ["pending"]));
  const rules: Record<string, RuleLifecycle> = {};
  for (const [name, lifecycle] of Object.entries(state.rules)) {
    if (lifecycle.state !== "pending") rules[name] = lifecycle;
  }
  return {
    actions: due.map((rule) => ({
      type: "dropped",
      rule: rule.name,
      why: "the session ended before a prompt it could inject at",
    })),
    state: { ...state, rules },
  };
}

function onCompaction(index: Index, state: RunState): Step {
  const why = "compaction dropped it";
  const lost = inDeclaredOrder(index, placed(state, ["injected", "checked"]));
  const rules: Record<string, RuleLifecycle> = {};
  for (const rule of lost) rules[rule.name] = { state: "pending", why };
  return {
    actions: lost.map((rule) => ({ type: "queue", rule: rule.name, why })),
    state: { ...state, rules },
  };
}

export const unchecked = (state: RunState): string[] => placed(state, ["injected"]);

const WITNESS = 200;

const flatten = (text: string): string => text.replace(/[^a-zA-Z0-9]+/g, "");

const FOLLOWED = { request: "the request that followed carried", transcript: "the transcript that followed recorded" } as const;

function onRequested(index: Index, event: Extract<Event, { type: "requested" }>, state: RunState): Step {
  const asked = event.rules ?? unchecked(state);
  const due = index.rules.filter((r) => asked.includes(r.name) && at(state, r.name) === "injected");
  if (due.length === 0) return { actions: [], state };

  const carrying = flatten(event.carrying);
  const followed = FOLLOWED[event.read];
  const actions: Action[] = [];
  for (const rule of due) {
    const whole = flatten(rule.text);
    if (carrying.includes(whole)) continue;
    const why = carrying.includes(whole.slice(0, WITNESS))
      ? `it was injected, and ${followed} only the start of it, so the model never had the whole of it`
      : `it was injected, and ${followed} no trace of it, so it never reached the model`;
    actions.push({ type: "broken", rule: rule.name, why });
  }
  const rules = { ...state.rules };
  for (const rule of due) rules[rule.name] = { state: "checked" };
  return { actions, state: { ...state, rules } };
}

function onToolCall(index: Index, event: Extract<Event, { type: "tool-call" }>, state: RunState): Step {
  const actions: Action[] = [];
  let rules = state.rules;

  const deliver = (rule: IndexedRule, why: string) => {
    const lifecycle = lifecycleOf(rules, rule.name);
    if (lifecycle !== undefined && lifecycle.state !== "pending") return;
    rules = { ...rules, [rule.name]: { state: "injected" } };
    actions.push({ type: "deliver", rule: rule.name, why, text: rule.text });
  };

  const switched = index.rules.filter((rule) => switchedOn(rule, state.project) && eligible(index, rule, state.model, state.project));
  for (const rule of switched) {
    for (const trigger of rule.triggers) {
      const fired = toolCallFired(trigger, event);
      if (fired && "broken" in fired) actions.push({ type: "broken", rule: rule.name, why: fired.broken });
      else if (fired) deliver(rule, fired.deliver);
    }
  }
  // A refusal spends no context, so only a project's switch stands it down.
  for (const rule of index.rules.filter((r) => !switchedOff(r, state.project))) actions.push(...forbidding(rule, index.harness, event.changes ?? []));
  return { actions, state: { ...state, rules } };
}

function onRead(index: Index, event: Extract<Event, { type: "read" }>, state: RunState): Step {
  const actions = event.paths.flatMap((path): Action[] => {
    const read = path.replaceAll("\\", "/");
    const body = index.hub.find((entry) => read.endsWith(`/${entry.skill}`));
    return body === undefined ? [] : [{ type: "pull", body: body.name, why: `${event.tool} ${body.name}/SKILL.md` }];
  });
  return { actions, state };
}

function toolCallFired(trigger: ScopeCondition, event: Extract<Event, { type: "tool-call" }>): { deliver: string } | { broken: string } | undefined {
  if (trigger.predicate === "file-matches") {
    const hit = event.writes?.find((path) => matchesGlob(trigger.glob, path));
    return hit === undefined ? undefined : { deliver: `file-matches matched ${hit}` };
  }
  if (trigger.predicate !== "tool-call" || trigger.tool.toLowerCase() !== event.tool.toLowerCase()) return undefined;
  const value = event.input[trigger.argument];
  if (typeof value === "string") {
    return matchesGlob(trigger.matches, value) ? { deliver: `tool-call matched ${trigger.tool}.${trigger.argument} against ${trigger.matches}` } : undefined;
  }
  const held = Object.keys(event.input).join(", ") || "nothing";
  return {
    broken:
      value === undefined
        ? `trigger names argument \`${trigger.argument}\`, and ${event.tool} was called with ${held}`
        : `trigger names argument \`${trigger.argument}\`, which ${event.tool} was called with as a ${typeof value}`,
  };
}

function forbidding(rule: IndexedRule, harness: Harness, changes: readonly Change[]): Action[] {
  if (rule.forbid === undefined) return [];
  const actions: Action[] = [];
  const refusals: string[] = [];
  for (const change of changes) {
    const verdict = judged(rule.forbid, harness, change);
    if ("unplaced" in verdict) {
      actions.push({ type: "unjudged", rule: rule.name, why: `${verdict.unplaced}, so what it adds went unread` });
    } else refusals.push(...verdict.refusals);
  }
  if (refusals.length === 0) return actions;
  const text = [`${rule.name} refused this write before it landed:`, ...refusals.map((one) => `  ${one}`)].join("\n");
  return [...actions, { type: "refuse", rule: rule.name, why: refusals.join("; "), text }];
}

function gated(state: RunState, { actions, gate }: Judged): Step {
  if (gate === state.gate) return { actions, state };
  if (gate !== undefined) return { actions, state: { ...state, gate } };
  const { gate: _released, ...rest } = state;
  return { actions, state: rest };
}

export function dispatch(index: Index, event: Event, state: RunState): Step {
  switch (event.type) {
    case "session-start":
      return onSessionStart(index, event, state);
    case "prompt":
      return onPrompt(index, event, state);
    case "model-switch":
      return onModelSwitch(index, event, state);
    case "session-end":
      return onSessionEnd(index, state);
    case "requested":
      return onRequested(index, event, state);
    case "compaction":
      return onCompaction(index, state);
    case "tool-call":
      return onToolCall(index, event, state);
    case "read":
      return onRead(index, event, state);
    case "settled":
      return gated(state, onSettled(event, state.gate));
    case "verdict":
      return gated(state, onVerdict(event, state.gate));
    default:
      throw new Error(`the dispatch core was handed ${JSON.stringify(event satisfies never)}`);
  }
}
