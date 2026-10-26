import { Effect, Schema } from "effect";
import { MalformedMachineConfig } from "../platform/failures";

const Kind = Schema.Literals(["trivial", "small", "large", "ambiguous", "investigation"]);

type Kind = typeof Kind.Type;

export const TASK_KINDS: Readonly<Record<Kind, { readonly when: string; readonly description: string }>> = {
  trivial: {
    when: "Trivial or mechanical work whose outcome is fully specified: a rote rename, formatting sweep, typo fix, config or selection flip, deleting or moving named files and sections, removing leftovers a tool generated, or gathering files; multi-file is fine as long as no design choice is left to make.",
    description: "Narrow work with no design choice left, so it goes to the cheapest candidate that can do it.",
  },
  small: {
    when: "Well-scoped small implementation work expected to change about 150 lines or fewer: a clearly specified feature, an ordinary bug fix with a clear pointer to the cause, writing tests for existing behavior, or a routine refactor following an existing pattern.",
    description: "Small well-scoped work leaves little to decide, so a cheap workhorse takes it before the main model does.",
  },
  large: {
    when: "Well-scoped large implementation work expected to change more than about 150 lines: a clearly specified feature, an ordinary bug fix with a clear pointer to the cause, writing tests for existing behavior, or a routine refactor following an existing pattern at that size.",
    description: "Large well-scoped work is long but leaves little to decide, so it needs the main model more than its deepest reasoning.",
  },
  ambiguous: {
    when: "Big or ambiguous multi-file feature, risky refactor, orchestration of several workers, or implementation work that requires holding many moving parts in mind.",
    description: "Ambiguous work needs the strongest reasoning class, so a tight window stops and reports rather than downgrading to a weaker one.",
  },
  investigation: {
    when: "Bounded investigation, audit, diagnosis, triage, reproduction, or planning that produces a report rather than a code change: a scout, a survey of issues, a root-cause hunt, an evaluation of options. An ambiguous or cross-system investigation takes the stronger rule below instead.",
    description: "A bounded report goes to a cheaper reasoner first, while an open-ended one keeps the strongest class.",
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

const Profile = Schema.Union([
  profileOf("claude-bridge/claude-opus-5-5", "claude"),
  Schema.Struct({ ...profileOf("claude-bridge/claude-haiku-5-5", "claude").fields, floor: Floor }).annotate({
    description: "Haiku 5.5 spends the Claude windows the main firstmate and Opus crews share, so it always carries a floor",
  }),
  profileOf("opencode-go/muse-spark-1.3-contributor", "opencode-go"),
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
