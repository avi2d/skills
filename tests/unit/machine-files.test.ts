import { expect, test } from "bun:test";
import { Schema } from "effect";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TASK_KINDS, crewDispatchJson, type Profile } from "../../src/generate/crew-dispatch";
import { CREW_DISPATCH_RULES } from "../../src/generate/crew-dispatch-config";
import { generated } from "../../src/generate/generate";
import { REPO } from "../../src/generate/link";
import { FIRSTMATE_PINS } from "../../src/generate/firstmate-pins";
import { CREW_DISPATCH, machineDrift, machineFiles } from "../../src/generate/machine-files";
import { noMistakesConfigOf, noMistakesConfigUnder, noMistakesYaml, yamlOf } from "../../src/generate/no-mistakes-config";
import { saidBy, valueOf } from "../lib/effect";
import { GENERATED_ROOT } from "../lib/generated-root";

const HOME = "/home/someone";

test("every committed machine file is what `bun run generate` writes from its source", async () => {
  expect(await valueOf(machineDrift(REPO)), "run `bun run generate` and commit what it rewrites under harness/").toEqual([]);
});

test("the drift check names a machine file edited by hand", async () => {
  const repo = `${await mkdtemp(join(tmpdir(), "skills-machine-files-"))}/`;
  try {
    for (const rel of (await valueOf(machineFiles())).keys()) await cp(`${REPO}${rel}`, `${repo}${rel}`);
    const edited = CREW_DISPATCH;
    await Bun.write(`${repo}${edited}`, (await Bun.file(`${repo}${edited}`).text()).replace('"effort": "low"', '"effort": "xhigh"'));
    expect(await valueOf(machineDrift(repo))).toEqual([`${edited} differs from what \`bun run generate\` writes`]);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

const decodeWritten = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({ array_order: Schema.Literal("preference"), rules: Schema.Array(Schema.Struct({ when: Schema.String, use: Schema.Unknown })), default: Schema.Unknown }),
  ),
  { onExcessProperty: "error" },
);

test("the crew dispatch file carries each rule's when and use, and no description or why", async () => {
  const written = decodeWritten(await valueOf(crewDispatchJson(CREW_DISPATCH_RULES)));
  const source = CREW_DISPATCH_RULES;
  expect(written.rules).toEqual([
    ...source.rules.map(({ kind, use }) => ({ when: TASK_KINDS[kind].when, use })),
    ...source.ownRules.map(({ when, use }) => ({ when, use })),
  ]);
  expect(written.default).toEqual(source.default);
});

const Models = Schema.Array(Schema.Struct({ model: Schema.String }));

const decodeModels = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Struct({ rules: Schema.Array(Schema.Struct({ use: Models })), default: Models })));

test("no profile in the committed crew dispatch file names GPT-6 Luna", async () => {
  const written = decodeModels(await Bun.file(`${REPO}${CREW_DISPATCH}`).text());
  const profiles = [...written.rules.flatMap(({ use }) => use), ...written.default];
  expect(profiles.length).toBeGreaterThan(0);
  expect(profiles.map(({ model }) => model).filter((model) => model.includes("gpt-6-luna"))).toEqual([]);
});

const withFirstProfile = (change: (profile: Record<string, unknown>) => Record<string, unknown>) => {
  const source = CREW_DISPATCH_RULES;
  const [first, ...rest] = source.rules;
  if (first === undefined) return expect.unreachable("the source holds no rule");
  const [profile, ...others] = first.use;
  return { ...source, rules: [{ ...first, use: [change(profile), ...others] }, ...rest] };
};

