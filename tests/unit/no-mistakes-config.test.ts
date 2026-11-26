import { expect, test } from "bun:test";
import { Effect } from "effect";
import { UserConfigSource } from "../../src/generate/user-config";
import { generated } from "../../src/generate/generate";
import { REPO } from "../../src/generate/link";
import { noMistakesConfigOf, noMistakesConfigUnder, noMistakesYaml, yamlOf } from "../../src/generate/no-mistakes-config";
import { saidBy, valueOf } from "../lib/effect";
import { GENERATED_ROOT } from "../lib/generated-root";

const HOME = "/home/someone";

test.each([
  [[".custom-claude", ".another-claude"], `${process.env.HOME}/.custom-claude`],
  [[], undefined],
])("generation uses the first configured Claude directory or omits the environment", async (dirs, expected) => {
  const files = await valueOf(generated(REPO).pipe(Effect.provideService(UserConfigSource, Effect.succeed({ claudeConfigDirs: dirs }))));
  const bytes = files.get(noMistakesConfigUnder(GENERATED_ROOT)) ?? expect.unreachable("generation wrote no no-mistakes config");
  const config = Bun.YAML.parse(new TextDecoder().decode(bytes));
  const opus = expected === undefined ? { agent: "pi", model: "claude-bridge/claude-opus-5-5", effort: "high" } : { agent: "pi", model: "claude-bridge/claude-opus-5-5", effort: "high", env: { CLAUDE_CONFIG_DIR: expected } };
  expect(config).toEqual({ ...noMistakesConfigOf(process.env.HOME ?? ""), reviewer_chain: [opus, { agent: "pi", model: "openai/gpt-6.1-sol", effort: "high" }] });
});

test("the generated YAML enables the later-round fixer trial and leaves non-errors and tests to later handling with a two-round cap", async () => {
  const config = Bun.YAML.parse(await valueOf(noMistakesYaml(noMistakesConfigOf(HOME))));
  expect(config).toMatchObject({
    review_agents: {
      fixer_after_round: {
        after_round: 1,
        agent: "pi",
        model: "claude-bridge/claude-opus-5-5",
        effort: "high",
        alternate: { agent: "pi", model: "openai/gpt-6.1-sol", effort: "high" },
      },
    },
    review: { max_fix_rounds: 2, defer_non_errors: true },
    test: { ci_only: true },
    eval: { capture_provenance: true },
  });
  expect(config).not.toHaveProperty("agent_args_override");
});

test.each(["/Users/example", "/home/example"])("the generated YAML uses each configured agent's matching Orc wrapper under %s rather than the agent on PATH or another agent's wrapper", async (home) => {
  const config = noMistakesConfigOf(home);
  const emitted = Bun.YAML.parse(await valueOf(noMistakesYaml(config)));
  const wrappers = Object.fromEntries(Object.keys(config.agent_config).map((agent) => [agent, `${home}/.orc/heavy/agents/${agent}`]));
  expect(emitted).toMatchObject({ agent_path_override: wrappers });
});

test("every pipeline step outside the review loop runs Sonnet 5.5 at high on pi, not Muse Spark", async () => {
  expect(Bun.YAML.parse(await valueOf(noMistakesYaml(noMistakesConfigOf(HOME))))).toMatchObject({
    agent: "pi",
    agent_config: { pi: { model: "claude-bridge/claude-sonnet-5-5", effort: "high" } },
  });
});

