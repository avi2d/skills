import { expect } from "bun:test";
import { carriage, dispatch, type Action, type Event, type Index } from "../../src/dispatcher/dispatch";
import { START, isRunState, type RuleLifecycle, type RunState } from "../../src/dispatcher/run-state";
import type { Project } from "../../src/dispatcher/project";
import type { ScopeCondition } from "../../src/dispatcher/scope-condition";

export function run(index: Index, events: readonly Event[]): { actions: Action[]; state: RunState } {
  let state = START;
  const actions: Action[] = [];
  for (const event of events) {
    const step = dispatch(index, event, state);
    actions.push(...step.actions);
    state = step.state;
  }
  return { actions, state };
}

export const injected = (actions: readonly Action[]): string[] =>
  actions.filter((a) => a.type === "inject" || a.type === "deliver").map((a) => a.rule);

export const injectedState = (...rules: readonly string[]): RunState => ({
  ...START,
  rules: Object.fromEntries(rules.map((name): [string, RuleLifecycle] => [name, { state: "injected" }])),
});

export const kept = (actions: readonly Action[]): string[] => actions.flatMap((a) => (a.type === "trim" ? a.tools : []));

export const nth = (actions: readonly Action[], at: number): Action =>
  actions.at(at) ?? expect.unreachable(`the run took ${actions.length} action(s), none at ${at}`);

export const carriageFor = (index: Index, inForce: readonly string[]): string =>
  carriage(index, inForce) ?? expect.unreachable(`none of [${inForce.join(", ")}] is a Rule in the index, so nothing is carried`);

export const ruleText = (index: Index, name: string): string =>
  index.rules.find((rule) => rule.name === name)?.text ?? expect.unreachable(`no Rule ${name} in the index`);

export const roundTripped = (state: RunState): RunState => {
  const revived: unknown = JSON.parse(JSON.stringify(state));
  return isRunState(revived) ? revived : expect.unreachable("the state did not come back from JSON as a RunState");
};

export const ruled = (rules: ReadonlyArray<[string, ScopeCondition | ScopeCondition[]]>): Index => ({
  harness: "pi",
  rules: rules.map(([name, trigger]) => ({
    name,
    triggers: Array.isArray(trigger) ? trigger : [trigger],
    text: `# ${name}\n\nThe whole of ${name}.\n`,
  })),
  profiles: [],
  hub: [],
});

export const always: ScopeCondition = { predicate: "always" };
export const typescript: ScopeCondition = { predicate: "repo-contains", glob: "**/*.{ts,tsx}" };
export const onWrite: ScopeCondition = { predicate: "file-matches", glob: "**/*.ts" };
export const onPush: ScopeCondition = { predicate: "tool-call", tool: "bash", argument: "command", matches: "**git push**" };

export const delivered = (actions: readonly Action[]): string[] => actions.filter((a) => a.type === "deliver").map((a) => a.rule);

export const subject = (action: Action): string =>
  "body" in action
    ? action.body
    : "rule" in action
      ? action.rule
      : action.type === "ignored"
        ? "dispatcher"
        : action.type === "trim"
          ? action.profile
          : action.tree;

export const prompt: Event = { type: "prompt" };
export const promptIn = (...files: string[]): Event => ({ type: "prompt", files });
export const compaction: Event = { type: "compaction" };
export const end: Event = { type: "session-end" };
export const start: Event = { type: "session-start" };
export const carried: Event = { type: "session-start", carrying: true };
export const wrote = (path: string): Event => ({ type: "tool-call", tool: "write", input: { path }, writes: [path] });
export const ran = (command: string): Event => ({ type: "tool-call", tool: "bash", input: { command } });

export const QUALITY = "/work/package.json";

export const projectOf = (over: Partial<Extract<Project, { declares: unknown }>> = {}): Project => ({
  path: QUALITY,
  declares: [],
  on: [],
  off: [],
  ...over,
});

export const promptAt = (project: Project, ...files: string[]): Event => ({ type: "prompt", files, project });
