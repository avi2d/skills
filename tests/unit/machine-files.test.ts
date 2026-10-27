import { expect, test } from "bun:test";
import { Schema } from "effect";
import { createHash } from "node:crypto";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TASK_KINDS, crewDispatchJson } from "../../src/generate/crew-dispatch";
import { crewDispatchOf } from "../../src/generate/crew-dispatch-config";
import { generated } from "../../src/generate/generate";
import { MACHINE, REPO } from "../../src/generate/link";
import { MACHINES } from "../../src/generate/machine";
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
    const edited = CREW_DISPATCH.windows;
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

test.each([...MACHINES])("the %s crew dispatch file carries each rule's when and use, and no description or why", async (machine) => {
  const written = decodeWritten(await valueOf(crewDispatchJson(crewDispatchOf(machine))));
  const source = crewDispatchOf(machine);
  expect(written.rules).toEqual([
    ...source.rules.map(({ kind, use }) => ({ when: TASK_KINDS[kind].when, use })),
    ...source.ownRules.map(({ when, use }) => ({ when, use })),
  ]);
  expect(written.default).toEqual(source.default);
});

const Models = Schema.Array(Schema.Struct({ model: Schema.String }));

const decodeModels = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Struct({ rules: Schema.Array(Schema.Struct({ use: Models })), default: Models })));

test.each([...MACHINES])("no profile in the committed %s crew dispatch file names GPT-6 Luna", async (machine) => {
  const written = decodeModels(await Bun.file(`${REPO}${CREW_DISPATCH[machine]}`).text());
  const profiles = [...written.rules.flatMap(({ use }) => use), ...written.default];
  expect(profiles.length).toBeGreaterThan(0);
  expect(profiles.map(({ model }) => model).filter((model) => model.includes("gpt-6-luna"))).toEqual([]);
});