test("generation refuses Muse Spark as the pi default", async () => {
  const source = { ...noMistakesConfigOf(HOME), agent_config: { ...noMistakesConfigOf(HOME).agent_config, pi: { model: "opencode-go/muse-spark-1.3-contributor", effort: "high" } } };
  expect(await saidBy(noMistakesYaml(source))).toMatch(/at \["agent_config"\]\["pi"\]\["model"\]$/);
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

test("the reviewer chain rejects a duplicate Opus and runs Opus before Sol", () => {
  expect(noMistakesConfigOf(HOME).reviewer_chain).toEqual([
    { agent: "pi", model: "claude-bridge/claude-opus-5-5", effort: "high" },
    { agent: "pi", model: "openai/gpt-6.1-sol", effort: "high" },
  ]);
});

test("the generated no-mistakes config carries no floor, which would skip Sol on every run now that Codex reports no five-hour window", async () => {
  const yaml = await valueOf(noMistakesYaml(noMistakesConfigOf(HOME)));
  expect(yaml).not.toMatch(/floor|five_hour/);
});

test("generation writes this machine's no-mistakes config under the generated root", async () => {
  const bytes = (await valueOf(generated(REPO).pipe(Effect.provideService(UserConfigSource, Effect.succeed({}))))).get(noMistakesConfigUnder(GENERATED_ROOT)) ?? expect.unreachable("generation wrote no no-mistakes config");
  const config = Bun.YAML.parse(new TextDecoder().decode(bytes));
  const home = process.env.HOME ?? expect.unreachable("the test runs with no $HOME");
  expect(config).toEqual(noMistakesConfigOf(home));
  expect(config).toMatchObject({ reviewer_chain: [{ model: "claude-bridge/claude-opus-5-5" }, { model: "openai/gpt-6.1-sol" }] });
});

type Chain = readonly Record<string, unknown>[];

const withChain = (reorder: (chain: Chain) => readonly unknown[]) => {
  const source = noMistakesConfigOf(HOME);
  return { ...source, reviewer_chain: reorder(source.reviewer_chain) };
};

const codexFloor = { command: "true", field: "remaining_percent", minimum: 30 };

test.each([
  ["a floor on Opus", ([opus, sol]: Chain) => [{ ...opus, floor: codexFloor }, sol], /no excess property\n {2}at \["reviewer_chain"\]\[0\]\["floor"\]$/],
  ["a floor on Sol", ([opus, sol]: Chain) => [opus, { ...sol, floor: codexFloor }], /no excess property\n {2}at \["reviewer_chain"\]\[1\]\["floor"\]$/],
  ["Sol first", ([opus, sol]: Chain) => [sol, opus], /at \["reviewer_chain"\]\[0\]\["model"\]$/],
  ["a duplicate Opus reviewer", ([opus, sol]: Chain) => [opus, sol, opus], /reviewer_chain/],
  ["Astra in Sol's slot", ([opus]: Chain) => [opus, { agent: "pi", model: "openai/gpt-6-astra", effort: "high" }], /at \["reviewer_chain"\]\[1\]\["model"\]$/],
  ["Astra first", ([, sol]: Chain) => [{ agent: "pi", model: "openai/gpt-6-astra", effort: "high" }, sol], /at \["reviewer_chain"\]\[0\]\["model"\]$/],
  ["a chain that drops Sol", ([opus]: Chain) => [opus], /reviewer_chain/],
  ["a chain that drops Opus", ([, sol]: Chain) => [sol], /reviewer_chain/],
])("generation refuses a reviewer chain with %s", async (_, reorder, named) => {
  expect(await saidBy(noMistakesYaml(withChain(reorder)))).toMatch(named);
});

test("generation refuses a login folder written with a tilde, which no-mistakes passes to the agent unexpanded", async () => {
  const source = withChain(([opus, sol]) => [{ ...opus, env: { CLAUDE_CONFIG_DIR: "~/.custom-claude" } }, sol]);
  expect(await saidBy(noMistakesYaml(source))).toMatch(/Expected a string starting with "\/"\n {2}at .*\["CLAUDE_CONFIG_DIR"\]$/);
});

test("generation refuses a reviewer role beside the chain, which no-mistakes refuses to combine", async () => {
  const source = { ...noMistakesConfigOf(HOME), review_agents: { ...noMistakesConfigOf(HOME).review_agents, reviewer: { agent: "pi", model: "openai/gpt-6.1-sol", effort: "high" } } };
  expect(await saidBy(noMistakesYaml(source))).toMatch(/\["review_agents"\]\["reviewer"\]/);
});

test("a list the YAML writer emits reads back as the same list of mappings", () => {
  const chain = { chain: [{ a: "x", b: { c: 1 } }, { d: true }] };
  expect(Bun.YAML.parse(yamlOf(chain))).toEqual(chain);
});

test("a string the YAML writer emits keeps a character YAML would read as syntax", () => {
  expect(Bun.YAML.parse(yamlOf({ a: "x: #y", b: { c: "'\"" } }))).toEqual({ a: "x: #y", b: { c: "'\"" } });
});
test.each([
  ["a field no-mistakes does not know", { bogus_field: 1 }, /bogus_field/],
  ["the retired minimax_extra_review section", { minimax_extra_review: { enabled: false, model: "opencode-go/minimax-m3.1-flash-free", fallback_model: "opencode-go/muse-spark-1.3-contributor", mode: "advisory", steps: ["review"], repos: ["skills", "checks", "tui-dash", "ru-compliance"] } }, /Expected no excess property\n {2}at \["minimax_extra_review"\]/],
  ["the retired beam_drafts section", { beam_drafts: { enabled: false, model: "opencode-go/beam-free", fallback_model: "opencode-go/muse-spark-1.3-contributor", steps: ["commit", "document"], empty_retries: 1, apply_check: true, repos: ["skills", "checks", "tui-dash", "ru-compliance"] } }, /Expected no excess property\n {2}at \["beam_drafts"\]/],
  ["a duration with no unit", { agent_timeout: "30" }, /agent_timeout/],
  ["a rebase strategy no-mistakes refuses", { rebase: { strategy: "squash" } }, /strategy/],
  ["a Pages project with an uppercase letter and an underscore", { test: { ci_only: true, evidence: { cloudflare_pages: { project: "Avi2d_Evidence" } } } }, /project/],
  ["a Pages project ending in a hyphen", { test: { ci_only: true, evidence: { cloudflare_pages: { project: "avi2d-" } } } }, /project/],
  ["a Pages project longer than a 63-character DNS label", { test: { ci_only: true, evidence: { cloudflare_pages: { project: "a".repeat(64) } } } }, /project/],
])("generation refuses %s in the no-mistakes config", async (_, change, named) => {
  expect(await saidBy(noMistakesYaml({ ...noMistakesConfigOf(HOME), ...change }))).toMatch(named);
});

test("the generated config names the avi2d-nm-evidence Pages project", async () => {
  expect(Bun.YAML.parse(await valueOf(noMistakesYaml(noMistakesConfigOf(HOME))))).toMatchObject({
    test: { evidence: { cloudflare_pages: { project: "avi2d-nm-evidence" } } },
  });
});

test("a string list the YAML writer emits reads back as the same list", () => {
  expect(Bun.YAML.parse(yamlOf({ repos: ["skills", "checks"] }))).toEqual({ repos: ["skills", "checks"] });
});
