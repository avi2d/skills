import { Effect, Option, Schema, type FileSystem } from "effect";
import { RunRecord, odds, points, rate, resultFor } from "./ablation";
import { MalformedRecord, type FileFailure } from "../platform/failures";
import { attempt, unlessAbsent } from "../platform/files";

export const SWEEPS = "evals/sweeps";
export const SWEEP_PAGE = `${SWEEPS}/README.md`;

export type Prose = typeof Prose.Type;
export const Prose = Schema.Struct({
  files: Schema.Record(Schema.String, Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/, { message: "a Rule file's hash is its sha256 in hex" }))),
  uncommitted: Schema.Boolean,
});

export type SweepRecord = typeof SweepRecord.Type;
export const SweepRecord = Schema.Struct({
  startedAt: Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/, { message: "startedAt is a UTC time to the second, as 2026-09-24T11:13:59Z" })),
  runId: Schema.optionalKey(Schema.String.check(Schema.isPattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, { message: "runId is a UUID" }))),
  commit: Schema.String.check(Schema.isPattern(/^[0-9a-f]{40}$/, { message: "commit is a full git hash" })),
  prose: Schema.optionalKey(Prose),
  model: Schema.String,
  thinking: Schema.String,
  repeats: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  planned: Schema.Int,
  missing: Schema.Array(Schema.String),
  runs: Schema.Array(RunRecord),
});

export const startedAtOf = (date: Date): string => `${date.toISOString().slice(0, 19)}Z`;

export const stampOf = (startedAt: string): string => startedAt.replaceAll(":", "-");

export const sweepFile = (startedAt: string, runId?: string): string => `${stampOf(startedAt)}${runId === undefined ? "" : `-${runId}`}.json`;

export const recordText = (record: SweepRecord): string => `${JSON.stringify(record, null, 2)}\n`;

const decodeRecord = Schema.decodeUnknownEffect(Schema.fromJsonString(SweepRecord));

export const parseSweep = Effect.fnUntraced(function* (
  dir: string,
  file: string,
  text: string,
): Effect.fn.Return<SweepRecord, MalformedRecord> {
  const record = yield* decodeRecord(text).pipe(
    Effect.mapError((error) => new MalformedRecord({ message: `${dir}/${file} is not a sweep record: ${error.message}` })),
  );
  const named = sweepFile(record.startedAt, record.runId);
  if (named !== file) return yield* new MalformedRecord({ message: `${dir}/${file} records a sweep started at ${record.startedAt}, so it is named ${named}` });
  return record;
});

export const sweepRecords = Effect.fnUntraced(function* (
  dir: string,
): Effect.fn.Return<SweepRecord[], FileFailure | MalformedRecord, FileSystem.FileSystem> {
  const listed = Option.getOrElse(yield* attempt(dir, (fs) => fs.readDirectory(dir)).pipe(unlessAbsent), () => []);
  const records: SweepRecord[] = [];
  for (const file of listed.filter((name) => name.endsWith(".json")).toSorted()) {
    const path = `${dir}/${file}`;
    records.push(yield* parseSweep(dir, file, yield* attempt(path, (fs) => fs.readFileString(path))));
  }
  return records;
});

export function stalest(catalog: ReadonlyArray<{ rule: string }>, history: readonly SweepRecord[], model: string): string[] {
  const newest = (rule: string): string =>
    history
      .filter((record) => record.model === model && record.runs.some((run) => run.rule === rule && run.verdict.outcome !== "unjudged"))
      .map((record) => record.startedAt)
      .toSorted()
      .at(-1) ?? "";
  const [first, ...rest] = [...new Set(catalog.map((c) => c.rule))];
  if (first === undefined) return [];
  return [rest.reduce((oldest, rule) => (newest(rule) < newest(oldest) ? rule : oldest), first)];
}

const linked = (record: SweepRecord) => `[${record.startedAt}](${sweepFile(record.startedAt, record.runId)})`;

