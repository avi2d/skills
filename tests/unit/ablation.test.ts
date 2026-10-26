import { expect, test } from "bun:test";
import { fisherExact, plan, resultFor, sweepOf, table, type Arm, type RunRecord, type Verdict } from "../../src/eval/ablation";

const spend = { seconds: 1, input: 10, output: 5, cacheRead: 0, cacheWrite: 0, cacheWrite1h: 0, cost: 0, costEstimated: false };

const pass: Verdict = { outcome: "pass", judge: "j", kind: "program", evidence: [] };
const fail: Verdict = { outcome: "fail", judge: "j", kind: "program", evidence: ["src/a.ts:1 opens a doc block"] };
const unjudged: Verdict = { outcome: "unjudged", why: "the agent exited 1" };

const run = (id: string, arm: Arm, repeat: number, verdict: Verdict, rule = "comment-discipline"): RunRecord => ({
  rule,
  case: id,
  arm,
  repeat,
  verdict,
  spend,
});

test("a plan holds every case in both arms once per repeat, alternating arms inside each case", () => {
  const cells = plan("r", ["a", "b"], 2);
  expect(cells).toHaveLength(8);
  expect(cells.slice(0, 4).map((c) => `${c.case}/${c.arm}/${c.repeat}`)).toEqual([
    "a/injected/1",
    "a/withheld/1",
    "b/injected/1",
    "b/withheld/1",
  ]);
  expect(cells.at(-1)).toEqual({ rule: "r", case: "b", arm: "withheld", repeat: 2 });
});

const catalog = [
  { id: "a", rule: "comment-discipline" },
  { id: "b", rule: "comment-discipline" },
  { id: "c", rule: "prove-it-works" },
];

test("a sweep over every rule plans each case in both arms once per repeat", () => {
  const sweep = sweepOf(catalog, { rules: "all", cases: "all", repeats: 2, maxRuns: 12 });
  expect(sweep).toMatchObject({ cases: ["a", "b", "c"] });
  expect("cells" in sweep && sweep.cells.length).toBe(12);
});

test("a sweep larger than the run cap is refused before any run starts, naming both numbers", () => {
  expect(sweepOf(catalog, { rules: "all", cases: "all", repeats: 2, maxRuns: 11 })).toEqual({
    refused:
      "the sweep plans 12 agent runs of comment-discipline, prove-it-works, above the cap of 11; narrow EVAL_RULES, EVAL_CASES or EVAL_REPEATS, or raise EVAL_MAX_RUNS on purpose",
  });
});

test("a sweep narrows to the rules and cases it is asked for, and refuses a name it does not know", () => {
  const narrowed = sweepOf(catalog, { rules: ["comment-discipline"], cases: ["b"], repeats: 3, maxRuns: 6 });
  expect(narrowed).toMatchObject({ cases: ["b"] });
  expect("cells" in narrowed && narrowed.cells.every((c) => c.case === "b" && c.rule === "comment-discipline")).toBe(true);
  expect(sweepOf(catalog, { rules: ["unslop"], cases: "all", repeats: 1, maxRuns: 9 })).toEqual({
    refused: "no eval case measures unslop; the rules with cases are comment-discipline, prove-it-works",
  });
  expect(sweepOf(catalog, { rules: ["prove-it-works"], cases: ["a"], repeats: 1, maxRuns: 9 })).toEqual({ refused: "no case a among c" });
});

test("Fisher's exact test agrees with the hypergeometric sum on tables worked by hand", () => {
  expect(fisherExact(3, 1, 1, 3)).toBeCloseTo(0.4857142857, 8);
  expect(fisherExact(10, 2, 3, 9)).toBeCloseTo(0.0122781378, 8);
  expect(fisherExact(12, 0, 0, 12)).toBeCloseTo(7.39602301e-7, 12);
  expect(fisherExact(0, 12, 12, 0)).toBeCloseTo(7.39602301e-7, 12);
  expect(fisherExact(6, 6, 6, 6)).toBeCloseTo(1, 8);
  expect(fisherExact(1, 0, 0, 0)).toBe(1);
});

