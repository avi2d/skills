import { describe, expect, test } from "bun:test";
import { resultFor, type RunRecord, type Verdict } from "../../src/eval/ablation";
import { parseSweep, recordText, stalest, sweepFile, sweepPage, sweepRecords, SWEEPS, type SweepRecord } from "../../src/eval/eval-sweeps";
import { REPO } from "../../src/generate/link";
import { said, value, valueOf } from "../lib/effect";

const pass: Verdict = { outcome: "pass", judge: "j", kind: "program", evidence: ["clean"] };
const fail: Verdict = { outcome: "fail", judge: "j", kind: "program", evidence: ["src/a.ts:1 opens a doc block"] };

const ran = (rule: string, id: string, arm: RunRecord["arm"], verdict: Verdict): RunRecord => ({
  rule,
  case: id,
  arm,
  repeat: 1,
  verdict,
  spend: { seconds: 30, input: 1000, output: 500, cacheRead: 0, cacheWrite: 0, cacheWrite1h: 0, cost: 0.0015, costEstimated: false },
});

const sweep = (startedAt: string, model: string, runs: readonly RunRecord[]): SweepRecord => ({
  startedAt,
  commit: "4b1bae19d0ffffa0e63487826d7200023c03e105",
  model,
  thinking: "high",
  repeats: 1,
  planned: runs.length,
  missing: [],
  runs,
});

const file = "library/engineering/rules/comment-discipline/SKILL.md";
const hash = "0".repeat(64);

const catalog = [
  { rule: "comment-discipline" },
  { rule: "prove-it-works" },
  { rule: "guard-the-context-window" },
];

describe("the Rule a bare sweep measures", () => {
  test("is the first in the catalog never swept on the model, whatever other models have seen", () => {
    const history = [
      sweep("2026-09-24T11:13:59Z", "m", [ran("comment-discipline", "a", "injected", pass)]),
      sweep("2026-09-25T09:00:00Z", "other", [ran("prove-it-works", "b", "injected", pass)]),
    ];
    expect(stalest(catalog, history, "m")).toEqual(["prove-it-works"]);
  });

  test("once every Rule has been swept on the model, is the one whose newest sweep is oldest", () => {
    const history = [
      sweep("2026-09-24T11:00:00Z", "m", [ran("comment-discipline", "a", "injected", pass)]),
      sweep("2026-09-24T12:00:00Z", "m", [ran("prove-it-works", "b", "injected", pass), ran("guard-the-context-window", "c", "injected", pass)]),
      sweep("2026-09-25T08:00:00Z", "m", [ran("comment-discipline", "a", "injected", pass)]),
    ];
    expect(stalest(catalog, history, "m")).toEqual(["prove-it-works"]);
  });

  test("does not count a newer sweep whose every run of the Rule went unjudged", () => {
    const unjudged: Verdict = { outcome: "unjudged", why: "the provider erred" };
    const history = [
      sweep("2026-09-24T11:00:00Z", "m", [ran("comment-discipline", "a", "injected", pass)]),
      sweep("2026-09-24T12:00:00Z", "m", [ran("prove-it-works", "b", "injected", pass)]),
      sweep("2026-09-24T13:00:00Z", "m", [ran("guard-the-context-window", "c", "injected", pass)]),
      sweep("2026-09-25T08:00:00Z", "m", [ran("comment-discipline", "a", "injected", unjudged), ran("comment-discipline", "a", "withheld", unjudged)]),
    ];
    expect(stalest(catalog, history, "m")).toEqual(["comment-discipline"]);
  });

  test("is none when no Rule has a case", () => {
    expect(stalest([], [], "m")).toEqual([]);
  });
});