const proseState = (record: SweepRecord) =>
  record.prose === undefined ? "not recorded" : record.prose.uncommitted ? "uncommitted" : "as committed";

type TokenKind = "input" | "output" | "cacheRead" | "cacheWrite";

const tokenTotal = (record: SweepRecord, kind: TokenKind) => {
  const counts = record.runs.map((run) => run.spend[kind]);
  if (counts.length === 0 || counts.some((count) => count === undefined)) return "not recorded";
  return counts.reduce<number>((sum, count) => sum + (count ?? 0), 0);
};

const dollars = (record: SweepRecord) => {
  const cost = record.runs.reduce((sum, run) => sum + run.spend.cost, 0);
  if (cost === 0) return "not measured";
  return `${record.runs.some((run) => run.spend.costEstimated === true) ? "estimated " : ""}$${cost.toFixed(4)}`;
};

const ruleSection = (rule: string, records: readonly SweepRecord[]): string[] => [
  `## ${rule}`,
  "",
  "| Sweep | Model | Thinking | Case | Injected | Withheld | Difference | Fisher p |",
  "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ...records
    .filter((record) => record.runs.some((run) => run.rule === rule))
    .flatMap((record) => {
      const result = resultFor(rule, record.model, record.repeats, record.runs);
      return [
        `| ${linked(record)} | \`${record.model}\` | ${record.thinking} | all | ${rate(result.arms.injected)} | ${rate(result.arms.withheld)} | ${points(result.difference)} | ${odds(result.fisherP)} |`,
        ...result.cases.map(
          ({ case: id, arms, difference, fisherP }) =>
            `| | | | ${id} | ${rate(arms.injected)} | ${rate(arms.withheld)} | ${points(difference)} | ${odds(fisherP)} |`,
        ),
      ];
    }),
  "",
];

export const sweepPage = (records: readonly SweepRecord[]): string => {
  const sorted = records.toSorted((a, b) => a.startedAt.localeCompare(b.startedAt));
  const rules = [...new Set(sorted.flatMap((record) => record.runs.map((run) => run.rule)))].toSorted();
  return [
    "# Eval sweeps",
    "",
    "`bun run docs` writes this page from the sweep records beside it, and `bun run test` fails when the two disagree.",
    "",
    "Each record is one `bun run eval`, written by the sweep when it ends.",
    "It holds the model, the thinking level, the repeats and the commit the sweep ran on.",
    "It holds a sha256 of each Rule and reachable Reference file, and whether any differed from that commit.",
    "It holds every run's verdict, spend and turns, and whether the run wrote a test.",
    "No record is edited once committed, so a new measurement is a new record.",
    "A Rule's pooled row treats every run as independent, so read the case rows beneath it.",
    "New sweep records store input, output, cache-read, and cache-write token totals.",
    "Older records show missing cache counts as not recorded.",
    "Where cache counts are not recorded, the input column leaves out cached prompt tokens, so it undercounts the prompt.",
    "A run with no reported cost uses the matching Anthropic model rates from pi's catalog when available.",
    "The page marks that cost as estimated.",
    "A zero cost without a matching rate appears as not measured.",
    "",
    "## Sweeps",
    "",
    "| Sweep | Model | Thinking | Repeats | Runs | Input tokens | Output tokens | Cache-read tokens | Cache-write tokens | Cost | Commit | Prose |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...sorted.map(
      (record) =>
        `| ${linked(record)} | \`${record.model}\` | ${record.thinking} | ${record.repeats} | ${record.runs.length} of ${record.planned} | ${tokenTotal(record, "input")} | ${tokenTotal(record, "output")} | ${tokenTotal(record, "cacheRead")} | ${tokenTotal(record, "cacheWrite")} | ${dollars(record)} | \`${record.commit.slice(0, 7)}\` | ${proseState(record)} |`,
    ),
    "",
    ...rules.flatMap((rule) => ruleSection(rule, sorted)),
  ].join("\n");
};
