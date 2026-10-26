import { Schema } from "effect";

const ARMS = ["injected", "withheld"] as const;

export type Arm = (typeof ARMS)[number];

const CellFields = { rule: Schema.String, case: Schema.String, arm: Schema.Literals(ARMS), repeat: Schema.Int };

export type Cell = typeof Cell.Type;
const Cell = Schema.Struct(CellFields);

export type Verdict = typeof Verdict.Type;
export const Verdict = Schema.Union([
  Schema.Struct({ outcome: Schema.Literals(["pass", "fail"]), judge: Schema.String, kind: Schema.Literal("program"), evidence: Schema.mutable(Schema.Array(Schema.String)) }),
  Schema.Struct({ outcome: Schema.Literal("unjudged"), why: Schema.String }),
]);

export type Spend = typeof Spend.Type;
export const Spend = Schema.Struct({
  seconds: Schema.Finite,
  turns: Schema.optionalKey(Schema.Int),
  input: Schema.Finite,
  output: Schema.Finite,
  cacheRead: Schema.optionalKey(Schema.Finite),
  cacheWrite: Schema.optionalKey(Schema.Finite),
  cacheWrite1h: Schema.optionalKey(Schema.Finite),
  cost: Schema.Finite,
  costEstimated: Schema.optionalKey(Schema.Boolean),
});

export type RunRecord = typeof RunRecord.Type;
export const RunRecord = Schema.Struct({ ...CellFields, verdict: Verdict, spend: Spend, wroteTest: Schema.optionalKey(Schema.Boolean) });

export type ArmTally = { runs: number; passed: number; failed: number; unjudged: number; passRate: number | null };

type Comparison = { arms: Record<Arm, ArmTally>; difference: number | null; fisherP: number | null };

type CaseResult = Comparison & { case: string };

export type RuleResult = Comparison & {
  rule: string;
  model: string;
  repeats: number;
  cases: CaseResult[];
  runs: RunRecord[];
};

// Arms alternate inside each case and repeat, so a batch of concurrent runs never holds only one arm
// while the provider's latency or rate limit drifts under it.
export function plan(rule: string, cases: readonly string[], repeats: number): Cell[] {
  const cells: Cell[] = [];
  for (let repeat = 1; repeat <= repeats; repeat++) {
    for (const id of cases) for (const arm of ARMS) cells.push({ rule, case: id, arm, repeat });
  }
  return cells;
}

export type SweepSelection = { rules: readonly string[] | "all"; cases: readonly string[] | "all"; repeats: number; maxRuns: number };

export type Sweep = { cases: readonly string[]; cells: Cell[] } | { refused: string };

export function sweepOf(catalog: ReadonlyArray<{ id: string; rule: string }>, selection: SweepSelection): Sweep {
  const known = [...new Set(catalog.map((c) => c.rule))];
  const rules = selection.rules === "all" ? known : selection.rules;
  const strangers = rules.filter((rule) => !known.includes(rule));
  if (strangers.length > 0) return { refused: `no eval case measures ${strangers.join(", ")}; the rules with cases are ${known.join(", ")}` };
  const inRules = catalog.filter((c) => rules.includes(c.rule));
  const wanted = selection.cases;
  const unknown = wanted === "all" ? [] : wanted.filter((id) => !inRules.some((c) => c.id === id));
  if (unknown.length > 0) return { refused: `no case ${unknown.join(", ")} among ${inRules.map((c) => c.id).join(", ")}` };
  const chosen = inRules.filter((c) => wanted === "all" || wanted.includes(c.id));
  const cells = rules.flatMap((rule) => plan(rule, chosen.filter((c) => c.rule === rule).map((c) => c.id), selection.repeats));
  if (cells.length === 0) return { refused: "the selection holds no case, so the sweep would run nothing" };
  if (cells.length > selection.maxRuns) {
    return {
      refused: `the sweep plans ${cells.length} agent runs of ${[...new Set(cells.map((cell) => cell.rule))].join(", ")}, above the cap of ${selection.maxRuns}; narrow EVAL_RULES, EVAL_CASES or EVAL_REPEATS, or raise EVAL_MAX_RUNS on purpose`,
    };
  }
  return { cases: chosen.map((c) => c.id), cells };
}

