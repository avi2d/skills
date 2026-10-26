import { expect, test } from "bun:test";
import { passedHiddenVerifier, verdictOf, wroteTest } from "../../src/eval/eval-judges";
import { added, bash, run, write } from "../lib/eval-run";

const BUN_OUTPUT = "hidden-verifier/outcome.test.ts:\n(pass) the reported row [0.1ms]\n(fail) a doubled quote [0.1ms]\nerror: expect(received).toEqual(expected)\n\n 1 pass\n 1 fail\n";

test("an outcome is the hidden verifier's exit alone, whatever the agent did or tested", () => {
  const done = run([write("src/ledger.ts"), write("tests/ledger.test.ts"), bash("bun test", " 3 pass\n 0 fail")], [added("tests/ledger.test.ts", "")]);
  expect(verdictOf(passedHiddenVerifier, { ...done, verified: { exit: 1, output: BUN_OUTPUT } })).toEqual({
    outcome: "fail",
    judge: "hidden-verifier",
    kind: "program",
    evidence: ["the hidden verifier exited 1", "(fail) a doubled quote [0.1ms]", "error: expect(received).toEqual(expected)", "1 pass", "1 fail"],
  });
  expect(verdictOf(passedHiddenVerifier, { ...run([]), verified: { exit: 0, output: " 6 pass\n 0 fail\n" } })).toMatchObject({ outcome: "pass", evidence: ["the hidden verifier exited 0", "6 pass", "0 fail"] });
  expect(verdictOf(passedHiddenVerifier, { ...done, verified: { exit: "timed out", output: "" } })).toMatchObject({ outcome: "fail" });
  expect(verdictOf(passedHiddenVerifier, done)).toEqual({ outcome: "unjudged", why: "the case ran no hidden verifier" });
});

test("a run wrote a test when it left or wrote a file bun test runs, and not for a source file or a test fixture", () => {
  for (const path of ["tests/ledger.test.ts", "src/ledger.spec.tsx", "weeks_test.js", "csv_spec.mjs"]) {
    expect(wroteTest(run([], [added(path, "")])), path).toBe(true);
    expect(wroteTest(run([write(path)])), `${path} written and then removed`).toBe(true);
  }
  for (const path of ["src/ledger.ts", "tests/fixtures/bank.csv", "src/testing.ts", "src/latest.ts"]) expect(wroteTest(run([write(path)], [added(path, "")])), path).toBe(false);
});

