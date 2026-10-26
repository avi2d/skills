import type { CrewDispatch, Effort, OwnRule, Profile, Profiles } from "./crew-dispatch";
import type { Machine } from "./machine";

const opus = (effort: Effort) => ({ harness: "pi", model: "claude-bridge/claude-opus-5-5", effort, provider: "claude" }) as const satisfies Profile;

const muse = (effort: Effort) =>
  ({ harness: "pi", model: "opencode-go/muse-spark-1.3-contributor", effort, provider: "opencode-go" }) as const satisfies Profile;

const HAIKU_FLOOR = { scope: "all_models", min_percent: 15 } as const;

const haiku = (effort: Effort) =>
  ({ harness: "pi", model: "claude-bridge/claude-haiku-5-5", effort, provider: "claude", floor: HAIKU_FLOOR }) as const satisfies Profile;

const workhorse = (efforts: { muse: Effort; haiku: Effort; opus: Effort }): Profiles => [muse(efforts.muse), haiku(efforts.haiku), opus(efforts.opus)];

const TRIVIAL_EFFORTS = { muse: "low", haiku: "low", opus: "low" } as const;

const SMALL_EFFORTS = { muse: "high", haiku: "high", opus: "medium" } as const;

const ambiguousInvestigation: OwnRule = {
  description: "Open-ended investigations need the strongest reasoning, so they bypass the bounded-investigation default.",
  when: "Ambiguous or cross-system investigation, audit, diagnosis, or planning that spans systems or leaves the scope open.",
  use: [opus("high")],
};

const windows: CrewDispatch = {
  array_order: "preference",
  rules: [
    { kind: "trivial", use: workhorse(TRIVIAL_EFFORTS) },
    { kind: "small", use: workhorse(SMALL_EFFORTS) },
    { kind: "large", use: [muse("medium"), opus("medium")] },
    { kind: "ambiguous", use: [opus("high")] },
    { kind: "investigation", use: [opus("high")] },
  ],
  ownRules: [ambiguousInvestigation],
  default: [opus("high")],
};

const macOnly: OwnRule = {
  description: "Heavy work belongs on the Windows machine, so the Mac takes only what the Mac alone can reach.",
  when: "Work that can only be done on this Mac: its own configuration, terminal, herdr, WezTerm, pi setup or home network.",
  use: [opus("high")],
};

const mac: CrewDispatch = {
  array_order: "preference",
  rules: [
    { kind: "trivial", use: workhorse(TRIVIAL_EFFORTS) },
    { kind: "small", use: workhorse(SMALL_EFFORTS) },
  ],
  ownRules: [macOnly, ambiguousInvestigation],
  default: [muse(SMALL_EFFORTS.muse), opus(SMALL_EFFORTS.opus)],
};

export const crewDispatchOf = (machine: Machine): CrewDispatch => ({ windows, mac })[machine];
