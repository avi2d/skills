import { Effect, Schema } from "effect";
import { MAIN_ACCOUNT, SECOND_ACCOUNT } from "./claude-accounts";
import { MalformedMachineConfig } from "../platform/failures";

const Kind = Schema.Literals(["trivial", "small", "large", "ambiguous", "investigation"]);

type Kind = typeof Kind.Type;

export const TASK_KINDS: Readonly<Record<Kind, { readonly when: string; readonly description: string }>> = {
  trivial: {
    when: "Mechanical work whose every edit the brief dictates, with no judgment left: a rename, formatting sweep, typo fix, version or pin bump, single setting flip, deleting or moving named files or sections, copying an existing file verbatim, removing tool-generated leftovers, or gathering files. Any number of files fits.",
    description: "Narrow work with no design choice left, so it goes to the cheapest candidate that can do it.",
  },
  small: {
    when: "Clearly specified implementation work of ordinary size, about 150 changed lines or fewer of new or rewritten logic: a specified feature, a bug fix whose cause the brief points to, tests for existing behavior, or applying a pattern the brief names (a worked example, a pilot pull request, a sibling repository) to more places. The worker makes only local choices. Repeating one known change across many files or workflows, deleting the code it replaces, and running proof or CI checks to confirm it all stay here.",
    description: "Small well-scoped work leaves little to decide, so a cheap workhorse takes it before the main model does.",
  },
  large: {
    when: "Clearly specified implementation work above about 150 changed lines of new or rewritten logic, staying within one program, where the brief already settles the design: a new feature, option, check or command carried through code, schema, docs and tests, a fix that first needs a new reproduction harness, or a refactor across several modules along a design the brief states. An upstream sync into a fork is sized by the conflicts it must resolve, not by the incoming diff.",
    description: "Large well-scoped work is long but leaves little to decide, so it needs the main model more than its deepest reasoning.",
  },
  ambiguous: {
    when: "Implementation that needs real design judgment or must keep many interacting parts consistent: design decisions the brief leaves open, a feature spanning several processes, machines or services, new code that stores, passes or guards secrets or credentials, a risky refactor of shared state, concurrency or migration logic, coordinating several workers, visual or interaction design without a settled target, or a large rebuild an earlier attempt failed at. File count, proof runs and CI edits alone do not qualify; a known change applied by a named pattern takes a smaller rule.",
    description: "Ambiguous work needs the strongest reasoning class, so a tight window stops and reports rather than downgrading to a weaker one.",
  },
  investigation: {
    when: "Bounded investigation, audit, diagnosis, triage, reproduction, or planning that produces a report rather than a code change: a scout, a survey of issues, a root-cause hunt, an evaluation of options.",
    description: "A report shapes later work, so it keeps the strongest reasoning class.",
  },
};

const Effort = Schema.Literals(["low", "medium", "high", "xhigh", "max"]).annotate({
  description: "The thinking level pi runs the model at",
});

export type Effort = typeof Effort.Type;

const profileOf = <const Model extends string, const Provider extends string>(model: Model, provider: Provider) =>
  Schema.Struct({
    harness: Schema.Literal("pi"),
    model: Schema.Literal(model).annotate({ description: "The model as pi names it, provider prefix included" }),
    effort: Effort,
    provider: Schema.Literal(provider).annotate({ description: "The quota-axi provider whose allowance the model spends" }),
  });

const Floor = Schema.Struct({
  scope: Schema.NonEmptyString.annotate({ description: "The quota-axi scope of the profile's provider whose effectivePercentRemaining is read" }),
  min_percent: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 100 })),
}).annotate({ description: "firstmate skips the candidate while the scope reads below min_percent" });

const ClaudeAccount = Schema.Literals([MAIN_ACCOUNT, SECOND_ACCOUNT]).annotate({
  description: "The clauth profile name firstmate launches this profile on",
});

const Profile = Schema.Union([
  Schema.Struct({ ...profileOf("claude-bridge/claude-opus-5-5", "claude").fields, claude_account: ClaudeAccount }),
  profileOf("openai/gpt-6-astra", "codex"),
  profileOf("openai/gpt-6.1-terra", "codex"),
  Schema.Struct({ ...profileOf("claude-bridge/claude-haiku-5-5", "claude").fields, floor: Floor, claude_account: ClaudeAccount }).annotate({
    description: "Haiku 5.5 spends the Claude windows the main firstmate and Opus crews share, so it always carries a floor",
  }),
  Schema.Struct({ ...profileOf("opencode-go/muse-spark-1.3-contributor", "opencode-go").fields, floor: Floor }).annotate({
    description: "Muse always carries a floor, as Haiku 5.5 does",
  }),
]);

export type Profile = typeof Profile.Type;

const Profiles = Schema.NonEmptyArray(Profile).annotate({
  description: "Candidates in order of preference: firstmate takes the first one quota-axi shows usable",
});

export type Profiles = typeof Profiles.Type;

const SharedRule = Schema.Struct({
  kind: Kind.annotate({ description: "A task kind every machine shares, whose when and description TASK_KINDS holds" }),
  use: Profiles,
});

const OwnRule = Schema.Struct({
  description: Schema.NonEmptyString.annotate({
    description: "What the rule is for and why, naming no model or effort, kept in this source and left out of the written file",
  }),
  when: Schema.NonEmptyString.annotate({ description: "The kind of task only this machine takes, as firstmate matches it" }),
  use: Profiles,
});

export type OwnRule = typeof OwnRule.Type;

const kindOnce = Schema.makeFilter<readonly (typeof SharedRule.Type)[]>((rules) => {
  const kinds = rules.map((rule) => rule.kind);
  const repeated = kinds.filter((kind, at) => kinds.indexOf(kind) !== at);
  return repeated.length === 0 || `a machine routes each task kind once, and repeats ${repeated.join(", ")}`;
});

const CrewDispatch = Schema.Struct({
  array_order: Schema.Literal("preference"),
  rules: Schema.Array(SharedRule).check(kindOnce),
  ownRules: Schema.Array(OwnRule).annotate({ description: "Rules only this machine takes, written after the shared ones" }),
  default: Profiles,
});

export type CrewDispatch = typeof CrewDispatch.Type;

const decodeCrewDispatch = Schema.decodeUnknownEffect(CrewDispatch, { onExcessProperty: "error" });

export const crewDispatchJson = Effect.fnUntraced(function* (
  source: unknown,
): Effect.fn.Return<string, MalformedMachineConfig> {
  const dispatch = yield* decodeCrewDispatch(source).pipe(
    Effect.mapError((cause) => new MalformedMachineConfig({ message: `the crew dispatch source does not decode: ${cause.message}` })),
  );
  const rules = [...dispatch.rules.map(({ kind, use }) => ({ when: TASK_KINDS[kind].when, use })), ...dispatch.ownRules.map(({ when, use }) => ({ when, use }))];
  return `${JSON.stringify({ array_order: dispatch.array_order, rules, default: dispatch.default }, null, 2)}\n`;
});
