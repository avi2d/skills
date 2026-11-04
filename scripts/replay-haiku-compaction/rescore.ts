import { Config, Console, Effect, FileSystem, Path } from "effect";
import { ArgsError, ReadError } from "./scoring";
import { RECORDED_REFERENCE, rescoreSaved, writeReports, type CaseReport } from "./report";

type SavedFailure = {
  readonly case: string;
  readonly arm: string;
  readonly error: string;
};

type SavedReport = {
  readonly candidate: string;
  readonly reference: string;
  readonly cases: readonly CaseReport[];
  readonly failures: readonly SavedFailure[];
};

function fieldOf(value: object, key: string): unknown {
  return Reflect.get(value, key);
}

function isCaseReport(value: unknown): value is CaseReport {
  if (typeof value !== "object" || value === null) return false;
  for (const key of ["file", "dir", "recordedModel", "candidateText", "referenceText", "recordedText", "sourceText", "captainText"]) {
    if (typeof fieldOf(value, key) !== "string") return false;
  }
  for (const key of ["index", "tokensBefore", "rebuiltTokens", "skipped", "historyMessages", "prefixMessages", "recordedItems", "recordedChars", "candidateChars", "referenceChars", "candidateCost", "referenceCost"]) {
    if (typeof fieldOf(value, key) !== "number") return false;
  }
  if (typeof fieldOf(value, "split") !== "boolean") return false;
  const previousSummary = fieldOf(value, "previousSummary");
  if (previousSummary !== undefined && typeof previousSummary !== "string") return false;
  for (const key of ["candidateTokens", "candidate", "reference"]) {
    if (typeof fieldOf(value, key) !== "object" || fieldOf(value, key) === null) return false;
  }
  return true;
}

function isSavedFailure(value: unknown): value is SavedFailure {
  if (typeof value !== "object" || value === null) return false;
  return typeof fieldOf(value, "case") === "string" && typeof fieldOf(value, "arm") === "string" && typeof fieldOf(value, "error") === "string";
}

function failuresOf(value: object): readonly SavedFailure[] | undefined {
  const failures = fieldOf(value, "failures");
  if (!Array.isArray(failures) || !failures.every(isSavedFailure)) return undefined;
  return failures;
}

function isSavedReport(value: unknown): value is SavedReport {
  if (typeof value !== "object" || value === null) return false;
  if (typeof fieldOf(value, "candidate") !== "string" || typeof fieldOf(value, "reference") !== "string") return false;
  const cases = fieldOf(value, "cases");
  return Array.isArray(cases) && cases.every(isCaseReport);
}

export function rescoreReport(
  fs: FileSystem.FileSystem,
  path: Path.Path,
  file: string,
  out: string | undefined,
  script: string,
): Effect.Effect<boolean, ReadError | ArgsError | Config.ConfigError> {
  return Effect.gen(function* () {
    const text = yield* fs.readFileString(file).pipe(
      Effect.mapError((cause) => new ReadError({ message: "cannot read " + file + ": " + String(cause) })),
    );
    const parsed: unknown = yield* Effect.try({
      try: (): unknown => JSON.parse(text),
      catch: () => new ArgsError({ message: "cannot parse " + file }),
    });
    const failures = typeof parsed === "object" && parsed !== null ? failuresOf(parsed) : undefined;
    if (failures === undefined) {
      return yield* new ArgsError({ message: "invalid failures in " + file + "; expected an array of {case, arm, error} entries" });
    }
    if (!isSavedReport(parsed) || parsed.cases.length === 0) {
      return yield* new ArgsError({ message: "no rescorable cases in " + file + "; re-run the replay to record source text" });
    }
    const rescored = rescoreSaved(parsed.cases, parsed.reference === RECORDED_REFERENCE);
    const done = rescored.done;
    const summary = rescored.summary;
    yield* Console.log(script + ": rescored " + String(done.length) + " case(s) from " + file);
    yield* Console.log(script + ": spend candidate=" + summary.candidateCostTotal.toFixed(4) + " reference=" + summary.referenceCostTotal.toFixed(4));
    yield* Console.log(script + ": verdict " + summary.verdict);
    const dir = out ?? (yield* Config.String("TMPDIR").pipe(Config.withDefault("/tmp"))) + "/replay-haiku-compaction-rescore-" + String(Date.now());
    yield* writeReports(fs, path, dir, {
      sessionsRoots: [],
      sessionModel: "",
      limit: 0,
      out: dir,
      dryRun: false,
      all: false,
      yes: true,
      candidate: parsed.candidate,
      reference: parsed.reference,
      cases: undefined,
      maxOutputTokens: 0,
      rescore: undefined,
    }, done, [...failures], summary);
    yield* Console.log(script + ": wrote " + dir);
    return true;
  });
}
