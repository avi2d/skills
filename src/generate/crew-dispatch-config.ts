import type { CrewDispatch, Effort, OwnRule, Profile, Profiles } from "./crew-dispatch";
import type { Machine } from "./machine";

const opus = (effort: Effort) => ({ harness: "pi", model: "claude-bridge/claude-opus-5-5", effort, provider: "claude" }) as const satisfies Profile;

const muse = (effort: Effort) =>
  ({ harness: "pi", model: "opencode-go/muse-spark-1.3-contributor", effort, provider: "opencode-go", floor: FLOOR }) as const satisfies Profile;

const FLOOR = { scope: "all_models", min_percent: 15 } as const;

const haiku = (effort: Effort) =>
  ({ harness: "pi", model: "claude-bridge/claude-haiku-5-5", effort, provider: "claude", floor: FLOOR }) as const satisfies Profile;

const workhorse = (efforts: { muse: Effort; haiku: Effort; opus: Effort }): Profiles => [muse(efforts.muse), haiku(efforts.haiku), opus(efforts.opus)];

const TRIVIAL_EFFORTS = { muse: "low", haiku: "low", opus: "low" } as const;

const SMALL_EFFORTS = { muse: "high", haiku: "high", opus: "medium" } as const;

const unknownCause: OwnRule = {
  description: "An unexplained cause needs the strongest reasoning class.",
  when: "A code change whose cause or scope is not yet known: a bug, flaky check, environment-only failure, or unexplained regression that must first be diagnosed across systems, processes or machines before the fix is clear. A fix the brief already locates takes a smaller rule.",
  use: [opus("high")],
};

const macOnly: OwnRule = {
  description: "Live Mac configuration needs work on that machine.",
  when: "Work that must run on this Mac against its live configuration (terminal, Herdr, WezTerm, pi setup or home network) and changes or proves that live state. A repository change that only targets Mac software and is proved in its isolated copy takes the size rules.",
  use: [opus("high")],
};

const shared: CrewDispatch["rules"] = [
  { kind: "trivial", use: workhorse(TRIVIAL_EFFORTS) },
  { kind: "small", use: workhorse(SMALL_EFFORTS) },
  { kind: "large", use: [muse("high"), opus("medium")] },
  { kind: "ambiguous", use: [opus("high")] },
  { kind: "investigation", use: [opus("high")] },
];

const windows: CrewDispatch = {
  array_order: "preference",
  rules: shared,
  ownRules: [unknownCause],
  default: [opus("high")],
};

const mac: CrewDispatch = {
  array_order: "preference",
  rules: shared,
  ownRules: [unknownCause, macOnly],
  default: [muse(SMALL_EFFORTS.muse), opus(SMALL_EFFORTS.opus)],
};

export const crewDispatchOf = (machine: Machine): CrewDispatch => ({ windows, mac })[machine];
