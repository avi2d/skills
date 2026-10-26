import type { EvalCase } from "../fixture";
import { OUTCOMES } from "./prove-it-works";

// A fresh clone does not reach the commit this text was taken from, so the case reads the copy the tree holds.
const FIXTURE = "evals/past-rules/prove-it-works-ca24440/SKILL.md";

export const PROVE_IT_WORKS_TEST_FIRST: readonly EvalCase[] = OUTCOMES.map((c) => ({
  ...c,
  rule: "prove-it-works-test-first",
  delivery: { kind: "rule-as-of", of: "prove-it-works", fixture: FIXTURE },
}));
