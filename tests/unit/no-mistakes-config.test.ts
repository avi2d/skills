import { expect, test } from "bun:test";
import { generated } from "../../src/generate/generate";
import { REPO } from "../../src/generate/link";
import { noMistakesConfigOf, noMistakesConfigUnder, noMistakesYaml, yamlOf } from "../../src/generate/no-mistakes-config";
import { saidBy, valueOf } from "../lib/effect";
import { GENERATED_ROOT } from "../lib/generated-root";

const HOME = "/home/someone";

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