const PROFILES_KNOWN = /Expected \{ readonly "harness": "pi", readonly "model": "claude-bridge\/claude-opus-5-5", readonly "provider": "claude".*\n {2}at \["rules"\]\[0\]\["use"\]\[0\]$/;

test.each([
  ["a harness", { harness: "codex" }, PROFILES_KNOWN],
  ["a model", { model: "opencode-go/muse-spark-9" }, PROFILES_KNOWN],
  ["a provider", { provider: "openrouter" }, PROFILES_KNOWN],
  ["a provider the model does not spend", { provider: "opencode-go" }, PROFILES_KNOWN],
  ["an effort", { effort: "extreme" }, /Expected "low" \| "medium" \| "high" \| "xhigh" \| "max"\n {2}at .*\["effort"\]$/],
  ["a field", { why: "a rationale nobody keeps up" }, /why/],
])("generation refuses %s the schema does not know", async (_, change, named) => {
  const source = withFirstProfile((profile) => ({ ...profile, ...change }));
  expect(await saidBy(crewDispatchJson(source))).toMatch(named);
});

test("generation refuses a hand-added Sonnet 5.5 profile", async () => {
  const source = withFirstProfile(() => ({ harness: "pi", model: "claude-bridge/claude-sonnet-5-5", effort: "low", provider: "claude" }));
  expect(await saidBy(crewDispatchJson(source))).toMatch(PROFILES_KNOWN);
});

const haiku = { harness: "pi", model: "claude-bridge/claude-haiku-5-5", effort: "low", provider: "claude" };

test.each([
  ["no floor", haiku, /Missing key\n {2}at \["rules"\]\[0\]\["use"\]\[0\]\["floor"\]$/],
  ["a floor over 100%", { ...haiku, floor: { scope: "all_models", min_percent: 101 } }, /at \["rules"\]\[0\]\["use"\]\[0\]\["floor"\]\["min_percent"\]$/],
  ["a floor with no scope", { ...haiku, floor: { scope: "", min_percent: 15 } }, /at \["rules"\]\[0\]\["use"\]\[0\]\["floor"\]\["scope"\]$/],
])("generation refuses a Haiku 5.5 profile with %s", async (_, profile, named) => {
  expect(await saidBy(crewDispatchJson(withFirstProfile(() => profile)))).toMatch(named);
});

const withoutClaudeAccount = (profile: Profile): Profile | Record<string, unknown> => {
  if (!profile.model.startsWith("claude-bridge/")) return profile;
  const bare: Record<string, unknown> = { ...profile };
  delete bare.claude_account;
  return bare;
};

test("generation refuses a Claude profile with no claude_account, which leaves firstmate no login to launch", async () => {
  const source = CREW_DISPATCH_RULES;
  const [first, ...rest] = source.rules;
  if (first === undefined) return expect.unreachable("the source holds no rule");
  const use = first.use.map(withoutClaudeAccount);
  expect(await saidBy(crewDispatchJson({ ...source, rules: [{ ...first, use }, ...rest] }))).toMatch(/at \["rules"\]\[0\]\["use"\]\[0\]\["claude_account"\]/);
});

test("generation refuses a claude_account other than main or second, which every Claude spawn carries", async () => {
  const source = CREW_DISPATCH_RULES;
  const [first, ...rest] = source.rules;
  if (first === undefined) return expect.unreachable("the source holds no rule");
  const use = first.use.map((profile) =>
    profile.model === "claude-bridge/claude-opus-5-5" ? { ...profile, claude_account: "third" } : profile,
  );
  expect(await saidBy(crewDispatchJson({ ...source, rules: [{ ...first, use }, ...rest] }))).toMatch(/Expected "main" \| "second"[\s\S]*at \["rules"\]\[0\]\["use"\]\[2\]\["claude_account"\]$/);
});

test("generation refuses a claude_account on a Muse profile, which spends OpenCode Go rather than Claude", async () => {
  expect(await saidBy(crewDispatchJson(kindRule({ kind: "trivial", use: [{ ...muse, claude_account: "main" }] })))).toMatch(/Expected no excess property\n {2}at \["rules"\]\[0\]\["use"\]\[0\]\["claude_account"\]/);
});

test("generation refuses a floor on a profile other than Haiku 5.5 and Muse", async () => {
  const source = CREW_DISPATCH_RULES;
  const [first, ...rest] = source.rules;
  if (first === undefined) return expect.unreachable("the source holds no rule");
  const use = first.use.map((profile) => (profile.model.startsWith("claude-bridge/claude-opus") ? { ...profile, floor: { scope: "all_models", min_percent: 15 } } : profile));
  expect(await saidBy(crewDispatchJson({ ...source, rules: [{ ...first, use }, ...rest] }))).toMatch(/floor/);
});

test("generation refuses a rule that names no profile", async () => {
  const source = CREW_DISPATCH_RULES;
  expect(await saidBy(crewDispatchJson({ ...source, rules: source.rules.map((rule) => ({ ...rule, use: [] })) }))).toMatch(/use/);
});

const kindRule = (rule: Record<string, unknown>) => {
  const source = CREW_DISPATCH_RULES;
  return { ...source, rules: [rule, ...source.rules.slice(1)] };
};

const muse = { harness: "pi", model: "opencode-go/muse-spark-1.3-contributor", effort: "low", provider: "opencode-go", floor: { scope: "all_models", min_percent: 15 } };

test.each([
  ["a kind the table does not name", { kind: "tiny", use: [muse] }, /Expected "trivial" \| "small" \| "large" \| "ambiguous" \| "investigation"\n {2}at \["rules"\]\[0\]\["kind"\]/],
  ["a kind rule that brings its own when", { kind: "trivial", when: "Anything at all.", use: [muse] }, /Expected no excess property\n {2}at \["rules"\]\[0\]\["when"\]/],
  ["a machine's own rule among the shared ones", { description: "Work only here.", when: "Work only here.", use: [muse] }, /Expected no excess property\n {2}at \["rules"\]\[0\]\["description"\]/],
  ["a kind routed twice", { kind: "small", use: [muse] }, /routes each task kind once, and repeats small/],
])("generation refuses %s", async (_, rule, named) => {
  expect(await saidBy(crewDispatchJson(kindRule(rule)))).toMatch(named);
});

const NAMES_A_PROFILE = /\b(opus|haiku|muse|spark|luna|sol|deepseek|claude|gpt|codex|low|medium|high|xhigh|max|effort)\b/i;

test("no rule description names a model or an effort, which its use list already says", () => {
  const { rules, ownRules } = CREW_DISPATCH_RULES;
  const descriptions = [...rules.map(({ kind }) => TASK_KINDS[kind].description), ...ownRules.map(({ description }) => description)];
  expect(descriptions.length).toBeGreaterThan(0);
  expect(descriptions.filter((description) => NAMES_A_PROFILE.test(description))).toEqual([]);
});

test("the description check finds a description that names a model or an effort", () => {
  expect(["Muse at low effort takes it.", "Opus 5.5 runs it.", "It goes to the cheapest candidate."].filter((text) => NAMES_A_PROFILE.test(text))).toEqual([
    "Muse at low effort takes it.",
    "Opus 5.5 runs it.",
  ]);
});

test("the no-mistakes config reads back as YAML into exactly its source", async () => {
  expect(Bun.YAML.parse(await valueOf(noMistakesYaml(noMistakesConfigOf(HOME))))).toEqual(noMistakesConfigOf(HOME));
});

test("the comment review reports a warning with no-op, never an error or an escalation, and names restating and stale comments", async () => {
  const yaml = await valueOf(noMistakesYaml(noMistakesConfigOf(HOME)));
  const emitted = () => Bun.YAML.parse(yaml);
  expect(emitted()).toMatchObject({ review: { path_instructions: [{ path: "**/*", instructions: expect.stringContaining("severity 'warning' and action 'no-op'") }] } });
  expect(emitted()).toMatchObject({ review: { path_instructions: [{ path: "**/*", instructions: expect.stringContaining("restates the line under it") }] } });
  expect(emitted()).toMatchObject({ review: { path_instructions: [{ path: "**/*", instructions: expect.stringContaining("will go stale") }] } });
});

test("the reviewer chain runs Opus on main then Opus on second, with Astra refused a slot and every floor gone", () => {
  expect(noMistakesConfigOf(HOME).reviewer_chain).toEqual([
    { agent: "pi", model: "claude-bridge/claude-opus-5-5", effort: "high", env: { CLAUDE_CONFIG_DIR: "/home/someone/.claude-accounts/main" } },
    { agent: "pi", model: "claude-bridge/claude-opus-5-5", effort: "high", env: { CLAUDE_CONFIG_DIR: "/home/someone/.claude-accounts/second" } },
  ]);
});

test("the generated no-mistakes config names no Sol reviewer and no floor", async () => {
  const yaml = await valueOf(noMistakesYaml(noMistakesConfigOf(HOME)));
  expect(yaml).not.toMatch(/-sol\b|floor|five_hour/);
});

test("generation writes this machine's no-mistakes config under the generated root, with each login folder in $HOME", async () => {
  const bytes = (await valueOf(generated(REPO))).get(noMistakesConfigUnder(GENERATED_ROOT)) ?? expect.unreachable("generation wrote no no-mistakes config");
  const config = Bun.YAML.parse(new TextDecoder().decode(bytes));
  const home = process.env.HOME ?? expect.unreachable("the test runs with no $HOME");
  expect(config).toEqual(noMistakesConfigOf(home));
  expect(config).toMatchObject({ reviewer_chain: [{ env: { CLAUDE_CONFIG_DIR: `${home}/.claude-accounts/main` } }, { env: { CLAUDE_CONFIG_DIR: `${home}/.claude-accounts/second` } }] });
});

type Chain = readonly Record<string, unknown>[];

const withChain = (reorder: (chain: Chain) => readonly unknown[]) => {
  const source = noMistakesConfigOf(HOME);
  return { ...source, reviewer_chain: reorder(source.reviewer_chain) };
};

const codexFloor = { command: "true", field: "remaining_percent", minimum: 30 };

test.each([
  ["a Codex floor left on main", ([main, second]: Chain) => [{ ...main, floor: codexFloor }, second], /no excess property\n {2}at \["reviewer_chain"\]\[0\]\["floor"\]$/],
  ["a floor on the second account", ([main, second]: Chain) => [main, { ...second, floor: codexFloor }], /no excess property\n {2}at \["reviewer_chain"\]\[1\]\["floor"\]$/],
  ["Sol left first in the chain", ([, second]: Chain) => [{ agent: "pi", model: "openai/gpt-6.1-sol", effort: "high" }, second], /at \["reviewer_chain"\]\[0\]\["model"\]$/],
  ["Sol added back as a third reviewer", (chain: Chain) => [...chain, { agent: "pi", model: "openai/gpt-6.1-sol", effort: "high" }], /reviewer_chain/],
  ["Astra added back first", ([, second]: Chain) => [{ agent: "pi", model: "openai/gpt-6-astra", effort: "high" }, second], /at \["reviewer_chain"\]\[0\]\["model"\]$/],
  ["a chain that drops second", ([main]: Chain) => [main], /reviewer_chain/],
  ["the second account login ahead of main", ([main, second]: Chain) => [second, main], /at \["reviewer_chain"\]\[0\]/],
])("generation refuses a reviewer chain with %s", async (_, reorder, named) => {
  expect(await saidBy(noMistakesYaml(withChain(reorder)))).toMatch(named);
});

test("generation refuses a login folder written with a tilde, which no-mistakes passes to the agent unexpanded", async () => {
  const source = withChain(([main, second]) => [main, { ...second, env: { CLAUDE_CONFIG_DIR: "~/.claude-accounts/second" } }]);
  expect(await saidBy(noMistakesYaml(source))).toMatch(/Expected a string starting with "\/"\n {2}at .*\["CLAUDE_CONFIG_DIR"\]$/);
});

test("generation refuses a reviewer role beside the chain, which no-mistakes refuses to combine", async () => {
  const source = { ...noMistakesConfigOf(HOME), review_agents: { reviewer: { agent: "pi", model: "openai/gpt-6.1-sol", effort: "high" } } };
  expect(await saidBy(noMistakesYaml(source))).toMatch(/review_agents/);
});

test("a list the YAML writer emits reads back as the same list of mappings", () => {
  const chain = { chain: [{ a: "x", b: { c: 1 } }, { d: true }] };
  expect(Bun.YAML.parse(yamlOf(chain))).toEqual(chain);
});

test("a string the YAML writer emits keeps a character YAML would read as syntax", () => {
  expect(Bun.YAML.parse(yamlOf({ a: "x: #y", b: { c: "'\"" } }))).toEqual({ a: "x: #y", b: { c: "'\"" } });
});

test.each([
  ["harness/firstmate/supervision-branch-model", "opencode-go/muse-spark-1.3-contributor"],
  ["harness/firstmate/supervision-branch-effort", "high"],
])("the committed %s holds today's pin %s", async (rel, pin) => {
  expect(FIRSTMATE_PINS[rel]).toBe(`${pin}\n`);
  expect(await Bun.file(`${REPO}${rel}`).text()).toBe(`${pin}\n`);
});

test("the supervision branch pins the Muse candidate of the small rule", () => {
  const small = CREW_DISPATCH_RULES.rules.find((rule) => rule.kind === "small");
  if (small === undefined) return expect.unreachable("the source holds no small rule");
  const museCandidate = small.use.find((profile) => profile.model.startsWith("opencode-go/muse-spark"));
  if (museCandidate === undefined) return expect.unreachable("the small rule holds no Muse candidate");
  expect(FIRSTMATE_PINS["harness/firstmate/supervision-branch-model"]?.trim()).toBe(museCandidate.model);
  expect(FIRSTMATE_PINS["harness/firstmate/supervision-branch-effort"]?.trim()).toBe(museCandidate.effort);
});

test.each([
  ["a field no-mistakes does not know", { bogus_field: 1 }, /bogus_field/],
  ["the retired minimax_extra_review section", { minimax_extra_review: { enabled: false, model: "opencode-go/minimax-m3.1-flash-free", fallback_model: "opencode-go/muse-spark-1.3-contributor", mode: "advisory", steps: ["review"], repos: ["skills", "checks", "tui-dash", "ru-compliance"] } }, /Expected no excess property\n {2}at \["minimax_extra_review"\]/],
  ["the retired beam_drafts section", { beam_drafts: { enabled: false, model: "opencode-go/beam-free", fallback_model: "opencode-go/muse-spark-1.3-contributor", steps: ["commit", "document"], empty_retries: 1, apply_check: true, repos: ["skills", "checks", "tui-dash", "ru-compliance"] } }, /Expected no excess property\n {2}at \["beam_drafts"\]/],
  ["a duration with no unit", { agent_timeout: "30" }, /agent_timeout/],
  ["a rebase strategy no-mistakes refuses", { rebase: { strategy: "squash" } }, /strategy/],
  ["a Pages project with an uppercase letter and an underscore", { test: { evidence: { cloudflare_pages: { project: "Avi2d_Evidence" } } } }, /project/],
  ["a Pages project ending in a hyphen", { test: { evidence: { cloudflare_pages: { project: "avi2d-" } } } }, /project/],
  ["a Pages project longer than a 63-character DNS label", { test: { evidence: { cloudflare_pages: { project: "a".repeat(64) } } } }, /project/],
])("generation refuses %s in the no-mistakes config", async (_, change, named) => {
  expect(await saidBy(noMistakesYaml({ ...noMistakesConfigOf(HOME), ...change }))).toMatch(named);
});

test("the config rejects a missing or misplaced Pages project", async () => {
  expect(Bun.YAML.parse(await valueOf(noMistakesYaml(noMistakesConfigOf(HOME))))).toMatchObject({
    test: { evidence: { cloudflare_pages: { project: "avi2d-nm-evidence" } } },
  });
});

test("a string list the YAML writer emits reads back as the same list", () => {
  expect(Bun.YAML.parse(yamlOf({ repos: ["skills", "checks"] }))).toEqual({ repos: ["skills", "checks"] });
});
