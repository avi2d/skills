import type { EvalCase } from "../fixture";
import { OUTCOMES } from "./prove-it-works";

// The commit before prove-it-works traded "the failing test first and the fix on top" for a reproduction through the real entry point.
const TEST_FIRST = "ca2444038272ab0c634cf37e3e68d044a219638d";

export const PROVE_IT_WORKS_TEST_FIRST: readonly EvalCase[] = OUTCOMES.map((c) => ({
  ...c,
  rule: "prove-it-works-test-first",
  delivery: { kind: "rule-as-of", of: "prove-it-works", commit: TEST_FIRST },
}));
