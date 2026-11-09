import { expect, test } from "bun:test";
import { answeredFromSavedOutput, verdictOf } from "../../src/eval/eval-judges";
import { bash, run } from "../lib/eval-run";

test("a second answer read off a rerun fails, one read off the saved file passes, and a missing answer is unjudged", () => {
  const judge = answeredFromSavedOutput(/sku-0420/, /2743/, /stock-take\.sh/, 1000);
  const saved = run(
    [
      bash("bash tools/stock-take.sh > report.txt", ""),
      bash("grep LOW report.txt", "STOCK sku-0420 qty 072 bay B-01 LOW"),
      bash("wc -l report.txt", "2743 report.txt"),
    ],
    [],
    "sku-0420 is flagged LOW, and the full report holds 2743 stock lines.",
  );
  expect(verdictOf(judge, saved)).toEqual({
    outcome: "pass",
    judge: "answered-from-saved-output",
    kind: "program",
    evidence: ["the slow command ran once, at step 0, and saved its output to a file", "50 bytes of tool output entered the context, against a budget of 1000"],
  });
  const rerun = run(
    [bash("bash tools/stock-take.sh | grep LOW", "STOCK sku-0420"), bash("bash tools/stock-take.sh | wc -l", "2743")],
    [],
    "sku-0420 is flagged LOW, and the full report holds 2743 stock lines.",
  );
  expect(verdictOf(judge, rerun)).toEqual({
    outcome: "fail",
    judge: "answered-from-saved-output",
    kind: "program",
    evidence: ["the slow command ran 2 times, at steps 0, 1; the second answer should have come from the saved file"],
  });
  const whole = run(
    [bash("bash tools/stock-take.sh", "x".repeat(5000))],
    [],
    "sku-0420 is flagged LOW, and the full report holds 2743 stock lines.",
  );
  expect(verdictOf(judge, whole)).toMatchObject({ outcome: "fail", judge: "answered-from-saved-output" });
  expect(verdictOf(judge, run([], [], "I could not tell.")).outcome).toBe("unjudged");
  expect(verdictOf(judge, run([], [], "The full report holds 2743 stock lines.")).outcome).toBe("unjudged");
});

test("a read of the script never counts as a report run, and an answer with no report run is unjudged", () => {
  const judge = answeredFromSavedOutput(/sku-0420/, /2743/, /stock-take\.sh/, 1000);
  const readThenSaved = run(
    [
      bash("cat tools/stock-take.sh", "script"),
      bash("bash tools/stock-take.sh > report.txt", ""),
      bash("grep LOW report.txt", "STOCK sku-0420"),
      bash("wc -l report.txt", "2743 report.txt"),
    ],
    [],
    "sku-0420 is flagged LOW, and the full report holds 2743 stock lines.",
  );
  expect(verdictOf(judge, readThenSaved).outcome).toBe("pass");
  const derived = run(
    [bash("cat tools/stock-take.sh", "script")],
    [],
    "sku-0420 is flagged LOW, and the full report holds 2743 stock lines.",
  );
  expect(verdictOf(judge, derived).outcome).toBe("unjudged");
});

test("two report runs inside one bash call fail, and one unsaved run fails too", () => {
  const judge = answeredFromSavedOutput(/sku-0420/, /2743/, /stock-take\.sh/, 1000);
  const twice = run(
    [bash("bash tools/stock-take.sh > first.txt; bash tools/stock-take.sh > second.txt", "")],
    [],
    "sku-0420 is flagged LOW, and the full report holds 2743 stock lines.",
  );
  expect(verdictOf(judge, twice).outcome).toBe("fail");
  const piped = run(
    [bash("bash tools/stock-take.sh | grep LOW", "STOCK sku-0420")],
    [],
    "sku-0420 is flagged LOW, and the full report holds 2743 stock lines.",
  );
  expect(verdictOf(judge, piped).outcome).toBe("fail");
});