test("an arm's pass rate counts judged runs only, and an unjudged run is reported beside it", () => {
  const runs = [
    run("a", "injected", 1, pass),
    run("a", "injected", 2, pass),
    run("a", "injected", 3, unjudged),
    run("a", "withheld", 1, fail),
    run("a", "withheld", 2, pass),
    run("a", "withheld", 3, fail),
    run("other", "withheld", 1, pass, "prove-it-works"),
  ];
  const result = resultFor("comment-discipline", "m", 3, runs);
  expect(result.arms.injected).toEqual({ runs: 3, passed: 2, failed: 0, unjudged: 1, passRate: 1 });
  expect(result.arms.withheld).toEqual({ runs: 3, passed: 1, failed: 2, unjudged: 0, passRate: 1 / 3 });
  expect(result.difference).toBeCloseTo(2 / 3, 10);
  expect(result.fisherP).toBeCloseTo(fisherExact(2, 0, 1, 2), 10);
  expect(result.runs).toHaveLength(6);
  expect(result.cases).toEqual([{ case: "a", arms: result.arms, difference: result.difference, fisherP: result.fisherP }]);
});

test("an arm with no judged run has no pass rate, so the rule has no difference and no p", () => {
  const result = resultFor("r", "m", 1, [run("a", "injected", 1, unjudged, "r"), run("a", "withheld", 1, pass, "r")]);
  expect(result.arms.injected.passRate).toBeNull();
  expect(result.difference).toBeNull();
  expect(result.fisherP).toBeNull();
});

test("a p below a thousandth keeps its magnitude in the table rather than reading as zero", () => {
  const runs = [
    ...[1, 2, 3, 4, 5, 6].map((n) => run("a", "injected", n, pass)),
    ...[1, 2, 3, 4, 5, 6].map((n) => run("a", "withheld", n, fail)),
  ];
  expect(table([resultFor("comment-discipline", "m", 6, runs)]).split("\n")[2]).toBe(
    "| comment-discipline | all, 6 repeat(s) | 6/6, 100% | 0/6, 0% | +100 pp | 0.002 |",
  );
  const lopsided = [...runs, ...[7, 8, 9, 10, 11, 12].flatMap((n) => [run("a", "injected", n, pass), run("a", "withheld", n, fail)])];
  expect(table([resultFor("comment-discipline", "m", 12, lopsided)]).split("\n")[2]).toContain("| +100 pp | 7.4e-7 |");
});

test("the table carries each rule's arms, the difference in points, and one row per case", () => {
  const runs = [run("a", "injected", 1, pass), run("a", "withheld", 1, fail), run("b", "injected", 1, pass), run("b", "withheld", 1, unjudged)];
  const text = table([resultFor("comment-discipline", "m", 1, runs)]);
  expect(text.split("\n")).toEqual([
    "| rule | case | injected | withheld | difference | Fisher p |",
    "| --- | --- | --- | --- | --- | --- |",
    "| comment-discipline | all, 1 repeat(s) | 2/2, 100% | 0/1, 0%, 1 unjudged | +100 pp | 0.333 |",
    "| | a | 1/1, 100% | 0/1, 0% | +100 pp | 1.000 |",
    "| | b | 1/1, 100% | -/1 | - | - |",
  ]);
});

test("a case that splits its arms five to none reads below a p of 0.01 in its own row", () => {
  const runs = [1, 2, 3, 4, 5].flatMap((n) => [run("a", "injected", n, pass), run("a", "withheld", n, fail), run("b", "injected", n, pass), run("b", "withheld", n, pass)]);
  const [, , , a, b] = table([resultFor("comment-discipline", "m", 5, runs)]).split("\n");
  expect(a).toBe("| | a | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |");
  expect(b).toBe("| | b | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |");
});