function tallyOf(runs: readonly RunRecord[]): ArmTally {
  const passed = runs.filter((run) => run.verdict.outcome === "pass").length;
  const failed = runs.filter((run) => run.verdict.outcome === "fail").length;
  const judged = passed + failed;
  return { runs: runs.length, passed, failed, unjudged: runs.length - judged, passRate: judged === 0 ? null : passed / judged };
}

const byArm = (runs: readonly RunRecord[]): Record<Arm, ArmTally> => ({
  injected: tallyOf(runs.filter((run) => run.arm === "injected")),
  withheld: tallyOf(runs.filter((run) => run.arm === "withheld")),
});

const logFactorial = (n: number): number => {
  let sum = 0;
  for (let k = 2; k <= n; k++) sum += Math.log(k);
  return sum;
};

// Two-sided by summing every table no more likely than the observed one, not by doubling one tail.
export function fisherExact(a: number, b: number, c: number, d: number): number {
  const rowA = a + b;
  const colA = a + c;
  const n = a + b + c + d;
  const fixed = logFactorial(rowA) + logFactorial(n - rowA) + logFactorial(colA) + logFactorial(n - colA) - logFactorial(n);
  const logP = (x: number): number =>
    fixed - logFactorial(x) - logFactorial(rowA - x) - logFactorial(colA - x) - logFactorial(n - rowA - colA + x);
  const observed = logP(a);
  let p = 0;
  for (let x = Math.max(0, rowA + colA - n); x <= Math.min(rowA, colA); x++) {
    if (logP(x) <= observed + 1e-9) p += Math.exp(logP(x));
  }
  return Math.min(1, p);
}

function compared(runs: readonly RunRecord[]): Comparison {
  const arms = byArm(runs);
  const { injected, withheld } = arms;
  return {
    arms,
    difference: injected.passRate === null || withheld.passRate === null ? null : injected.passRate - withheld.passRate,
    fisherP:
      injected.passed + injected.failed === 0 || withheld.passed + withheld.failed === 0
        ? null
        : fisherExact(injected.passed, injected.failed, withheld.passed, withheld.failed),
  };
}

export function resultFor(rule: string, model: string, repeats: number, runs: readonly RunRecord[]): RuleResult {
  const mine = runs.filter((run) => run.rule === rule);
  const cases = [...new Set(mine.map((run) => run.case))].map((id) => ({ case: id, ...compared(mine.filter((run) => run.case === id)) }));
  return { rule, model, repeats, ...compared(mine), cases, runs: [...mine] };
}

export const rate = (tally: ArmTally): string =>
  tally.passRate === null
    ? `-/${tally.runs}`
    : `${tally.passed}/${tally.passed + tally.failed}, ${Math.round(tally.passRate * 100)}%${tally.unjudged ? `, ${tally.unjudged} unjudged` : ""}`;

export const points = (difference: number | null): string =>
  difference === null ? "-" : `${difference >= 0 ? "+" : ""}${Math.round(difference * 100)} pp`;

export const odds = (p: number | null): string => (p === null ? "-" : p < 0.001 ? p.toExponential(1) : p.toFixed(3));

export function table(results: readonly RuleResult[]): string {
  const lines = [
    "| rule | case | injected | withheld | difference | Fisher p |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  for (const result of results) {
    lines.push(
      `| ${result.rule} | all, ${result.repeats} repeat(s) | ${rate(result.arms.injected)} | ${rate(result.arms.withheld)} | ${points(result.difference)} | ${odds(result.fisherP)} |`,
    );
    for (const { case: id, arms, difference, fisherP } of result.cases) {
      lines.push(`| | ${id} | ${rate(arms.injected)} | ${rate(arms.withheld)} | ${points(difference)} | ${odds(fisherP)} |`);
    }
  }
  return lines.join("\n");
}
