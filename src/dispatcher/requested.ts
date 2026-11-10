import type { Action, Event, Index, Step } from "./dispatch";
import { lifecycleOf, type RuleLifecycle, type RunState } from "./run-state";

export const placed = (state: RunState, states: readonly RuleLifecycle["state"][]): string[] =>
  Object.entries(state.rules)
    .filter(([, lifecycle]) => states.includes(lifecycle.state))
    .map(([name]) => name);

export const unchecked = (state: RunState): string[] => placed(state, ["injected"]);

const at = (state: RunState, rule: string): RuleLifecycle["state"] | undefined => lifecycleOf(state.rules, rule)?.state;

const WITNESS = 200;

const flatten = (text: string): string => text.replace(/[^a-zA-Z0-9]+/g, "");

const FOLLOWED = { request: "the request that followed carried", transcript: "the transcript that followed recorded" } as const;

export function onRequested(index: Index, event: Extract<Event, { type: "requested" }>, state: RunState): Step {
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