const withFirstProfile = (change: (profile: Record<string, unknown>) => Record<string, unknown>) => {
  const source = crewDispatchOf("windows");
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
  ["a provider the model does not spend", { provider: "claude" }, PROFILES_KNOWN],
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

test("generation refuses a floor on a profile other than Haiku 5.5", async () => {
  const source = withFirstProfile((profile) => ({ ...profile, floor: { scope: "all_models", min_percent: 15 } }));
  expect(await saidBy(crewDispatchJson(source))).toMatch(/floor/);
});

test("generation refuses a rule that names no profile", async () => {
  const source = crewDispatchOf("mac");
  expect(await saidBy(crewDispatchJson({ ...source, rules: source.rules.map((rule) => ({ ...rule, use: [] })) }))).toMatch(/use/);
});

const kindRule = (rule: Record<string, unknown>) => {
  const source = crewDispatchOf("windows");
  return { ...source, rules: [rule, ...source.rules.slice(1)] };
};

const muse = { harness: "pi", model: "opencode-go/muse-spark-1.3-contributor", effort: "low", provider: "opencode-go" };

test.each([
  ["a kind the table does not name", { kind: "tiny", use: [muse] }, /Expected "trivial" \| "small" \| "large" \| "ambiguous" \| "investigation"\n {2}at \["rules"\]\[0\]\["kind"\]/],
  ["a kind rule that brings its own when", { kind: "trivial", when: "Anything at all.", use: [muse] }, /Expected no excess property\n {2}at \["rules"\]\[0\]\["when"\]/],
  ["a machine's own rule among the shared ones", { description: "Work only here.", when: "Work only here.", use: [muse] }, /Expected no excess property\n {2}at \["rules"\]\[0\]\["description"\]/],
  ["a kind routed twice", { kind: "small", use: [muse] }, /routes each task kind once, and repeats small/],
])("generation refuses %s", async (_, rule, named) => {
  expect(await saidBy(crewDispatchJson(kindRule(rule)))).toMatch(named);
});

const NAMES_A_PROFILE = /\b(opus|haiku|muse|spark|luna|sol|deepseek|claude|gpt|codex|low|medium|high|xhigh|max|effort)\b/i;

test.each([...MACHINES])("no rule description on the %s machine names a model or an effort, which its use list already says", (machine) => {
  const { rules, ownRules } = crewDispatchOf(machine);
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

test.each([...MACHINES])("the %s no-mistakes config reads back as YAML into exactly its source", async (machine) => {
  expect(Bun.YAML.parse(await valueOf(noMistakesYaml(noMistakesConfigOf(machine, HOME))))).toEqual(noMistakesConfigOf(machine, HOME));
});

test.each([...MACHINES])("the %s comment review reports a warning with no-op, never an error or an escalation, and names restating and stale comments", async (machine) => {
  const yaml = await valueOf(noMistakesYaml(noMistakesConfigOf(machine, HOME)));
  const emitted = () => Bun.YAML.parse(yaml);
  expect(emitted()).toMatchObject({ review: { path_instructions: [{ path: "**/*", instructions: expect.stringContaining("severity 'warning' and action 'no-op'") }] } });
  expect(emitted()).toMatchObject({ review: { path_instructions: [{ path: "**/*", instructions: expect.stringContaining("restates the line under it") }] } });
  expect(emitted()).toMatchObject({ review: { path_instructions: [{ path: "**/*", instructions: expect.stringContaining("will go stale") }] } });
});

test("each machine reviews first on GPT-6.1 Sol under the name its pi gives the ChatGPT provider", () => {
  expect(noMistakesConfigOf("windows", HOME).reviewer_chain[0].model).toBe("openai/gpt-6.1-sol");
  expect(noMistakesConfigOf("mac", HOME).reviewer_chain[0].model).toBe("openai/gpt-6.1-sol");
});

test.each([...MACHINES])("the %s reviewer chain runs Sol on Codex, then Opus on the second Claude account, then Opus on main", (machine) => {
  const [sol, second, main] = noMistakesConfigOf(machine, HOME).reviewer_chain;
  expect(sol.floor).toMatchObject({ command: expect.stringMatching(/^quota-axi --provider codex --json \| jq /), minimum: 30 });
  expect(second.model).toBe("claude-bridge/claude-opus-5-5");
  expect(second.env.CLAUDE_CONFIG_DIR).toBe("/home/someone/.claude-accounts/second");
  expect(second.floor).toMatchObject({ field: "remaining_percent", minimum: 0 });
  expect(main).toEqual({
    agent: "pi",
    model: "claude-bridge/claude-opus-5-5",
    effort: "high",
    env: { CLAUDE_CONFIG_DIR: "/home/someone/.claude-accounts/main" },
  });
});

test("generation writes this machine's no-mistakes config under the generated root, with each login folder in $HOME", async () => {
  const bytes = (await valueOf(generated(REPO))).get(noMistakesConfigUnder(GENERATED_ROOT)) ?? expect.unreachable("generation wrote no no-mistakes config");
  const config = Bun.YAML.parse(new TextDecoder().decode(bytes));
  const home = process.env.HOME ?? expect.unreachable("the test runs with no $HOME");
  expect(config).toEqual(noMistakesConfigOf(MACHINE, home));
  expect(config).toMatchObject({ reviewer_chain: [{}, { env: { CLAUDE_CONFIG_DIR: `${home}/.claude-accounts/second` } }, {}] });
});

test("the Mac second-account floor asks the Keychain for the service Claude Code derives from that login dir", () => {
  const [, second] = noMistakesConfigOf("mac", HOME).reviewer_chain;
  const service = `Claude Code-credentials-${createHash("sha256").update(second.env.CLAUDE_CONFIG_DIR.normalize("NFC")).digest("hex").slice(0, 8)}`;
  expect(second.floor.command).toStartWith(`security find-generic-password -s '${service}' >/dev/null 2>&1 && `);
});

type Chain = readonly Record<string, unknown>[];

const withChain = (reorder: (chain: Chain) => readonly unknown[]) => {
  const source = noMistakesConfigOf("windows", HOME);
  return { ...source, reviewer_chain: reorder(source.reviewer_chain) };
};

const withoutFloor = ({ floor: _, ...entry }: Record<string, unknown> = {}) => entry;

test.each([
  ["Opus on the second account ahead of Sol", ([sol, second, main]: Chain) => [second, sol, main], /no excess property\n {2}at \["reviewer_chain"\]\[0\]\["env"\]$/],
  ["Opus on main ahead of the second account", ([sol, second, main]: Chain) => [sol, main, second], /Missing key\n {2}at \["reviewer_chain"\]\[1\]\["floor"\]$/],
  ["a first reviewer off Sol", ([sol, second, main]: Chain) => [{ ...sol, model: "openai/gpt-6-luna" }, second, main], /at \["reviewer_chain"\]\[0\]\["model"\]$/],
  ["a chain that drops Sol", ([, second, main]: Chain) => [second, main], /at \["reviewer_chain"\]\[0\]/],
  ["Sol with no floor", ([sol, second, main]: Chain) => [withoutFloor(sol), second, main], /Missing key\n {2}at \["reviewer_chain"\]\[0\]\["floor"\]$/],
  ["the second account with no floor", ([sol, second, main]: Chain) => [sol, withoutFloor(second), main], /Missing key\n {2}at \["reviewer_chain"\]\[1\]\["floor"\]$/],
])("generation refuses a reviewer chain with %s", async (_, reorder, named) => {
  expect(await saidBy(noMistakesYaml(withChain(reorder)))).toMatch(named);
});

test("generation refuses a login folder written with a tilde, which no-mistakes passes to the agent unexpanded", async () => {
  const source = withChain(([sol, second, main]) => [sol, { ...second, env: { CLAUDE_CONFIG_DIR: "~/.claude-accounts/second" } }, main]);
  expect(await saidBy(noMistakesYaml(source))).toMatch(/Expected a string starting with "\/"\n {2}at .*\["CLAUDE_CONFIG_DIR"\]$/);
});

test("generation refuses a reviewer role beside the chain, which no-mistakes refuses to combine", async () => {
  const source = { ...noMistakesConfigOf("windows", HOME), review_agents: { reviewer: { agent: "pi", model: "openai/gpt-6.1-sol", effort: "high" } } };
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
  ["harness/firstmate/secondmate-harness", "pi claude-bridge/claude-sonnet-5-5 high"],
  ["harness/firstmate/supervision-branch-model", "opencode-go/muse-spark-1.3-contributor"],
  ["harness/firstmate/supervision-branch-effort", "high"],
])("the committed %s holds today's pin %s", async (rel, pin) => {
  expect(FIRSTMATE_PINS[rel]).toBe(`${pin}\n`);
  expect(await Bun.file(`${REPO}${rel}`).text()).toBe(`${pin}\n`);
});

test("secondmate harness defaults to haiku", () => {
  expect(FIRSTMATE_PINS["harness/firstmate/secondmate-harness"]?.trim()).toBe("pi claude-bridge/claude-sonnet-5-5 high");
  const small = crewDispatchOf("mac").rules.find((rule) => rule.kind === "small");
  if (small === undefined) return expect.unreachable("the mac source holds no small rule");
  const [cheap] = small.use;
  expect(FIRSTMATE_PINS["harness/firstmate/supervision-branch-model"]?.trim()).toBe(cheap.model);
  expect(FIRSTMATE_PINS["harness/firstmate/supervision-branch-effort"]?.trim()).toBe(cheap.effort);
});

test.each([
  ["a field no-mistakes does not know", { bogus_field: 1 }, /bogus_field/],
  ["a duration with no unit", { agent_timeout: "30" }, /agent_timeout/],
  ["a rebase strategy no-mistakes refuses", { rebase: { strategy: "squash" } }, /strategy/],
])("generation refuses %s in the no-mistakes config", async (_, change, named) => {
  expect(await saidBy(noMistakesYaml({ ...noMistakesConfigOf("windows", HOME), ...change }))).toMatch(named);
});

const FREE_MODEL_REPOS = ["skills", "checks", "fleet-dash", "tui-dash", "ru-compliance"] as const;

test.each([...MACHINES])("the %s config leaves MiniMax on and Beam off with Muse fallback inside the five-repo allowlist", (machine) => {
  const config = noMistakesConfigOf(machine, HOME);
  expect(config.minimax_extra_review).toEqual({
    enabled: true,
    model: "opencode-go/minimax-m3.1-flash-free",
    fallback_model: "opencode-go/muse-spark-1.3-contributor",
    mode: "advisory",
    steps: ["review"],
    repos: FREE_MODEL_REPOS,
  });
  expect(config.beam_drafts).toEqual({
    enabled: false,
    model: "opencode-go/beam-free",
    fallback_model: "opencode-go/muse-spark-1.3-contributor",
    steps: ["commit", "document"],
    empty_retries: 1,
    apply_check: true,
    repos: FREE_MODEL_REPOS,
  });
});

test("disabling a free-model use decodes, so each switch stays optional", async () => {
  const source = noMistakesConfigOf("windows", HOME);
  const disabled = {
    ...source,
    minimax_extra_review: { ...source.minimax_extra_review, enabled: false },
    beam_drafts: { ...source.beam_drafts, enabled: false },
  };
  expect(Bun.YAML.parse(await valueOf(noMistakesYaml(disabled)))).toEqual(disabled);
});

const withFreeModels = (minimax: Record<string, unknown>, beam: Record<string, unknown>) => {
  const source = noMistakesConfigOf("windows", HOME);
  return {
    ...source,
    minimax_extra_review: { ...source.minimax_extra_review, ...minimax },
    beam_drafts: { ...source.beam_drafts, ...beam },
  };
};

test.each([
  ["a minimax reviewer that gates", withFreeModels({ mode: "blocking" }, {}), /at \["minimax_extra_review"\]\["mode"\]$/],
  ["minimax outside the review step", withFreeModels({ steps: ["document"] }, {}), /at \["minimax_extra_review"\]\["steps"\](\[\d+\])?$/],
  ["a minimax use off its free id", withFreeModels({ model: "opencode-go/muse-spark-1.3-contributor" }, {}), /at \["minimax_extra_review"\]\["model"\]$/],
  ["minimax with its fallback off Muse", withFreeModels({ fallback_model: "claude-bridge/claude-opus-5-5" }, {}), /at \["minimax_extra_review"\]\["fallback_model"\]$/],
  ["minimax with a repo outside the allowlist", withFreeModels({ repos: [...FREE_MODEL_REPOS.slice(0, 4), "website"] }, {}), /at \["minimax_extra_review"\]\["repos"\](\[\d+\])?$/],
  ["beam drafting outside commit and document", withFreeModels({}, { steps: ["commit", "mechanical"] }), /at \["beam_drafts"\]\["steps"\](\[\d+\])?$/],
  ["beam with no empty retry", withFreeModels({}, { empty_retries: 0 }), /at \["beam_drafts"\]\["empty_retries"\]$/],
  ["beam with no apply check", withFreeModels({}, { apply_check: false }), /at \["beam_drafts"\]\["apply_check"\]$/],
  ["beam with its fallback off Muse", withFreeModels({}, { fallback_model: "openai/gpt-6.1-sol" }), /at \["beam_drafts"\]\["fallback_model"\]$/],
  ["beam with a repo outside the allowlist", withFreeModels({}, { repos: [...FREE_MODEL_REPOS.slice(0, 4), "decisions"] }), /at \["beam_drafts"\]\["repos"\](\[\d+\])?$/],
])("generation refuses %s", async (_, source, named) => {
  expect(await saidBy(noMistakesYaml(source))).toMatch(named);
});

test("a string list the YAML writer emits reads back as the same list", () => {
  expect(Bun.YAML.parse(yamlOf({ repos: ["skills", "checks"] }))).toEqual({ repos: ["skills", "checks"] });
});
