import { expect, test } from "bun:test";
import { Schema } from "effect";
import { CASES } from "../../evals/cases";
import { Knobs, settingsFrom } from "../../evals/settings";
import { sweepOf } from "../../src/eval/ablation";
import { REPO } from "../../src/generate/link";

const PAGE = "docs/eval-variables.md";
const ROW = /^\| `(EVAL_\w+)` \| (.*?) \|/;

test("the eval variables page lists every variable the settings read, each with the default they fall back to", async () => {
  const listed = new Map(
    (await Bun.file(`${REPO}${PAGE}`).text()).split("\n").flatMap((line) => {
      const [, name, fallback] = ROW.exec(line) ?? [];
      return name === undefined || fallback === undefined ? [] : [[name, fallback] as const];
    }),
  );
  expect([...listed.keys()].toSorted()).toEqual(Object.keys(Knobs.fields).toSorted());
  for (const [name, fallback] of Object.entries(Schema.decodeSync(Knobs)({}))) {
    expect(listed.get(name), `${PAGE} gives ${name} a default the settings do not`).toBe(`\`${fallback}\``);
  }
});

test("a model is named with its provider, and one without a provider is refused", () => {
  expect(settingsFrom({ EVAL_MODEL: "anthropic/claude-sonnet-5" }).model).toBe("anthropic/claude-sonnet-5");
  expect(settingsFrom({}).model).toBe("opencode-go/muse-spark-1.3-contributor");
  expect(() => settingsFrom({ EVAL_MODEL: "claude-sonnet-5" })).toThrow("EVAL_MODEL names its provider, as provider/model");
  expect(() => settingsFrom({ EVAL_MODEL: "anthropic/" })).toThrow("EVAL_MODEL names its provider, as provider/model");
});

test("a bare sweep measures one Rule, five repeats of each case in each arm", () => {
  const defaults = settingsFrom({});
  expect(defaults.rules).toBe("stalest");
  expect(defaults.repeats).toBe(5);
});

test("naming cases without Rules sweeps the Rules those cases belong to", () => {
  expect(settingsFrom({ EVAL_CASES: "public-helper" }).rules).toBe("all");
  expect(settingsFrom({ EVAL_RULES: "prove-it-works" }).rules).toEqual(["prove-it-works"]);
});

test("whichever Rule a bare sweep picks, the default cap admits its plan", () => {
  const defaults = settingsFrom({});
  const refusals = [...new Set(CASES.map((c) => c.rule))].flatMap((rule) => {
    const sweep = sweepOf(CASES, { ...defaults, rules: [rule] });
    return "refused" in sweep ? [`${rule}: ${sweep.refused}`] : [];
  });
  expect(refusals).toEqual([]);
});