describe("a sweep record", () => {
  const record = sweep("2026-09-24T11:13:59Z", "m", [ran("comment-discipline", "a", "injected", pass), ran("comment-discipline", "a", "withheld", fail)]);

  test("is named for the second its sweep started, and reads back as written", () => {
    expect(sweepFile(record.startedAt)).toBe("2026-09-24T11-13-59Z.json");
    expect(value(parseSweep(SWEEPS, sweepFile(record.startedAt), recordText(record)))).toEqual(record);
  });

  test("two sweeps started in the same second have distinct files and both read back", () => {
    const a = { ...record, runId: "00000000-0000-4000-8000-000000000001" };
    const b = { ...record, runId: "00000000-0000-4000-8000-000000000002" };
    const first = sweepFile(a.startedAt, a.runId);
    const second = sweepFile(b.startedAt, b.runId);
    expect(first).not.toBe(second);
    expect(value(parseSweep(SWEEPS, first, recordText(a)))).toEqual(a);
    expect(value(parseSweep(SWEEPS, second, recordText(b)))).toEqual(b);
  });

  test("with the hash of each Rule file it injected reads back as written, and a hash that is not a sha256 is refused", () => {
    const hashed: SweepRecord = { ...record, prose: { files: { [file]: hash }, uncommitted: true } };
    expect(value(parseSweep(SWEEPS, sweepFile(record.startedAt), recordText(hashed)))).toEqual(hashed);
    const short = recordText(hashed).replace(hash, "abc");
    expect(said(parseSweep(SWEEPS, sweepFile(record.startedAt), short))).toContain("a Rule file's hash is its sha256 in hex");
  });

  test("named apart from its start is refused, naming the file and the name it should carry", () => {
    const message = said(parseSweep(SWEEPS, "2026-09-25T00-00-00Z.json", recordText(record)));
    expect(message).toContain(`${SWEEPS}/2026-09-25T00-00-00Z.json`);
    expect(message).toContain("2026-09-24T11-13-59Z.json");
  });

  test("with a verdict no judge gives is refused, naming the file", () => {
    const tampered = recordText(record).replace('"outcome": "fail"', '"outcome": "maybe"');
    expect(said(parseSweep(SWEEPS, sweepFile(record.startedAt), tampered))).toContain(`${SWEEPS}/2026-09-24T11-13-59Z.json is not a sweep record`);
  });
});

