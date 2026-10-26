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

const familyOf = (model: string | undefined): string => /muse|haiku|opus/.exec(model ?? "")?.[0] ?? `${model}`;

test.each([...MACHINES])("on the %s machine, the trivial and small tiers prefer Muse, then Haiku, then Opus, in array order", async (machine) => {
  const dispatch = await dispatchOn(machine);
  expect(dispatch.array_order, "without preference order firstmate ranks the candidates by spendPriority").toBe("preference");
  const workhorse = dispatch.rules.filter(({ when }) => /^(Trivial|Well-scoped small)/.test(when));
  expect(workhorse.length).toBe(2);
  for (const { when, use } of workhorse) expect(listed(use).map(({ model }) => familyOf(model)), when.slice(0, 60)).toEqual(["muse", "haiku", "opus"]);
});

test.each([...MACHINES])("on the %s machine, Haiku sits only in the trivial and small tiers, at low and high effort", async (machine) => {
  const haiku = naming(/haiku/i)(await profilesOn(machine));
  expect(haiku.map(({ at, profile }) => [/^(Trivial|Well-scoped small)/.exec(at)?.[0] ?? at, profile.effort])).toEqual([
    ["Trivial", "low"],
    ["Well-scoped small", "high"],
  ]);
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

test("on the mac machine, an ambiguous or cross-system investigation dispatches Opus 5.5 at high, after the narrower shared rules", async () => {
  const dispatch = await dispatchOn("mac");
  const found = dispatch.rules.filter(({ when }) => when.includes("Ambiguous or cross-system investigation"));
  expect(found, "the mac dispatch carries no investigation rule, so one falls to the default").toHaveLength(1);
  const [rule] = found;
  if (rule === undefined) return expect.unreachable("the filter above found one rule");
  const narrow = dispatch.rules.slice(0, dispatch.rules.indexOf(rule)).filter(({ when }) => /^(Trivial|Well-scoped small)/.test(when));
  expect(narrow.length, "a narrower shared rule must still win over the investigation rule").toBe(2);
  expect(listed(rule.use)).toEqual([{ harness: "pi", model: "claude-bridge/claude-opus-5-5", effort: "high", provider: "claude" }]);
});
