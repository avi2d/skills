import { expect, test } from "bun:test";
import { Result, Schema } from "effect";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import { clampThinkingLevel } from "@earendil-works/pi-ai";
import { REPO } from "../../src/generate/link";
import { MACHINES, type Machine } from "../../src/generate/machine";
import { CREW_DISPATCH } from "../../src/generate/machine-files";

const Profile = Schema.Struct({
  harness: Schema.String,
  model: Schema.optionalKey(Schema.String),
  effort: Schema.optionalKey(Schema.String),
  provider: Schema.optionalKey(Schema.String),
  claude_account: Schema.optionalKey(Schema.String),
  floor: Schema.optionalKey(Schema.Struct({ scope: Schema.String, min_percent: Schema.Int })),
});
type Profile = typeof Profile.Type;
const Profiles = Schema.Union([Profile, Schema.Array(Profile)]);
const decodeDispatch = Schema.decodeUnknownSync(
  Schema.Struct({
    array_order: Schema.optionalKey(Schema.Literal("preference")),
    rules: Schema.Array(Schema.Struct({ when: Schema.String, use: Profiles })),
    default: Schema.optionalKey(Profiles),
  }),
  { onExcessProperty: "error" },
);

const dispatchOn = async (machine: Machine) => decodeDispatch(await Bun.file(`${REPO}${CREW_DISPATCH[machine]}`).json());

type Placed = { readonly at: string; readonly profile: Profile };

const listed = (profiles: Profile | readonly Profile[]): readonly Profile[] => ("harness" in profiles ? [profiles] : profiles);

const profilesOn = async (machine: Machine): Promise<readonly Placed[]> => {
  const dispatch = await dispatchOn(machine);
  return [
    ...dispatch.rules.flatMap((rule) => listed(rule.use).map((profile) => ({ at: rule.when.slice(0, 60), profile }))),
    ...(dispatch.default === undefined ? [] : listed(dispatch.default).map((profile) => ({ at: "default", profile }))),
  ];
};

const naming = (pattern: RegExp) => (placed: readonly Placed[]) =>
  placed.filter(({ profile }) => [profile.harness, profile.model ?? "", profile.provider ?? ""].some((field) => pattern.test(field)));

const familyOf = (model: string | undefined): string => /muse|haiku|opus|astra|terra|sol/.exec(model ?? "")?.[0] ?? `${model}`;

const familiesIn = (dispatch: Awaited<ReturnType<typeof dispatchOn>>, opening: string): readonly string[] => {
  const found = dispatch.rules.filter(({ when }) => when.startsWith(opening));
  expect(found, `no single rule opens with "${opening}"`).toHaveLength(1);
  return found.flatMap(({ use }) => listed(use).map(({ model }) => familyOf(model)));
};

const ORDINARY = "Clearly specified implementation work of ordinary size";

const ABOVE_150 = "Clearly specified implementation work above about 150 changed lines";

const INVESTIGATION = "Bounded investigation";

const UNKNOWN_CAUSE = "A code change whose cause or scope is not yet known";

test.each([...MACHINES])("on the %s machine, the trivial tier prefers Muse, then Haiku on both accounts, then Opus on both accounts, with no Codex model, in array order", async (machine) => {
  const dispatch = await dispatchOn(machine);
  expect(dispatch.array_order, "without preference order firstmate ranks the candidates by spendPriority").toBe("preference");
  expect(familiesIn(dispatch, "Mechanical")).toEqual(["muse", "haiku", "haiku", "opus", "opus"]);
});

test.each([...MACHINES])("on the %s machine, the small tier keeps Muse first, Terra second, then Haiku and Opus on both accounts, so Terra never leads Muse", async (machine) => {
  expect(familiesIn(await dispatchOn(machine), ORDINARY)).toEqual(["muse", "terra", "haiku", "haiku", "opus", "opus"]);
});

test.each([...MACHINES])("on the %s machine, the large tier keeps Muse first, Terra second, then Opus on both accounts, so Terra is not missing above 150 lines", async (machine) => {
  expect(familiesIn(await dispatchOn(machine), ABOVE_150)).toEqual(["muse", "terra", "opus", "opus"]);
});