describe("the sweep page", () => {
  const page = sweepPage([
    { ...sweep("2026-09-25T08:00:00Z", "anthropic/claude-sonnet-5", [ran("prove-it-works", "b", "injected", pass), ran("prove-it-works", "b", "withheld", pass)]), prose: { files: { [file]: hash }, uncommitted: true } },
    sweep("2026-09-24T11:13:59Z", "m", [ran("comment-discipline", "a", "injected", pass), ran("comment-discipline", "a", "withheld", fail)]),
    { ...sweep("2026-09-25T09:00:00Z", "m", [ran("comment-discipline", "a", "injected", pass)]), prose: { files: { [file]: hash }, uncommitted: false } },
  ]);
  const lines = page.split("\n");

  test("lists every sweep once, oldest first, with its model, thinking, repeats, runs, cost, commit and whether its prose was committed", () => {
    const listed = lines.slice(lines.indexOf("## Sweeps"), lines.indexOf("## comment-discipline"));
    expect(listed.filter((line) => line.startsWith("| ["))).toEqual([
      "| [2026-09-24T11:13:59Z](2026-09-24T11-13-59Z.json) | `m` | high | 1 | 2 of 2 | 2000 | 1000 | 0 | 0 | $0.0030 | `4b1bae1` | not recorded |",
      "| [2026-09-25T08:00:00Z](2026-09-25T08-00-00Z.json) | `anthropic/claude-sonnet-5` | high | 1 | 2 of 2 | 2000 | 1000 | 0 | 0 | $0.0030 | `4b1bae1` | uncommitted |",
      "| [2026-09-25T09:00:00Z](2026-09-25T09-00-00Z.json) | `m` | high | 1 | 1 of 1 | 1000 | 500 | 0 | 0 | $0.0015 | `4b1bae1` | as committed |",
    ]);
  });

  test("gives each Rule its own table, a row per sweep that measured it and a row per case beneath", () => {
    const section = lines.slice(lines.indexOf("## comment-discipline"));
    expect(section.slice(0, 6)).toEqual([
      "## comment-discipline",
      "",
      "| Sweep | Model | Thinking | Case | Injected | Withheld | Difference | Fisher p |",
      "| --- | --- | --- | --- | --- | --- | --- | --- |",
      "| [2026-09-24T11:13:59Z](2026-09-24T11-13-59Z.json) | `m` | high | all | 1/1, 100% | 0/1, 0% | +100 pp | 1.000 |",
      "| | | | a | 1/1, 100% | 0/1, 0% | +100 pp | 1.000 |",
    ]);
    expect(lines).toContain("## prove-it-works");
  });

  test("shows the cost of a sweep whose runs report none as not measured, rather than as nothing spent", () => {
    const unpriced = { ...ran("comment-discipline", "a", "injected", pass), spend: { seconds: 30, input: 10, output: 500, cacheRead: 200, cacheWrite: 100, cacheWrite1h: 0, cost: 0, costEstimated: false } };
    const row = sweepPage([sweep("2026-09-25T10:00:00Z", "claude-bridge/claude-opus-5-5", [unpriced, unpriced])])
      .split("\n")
      .find((line) => line.startsWith("| [2026-09-25T10:00:00Z]"));
    expect(row).toBe("| [2026-09-25T10:00:00Z](2026-09-25T10-00-00Z.json) | `claude-bridge/claude-opus-5-5` | high | 1 | 2 of 2 | 20 | 1000 | 400 | 200 | not measured | `4b1bae1` | not recorded |");
  });

  test("labels a fallback price as estimated", () => {
    const estimated = { ...ran("comment-discipline", "a", "injected", pass), spend: { seconds: 30, input: 10, output: 500, cacheRead: 200, cacheWrite: 100, cacheWrite1h: 0, cost: 0.01, costEstimated: true } };
    const row = sweepPage([sweep("2026-09-25T10:00:00Z", "claude-bridge/claude-opus-5-5", [estimated])])
      .split("\n")
      .find((line) => line.startsWith("| [2026-09-25T10:00:00Z]"));
    expect(row).toBe("| [2026-09-25T10:00:00Z](2026-09-25T10-00-00Z.json) | `claude-bridge/claude-opus-5-5` | high | 1 | 1 of 1 | 10 | 500 | 200 | 100 | estimated $0.0100 | `4b1bae1` | not recorded |");
  });
});

test("the committed history opens with the calibration of comment-discipline on Muse", async () => {
  const history = await valueOf(sweepRecords(`${REPO}${SWEEPS}`));
  const calibration = history.find((record) => record.startedAt === "2026-09-24T11:13:59Z") ?? expect.unreachable("no calibration record");
  expect([calibration.model, calibration.thinking, calibration.repeats, calibration.commit]).toEqual([
    "opencode-go/muse-spark-1.3-contributor",
    "high",
    3,
    "4b1bae19d0ffffa0e63487826d7200023c03e105",
  ]);
  const result = resultFor("comment-discipline", calibration.model, calibration.repeats, calibration.runs);
  expect([result.arms.injected.passed, result.arms.injected.failed, result.arms.withheld.passed, result.arms.withheld.failed]).toEqual([12, 0, 3, 9]);
  expect(calibration.runs.reduce((sum, run) => sum + run.spend.cost, 0)).toBeCloseTo(0.0288, 4);
  const originalSpend = calibration.runs[0]?.spend ?? expect.unreachable("the calibration has no recorded runs");
  expect([originalSpend.cacheRead, originalSpend.cacheWrite, originalSpend.cacheWrite1h, originalSpend.costEstimated]).toEqual([undefined, undefined, undefined, undefined]);
});
