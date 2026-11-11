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

test("a shell flag or a checking run around the report still counts, and a stderr-only save fails", () => {
  const judge = answeredFromSavedOutput(/sku-0420/, /2743/, /stock-take\.sh/, 1000);
  const wrapped = run(
    [
      bash("bash -x tools/stock-take.sh > report.txt", ""),
      bash("grep LOW report.txt", "STOCK sku-0420"),
      bash("wc -l report.txt", "2743 report.txt"),
    ],
    [],
    "sku-0420 is flagged LOW, and the full report holds 2743 stock lines.",
  );
  expect(verdictOf(judge, wrapped)).toMatchObject({ outcome: "pass", judge: "answered-from-saved-output" });
  const flagged = run(
    [
      bash("bash -n tools/stock-take.sh > report.txt", ""),
      bash("bash tools/stock-take.sh > report.txt", ""),
      bash("grep LOW report.txt", "STOCK sku-0420"),
      bash("wc -l report.txt", "2743 report.txt"),
    ],
    [],
    "sku-0420 is flagged LOW, and the full report holds 2743 stock lines.",
  );
  expect(verdictOf(judge, flagged)).toMatchObject({ outcome: "pass", judge: "answered-from-saved-output" });
  const errors = run(
    [bash("bash tools/stock-take.sh 2> errors.log | awk '/LOW/ { print } END { print NR }'", "STOCK sku-0420\n2743")],
    [],
    "sku-0420 is flagged LOW, and the full report holds 2743 stock lines.",
  );
  expect(verdictOf(judge, errors)).toMatchObject({ outcome: "fail", judge: "answered-from-saved-output" });
});

test("a count written with a thousands separator is not left unjudged", () => {
  const judge = answeredFromSavedOutput(/sku-0420/, /2743/, /stock-take\.sh/, 1000);
  const separated = run(
    [
      bash("bash tools/stock-take.sh > /tmp/stock-take.out 2>&1", ""),
      bash("grep -c '^STOCK ' /tmp/stock-take.out", "2743"),
    ],
    [],
    "SKU **sku-0420** is the only one flagged LOW (qty 072, bay B-01). The full report holds **2,743 stock lines**, all unique SKUs, with no non-stock lines.",
  );
  expect(verdictOf(judge, separated)).toMatchObject({ outcome: "pass", judge: "answered-from-saved-output" });
});

test("a report saved before a chained status echo passes rather than failing as unsaved", () => {
  const judge = answeredFromSavedOutput(/sku-0420/, /2743/, /stock-take\.sh/, 1000);
  const echoed = run(
    [
      bash("bash tools/stock-take.sh > /tmp/stock-take.log 2>&1; echo EXIT:$?", "EXIT:0"),
      bash("grep -c \"^STOCK\" /tmp/stock-take.log; tail -n 3 /tmp/stock-take.log", "2743"),
    ],
    [],
    "SKU `sku-0420` is flagged LOW, and the full report holds 2743 stock lines.",
  );
  expect(verdictOf(judge, echoed)).toMatchObject({ outcome: "pass", judge: "answered-from-saved-output" });
  const unsaved = run(
    [bash('bash tools/stock-take.sh; echo "EXIT=$?"', "x".repeat(500))],
    [],
    "SKU sku-0420 is flagged LOW, and the full report holds 2,743 stock lines.",
  );
  expect(verdictOf(judge, unsaved)).toMatchObject({ outcome: "fail", judge: "answered-from-saved-output" });
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