test.each([...MACHINES])("on the %s machine, the investigation and unknown cause rules list Opus on both accounts then Astra, so neither drops Astra or Opus", async (machine) => {
  const dispatch = await dispatchOn(machine);
  for (const opening of [INVESTIGATION, UNKNOWN_CAUSE]) expect(familiesIn(dispatch, opening), opening).toEqual(["opus", "opus", "astra"]);
});

test.each([...MACHINES])("on the %s machine, Astra and Terra sit only in their two rules each, at high effort on Codex", async (machine) => {
  const placed = naming(/astra|terra/i)(await profilesOn(machine));
  const openingOf = (at: string) => [ORDINARY, ABOVE_150, INVESTIGATION, UNKNOWN_CAUSE].find((opening) => at.startsWith(opening.slice(0, at.length))) ?? at;
  expect(placed.map(({ at, profile }) => [familyOf(profile.model), openingOf(at), profile.effort, profile.provider, profile.floor])).toEqual([
    ["terra", ORDINARY, "high", "codex", undefined],
    ["terra", ABOVE_150, "high", "codex", undefined],
    ["astra", INVESTIGATION, "high", "codex", undefined],
    ["astra", UNKNOWN_CAUSE, "high", "codex", undefined],
  ]);
});

test.each([...MACHINES])("on the %s machine, Haiku sits only in the trivial and small tiers, at low and high effort, once per account", async (machine) => {
  const haiku = naming(/haiku/i)(await profilesOn(machine));
  expect(haiku.map(({ at, profile }) => [/^(Mechanical|Clearly specified implementation work of ordinary size)/.exec(at)?.[0] ?? at, profile.effort, profile.claude_account])).toEqual([
    ["Mechanical", "low", "main"],
    ["Mechanical", "low", "second"],
    ["Clearly specified implementation work of ordinary size", "high", "main"],
    ["Clearly specified implementation work of ordinary size", "high", "second"],
  ]);
});

test.each([...MACHINES])("on the %s machine, every Claude model lists once on each clauth account and no other profile names one", async (machine) => {
  const placed = await profilesOn(machine);
  const claude = placed.filter(({ profile }) => profile.model?.startsWith("claude-bridge/"));
  expect(claude.length, "no rule names a Claude profile, so this checks nothing").toBeGreaterThan(0);
  for (const { profile } of claude) {
    expect(profile.provider).toBe("claude");
    expect(["main", "second"]).toContain(profile.claude_account);
  }
  expect(placed.filter(({ profile }) => profile.claude_account !== undefined && !profile.model?.startsWith("claude-bridge/"))).toEqual([]);
  const dispatch = await dispatchOn(machine);
  const lists = [...dispatch.rules.map(({ use }) => listed(use)), ...(dispatch.default === undefined ? [] : [listed(dispatch.default)])];
  for (const list of lists) {
    const accounts = list.filter(({ model }) => model?.startsWith("claude-bridge/"));
    for (let at = 0; at < accounts.length; at += 2) {
      const first = accounts[at];
      const second = accounts[at + 1];
      expect(second, "a Claude main entry with no second directly after it").toBeDefined();
      expect([first?.model, first?.effort, first?.provider]).toEqual([second?.model, second?.effort, second?.provider]);
      expect([first?.claude_account, second?.claude_account]).toEqual(["main", "second"]);
    }
  }
});

test.each([...MACHINES])("on the %s machine, every Haiku profile is skipped while either Claude window holds under 15 percent", async (machine) => {
  const haiku = naming(/haiku/i)(await profilesOn(machine));
  expect(haiku.length, "no rule names Haiku, so this checks nothing").toBeGreaterThan(0);
  for (const { profile } of haiku) expect(profile).toMatchObject({ provider: "claude", floor: { scope: "all_models", min_percent: 15 } });
});

test("no Mac rule or default names an OpenRouter profile", async () => {
  expect(naming(/openrouter/i)(await profilesOn("mac"))).toEqual([]);
});

test.each([...MACHINES])("on the %s machine, Muse runs on OpenCode Go only", async (machine) => {
  const muse = naming(/muse/i)(await profilesOn(machine));
  expect(muse.length, "no rule names Muse, so this checks nothing").toBeGreaterThan(0);
  expect(muse.filter(({ profile }) => profile.provider !== "opencode-go" || !profile.model?.startsWith("opencode-go/"))).toEqual([]);
});

test.each([...MACHINES])("on the %s machine, GLM and Kimi stay out of dispatch", async (machine) => {
  expect(naming(/glm|kimi/i)(await profilesOn(machine))).toEqual([]);
});

const offCodexSol = (placed: readonly Placed[]): readonly Placed[] => naming(/\bsol\b/i)(placed).filter(({ profile }) => profile.provider !== "codex");

test("a Sol profile off Codex is found, and a Codex one is not", () => {
  const placed = [
    { at: "pi", profile: { harness: "pi", model: "openai/gpt-6.1-sol", effort: "high", provider: "codex" } },
    { at: "codex", profile: { harness: "codex", model: "gpt-6-sol" } },
    { at: "wrong provider", profile: { harness: "pi", model: "openai/gpt-6.1-sol", provider: "openai" } },
    { at: "muse", profile: { harness: "pi", model: "opencode-go/muse-spark-1.3-contributor", provider: "opencode-go" } },
  ];
  expect(offCodexSol(placed).map(({ at }) => at)).toEqual(["codex", "wrong provider"]);
});

test.each([...MACHINES])("on the %s machine, every Sol profile runs on Codex", async (machine) => {
  expect(offCodexSol(await profilesOn(machine)), "a Sol profile off Codex draws on the wrong allowance").toEqual([]);
});

const piModels = builtinModels();

const effortOf = (placed: readonly Placed[]): readonly { at: string; model: string; effort: string }[] =>
  placed.flatMap(({ at, profile }) =>
    profile.model === undefined || profile.effort === undefined ? [] : [{ at, model: profile.model, effort: profile.effort }],
  );

const bridged = (id: string) => piModels.getModel("anthropic", id);

const catalogued = (provider: string, id: string) =>
  // Pi's offline catalog holds no claude-bridge provider; the bridge projects pi-ai's anthropic entries.
  provider === "claude-bridge" ? bridged(id) : piModels.getModel(provider, id);

const Effort = Schema.Literals(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);

const misrun = ({ at, model, effort }: { at: string; model: string; effort: string }): readonly string[] => {
  const slash = model.indexOf("/");
  const found = slash === -1 ? undefined : catalogued(model.slice(0, slash), model.slice(slash + 1));
  if (found === undefined) return [`${at}: ${model} is not in pi's catalog`];
  const decoded = Schema.decodeUnknownResult(Effort)(effort);
  if (!Result.isSuccess(decoded)) return [`${at}: ${model} at ${effort} names no thinking level pi runs`];
  const runsAs = clampThinkingLevel(found, decoded.success);
  return runsAs === effort ? [] : [`${at}: ${model} at ${effort} runs as ${runsAs}`];
};

test.each([...MACHINES])("on the %s machine, pi runs every dispatched effort as written", async (machine) => {
  const held = effortOf(await profilesOn(machine));
  expect(held.length, "no profile names both a model and an effort, so this checks nothing").toBeGreaterThan(0);
  expect(held.flatMap(misrun)).toEqual([]);
});

test("on the mac machine, a code change whose cause is not yet known dispatches Opus 5.5 on both accounts then Astra at high, after the narrower shared rules", async () => {
  const dispatch = await dispatchOn("mac");
  const found = dispatch.rules.filter(({ when }) => when.includes(UNKNOWN_CAUSE));
  expect(found, "the mac dispatch carries no unknown-cause rule, so one falls to the default").toHaveLength(1);
  const [rule] = found;
  if (rule === undefined) return expect.unreachable("the filter above found one rule");
  const narrow = dispatch.rules.slice(0, dispatch.rules.indexOf(rule)).filter(({ when }) => /^(Mechanical|Clearly specified implementation work of ordinary size)/.test(when));
  expect(narrow.length, "a narrower shared rule must still win over the unknown cause rule").toBe(2);
  expect(listed(rule.use)).toEqual([
    { harness: "pi", model: "claude-bridge/claude-opus-5-5", effort: "high", provider: "claude", claude_account: "main" },
    { harness: "pi", model: "claude-bridge/claude-opus-5-5", effort: "high", provider: "claude", claude_account: "second" },
    { harness: "pi", model: "openai/gpt-6-astra", effort: "high", provider: "codex" },
  ]);
});
