import { Effect, FileSystem, Path } from "effect";
import { NO_PRIOR_HISTORY, mergeSplitSummary, withFileOps } from "../../harness/pi/extensions/haiku-compaction";
import { ArgsError, ReadError, parseFileSections, scoreSummaries, stripFileSections, type SummaryScore } from "./scoring";
import { poolRetention, retentionOf, retentionVerdict, type ClassRetention, type Retention } from "./retention";

export const DEFAULT_MAX_OUTPUT_TOKENS = 8000;
const DEFAULT_LIMIT = 24;
const DEFAULT_CANDIDATE = "claude-bridge/claude-haiku-5-5";
const DEFAULT_REFERENCE = "opencode-go/deepseek-v4-pro";
const DEFAULT_SESSION_MODEL = "claude-bridge/";
export const RECORDED_REFERENCE = "recorded";

export type ReplayArgs = {
  readonly sessionsRoots: string[];
  readonly sessionModel: string;
  readonly limit: number;
  readonly out: string | undefined;
  readonly dryRun: boolean;
  readonly all: boolean;
  readonly yes: boolean;
  readonly candidate: string;
  readonly reference: string;
  readonly cases: string | undefined;
  readonly maxOutputTokens: number;
  readonly rescore: string | undefined;
};

function flagValue(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 && index + 1 < argv.length ? argv[index + 1] : undefined;
}

export function parseReplayArgs(argv: readonly string[], home: string): Effect.Effect<ReplayArgs, ArgsError> {
  return Effect.gen(function* () {
    const limitRaw = flagValue(argv, "--limit");
    const maxRaw = flagValue(argv, "--max-output-tokens");
    const limit = limitRaw ? Number(limitRaw) : DEFAULT_LIMIT;
    const maxOutputTokens = maxRaw ? Number(maxRaw) : DEFAULT_MAX_OUTPUT_TOKENS;
    if (!Number.isInteger(limit) || limit <= 0) return yield* new ArgsError({ message: "--limit needs a positive integer" });
    if (!Number.isInteger(maxOutputTokens) || maxOutputTokens <= 0) {
      return yield* new ArgsError({ message: "--max-output-tokens needs a positive integer" });
    }
    return {
      sessionsRoots: (flagValue(argv, "--sessions-root") ?? home + "/.pi/agent/sessions").split(","),
      sessionModel: flagValue(argv, "--session-model") ?? DEFAULT_SESSION_MODEL,
      limit,
      out: flagValue(argv, "--out"),
      dryRun: argv.includes("--dry-run"),
      all: argv.includes("--all"),
      yes: argv.includes("--yes"),
      candidate: flagValue(argv, "--candidate") ?? DEFAULT_CANDIDATE,
      reference: flagValue(argv, "--reference") ?? DEFAULT_REFERENCE,
      cases: flagValue(argv, "--cases"),
      rescore: flagValue(argv, "--rescore"),
      maxOutputTokens,
    };
  });
}

export type ArmTokens = {
  readonly calls: number;
  readonly reportedInput: number;
  readonly reportedOutput: number;
  readonly estimatedInput: number;
  readonly estimatedOutput: number;
};

export const NO_TOKENS: ArmTokens = { calls: 0, reportedInput: 0, reportedOutput: 0, estimatedInput: 0, estimatedOutput: 0 };

export function addTokens(first: ArmTokens, second: ArmTokens): ArmTokens {
  return {
    calls: first.calls + second.calls,
    reportedInput: first.reportedInput + second.reportedInput,
    reportedOutput: first.reportedOutput + second.reportedOutput,
    estimatedInput: first.estimatedInput + second.estimatedInput,
    estimatedOutput: first.estimatedOutput + second.estimatedOutput,
  };
}

export function estimatedTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export type CaseReport = {
  readonly file: string;
  readonly dir: string;
  readonly index: number;
  readonly split: boolean;
  readonly tokensBefore: number;
  readonly rebuiltTokens: number;
  readonly skipped: number;
  readonly historyMessages: number;
  readonly prefixMessages: number;
  readonly recordedModel: string;
  readonly recordedItems: number;
  readonly recordedChars: number;
  readonly candidateChars: number;
  readonly referenceChars: number;
  readonly candidateCost: number;
  readonly referenceCost: number;
  readonly candidateTokens: ArmTokens;
  readonly retention: Retention;
  readonly candidate: SummaryScore;
  readonly reference: SummaryScore;
  readonly candidateText: string;
  readonly referenceText: string;
  readonly recordedText: string;
  readonly sourceText: string;
  readonly captainText: string;
  readonly previousSummary: string | undefined;
};

export function assembleSummary(
  split: boolean,
  historyText: string | undefined,
  prefixText: string,
  read: string[],
  modified: string[],
): string {
  const ops = { read: new Set(read), edited: new Set(modified), written: new Set<string>() };
  if (split && historyText !== undefined) return withFileOps(mergeSplitSummary(historyText, prefixText), ops);
  return withFileOps(historyText ?? prefixText, ops);
}

export function splitModelRef(ref: string): [string, string] {
  const slash = ref.indexOf("/");
  return slash < 0 ? [ref, ""] : [ref.slice(0, slash), ref.slice(slash + 1)];
}

export function verdictFor(candidateOverall: number, referenceOverall: number, candidateQuote: number, referenceQuote: number, candidateDecision: number, referenceDecision: number): string {
  if (referenceOverall === 0) return "NEEDS-DECISION";
  if (candidateOverall < 0.95 * referenceOverall) return "NEEDS-DECISION";
  if (candidateQuote < referenceQuote || candidateDecision < referenceDecision) return "NEEDS-DECISION";
  return "MERGE-GRADE";
}

function retentionSection(retention: readonly ClassRetention[], cases: readonly CaseReport[]): string[] {
  const rows = retention.map((slot) => "| " + slot.class + " | " + String(slot.pooled) + " | " + String(slot.recorded) + " | " + String(slot.candidate) + " |");
  const lost = cases.flatMap((c) => c.retention.lost.map((fact) => "- " + c.dir + "#" + String(c.index) + " " + fact.class + ": " + fact.text));
  return [
    "## Retention against the recorded summary",
    "",
    "| class | pooled | recorded | candidate |",
    "| --- | --- | --- | --- |",
    ...rows,
    "",
    "## Recorded facts the candidate lost",
    ...lost,
    "",
  ];
}

function renderReportMarkdown(input: {
  readonly candidate: string;
  readonly reference: string;
  readonly cases: readonly CaseReport[];
  readonly failures: { case: string; arm: string; error: string }[];
  readonly verdict: string;
  readonly retention: readonly ClassRetention[];
}): string {
  const lines: string[] = [];
  lines.push("# Haiku compaction replay");
  lines.push("");
  lines.push("Candidate: " + input.candidate + " / Reference: " + input.reference);
  lines.push("Verdict: " + input.verdict);
  lines.push("");
  lines.push(...retentionSection(input.retention, input.cases));
  lines.push("| case | split | items | candidate | reference | quotes c/r | decisions c/r |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");
  for (const c of input.cases) {
    lines.push("| " + c.dir + "#" + String(c.index) + " | " + (c.split ? "yes" : "no") + " | " + String(c.candidate.total) + " | " + c.candidate.overall.toFixed(3) + " | " + c.reference.overall.toFixed(3) + " | " + c.candidate.quoteRecall.toFixed(2) + "/" + c.reference.quoteRecall.toFixed(2) + " | " + c.candidate.decisionRecall.toFixed(2) + "/" + c.reference.decisionRecall.toFixed(2) + " |");
  }
  lines.push("");
  if (input.failures.length > 0) {
    lines.push("## Failures");
    for (const f of input.failures) lines.push("- " + f.case + " " + f.arm + ": " + f.error);
    lines.push("");
  }
  const worst = [...input.cases].sort((a, b) => a.candidate.overall - b.candidate.overall).slice(0, 3);
  lines.push("## Worst cases");
  for (const c of worst) {
    lines.push("");
    lines.push("### " + c.dir + "#" + String(c.index) + " (candidate " + c.candidate.overall.toFixed(3) + ")");
    lines.push("Recorded (" + String(c.recordedChars) + " chars):");
    lines.push(c.recordedText.slice(0, 6000));
    lines.push("Candidate (" + String(c.candidateChars) + " chars):");
    lines.push(c.candidateText.slice(0, 6000));
    lines.push("Reference (" + String(c.referenceChars) + " chars, recall " + c.reference.overall.toFixed(3) + "):");
    lines.push(c.referenceText.slice(0, 6000));
  }
  return lines.join("\n");
}

type RescoreCase = {
  readonly recordedText: string;
  readonly candidateText: string;
  readonly referenceText: string;
  readonly sourceText: string;
  readonly captainText: string;
};

type RescoreResult = {
  readonly retention: ClassRetention[];
  readonly verdict: "MERGE-GRADE" | "NEEDS-DECISION";
  readonly captainQuoteLosses: number;
  readonly decisionLosses: number;
  readonly toolQuoteLosses: number;
  readonly retentions: Retention[];
  readonly refreshed: { readonly retention: Retention; readonly candidate: SummaryScore; readonly reference: SummaryScore }[];
};

function rescoreCases(cases: readonly RescoreCase[]): RescoreResult {
  const refreshed = cases.map((c) => ({
    retention: retentionOf(c.recordedText, c.candidateText, c.sourceText, c.captainText),
    candidate: scoreSummaries(c.recordedText, c.candidateText),
    reference: scoreSummaries(c.recordedText, c.referenceText),
  }));
  const retentions = refreshed.map((r) => r.retention);
  const retention = poolRetention(retentions);
  const verdict = retentionVerdict(retention, cases.length, retentions);
  const lost = retentions.flatMap((r) => r.lost);
  return {
    retention,
    verdict,
    captainQuoteLosses: lost.filter((fact) => fact.class === "quote").length,
    decisionLosses: lost.filter((fact) => fact.class === "openDecision").length,
    toolQuoteLosses: lost.filter((fact) => fact.class === "toolQuote").length,
    retentions,
    refreshed,
  };
}

const MERGE_SEPARATOR = mergeSplitSummary("", "");

function reassembledText(text: string, historyPart: string): string {
  if (text.includes(MERGE_SEPARATOR)) return text;
  const sections = parseFileSections(text);
  return withFileOps(mergeSplitSummary(historyPart, stripFileSections(text)), {
    read: new Set(sections.read),
    edited: new Set(sections.modified),
    written: new Set<string>(),
  });
}

export type RescoredRun = {
  readonly done: CaseReport[];
  readonly summary: ResultSummary;
  readonly captainQuoteLosses: number;
  readonly decisionLosses: number;
  readonly toolQuoteLosses: number;
};

export function rescoreSaved(cases: readonly CaseReport[], againstRecorded: boolean): RescoredRun {
  const adjusted = cases.map((c) => {
    if (!c.split || c.historyMessages > 0) return c;
    const historyPart = c.previousSummary ?? NO_PRIOR_HISTORY;
    const candidateText = reassembledText(c.candidateText, historyPart);
    const referenceText = againstRecorded ? c.referenceText : reassembledText(c.referenceText, historyPart);
    const tail = "\n" + (c.previousSummary ?? "");
    return {
      ...c,
      candidateText,
      referenceText,
      candidateChars: stripFileSections(candidateText).length,
      referenceChars: stripFileSections(referenceText).length,
      sourceText: c.sourceText.endsWith(tail) ? c.sourceText : c.sourceText + tail,
    };
  });
  const rescored = rescoreCases(adjusted);
  const done = adjusted.map((c, i) => ({
    ...c,
    retention: rescored.retentions[i] ?? c.retention,
    candidate: rescored.refreshed[i]?.candidate ?? c.candidate,
    reference: rescored.refreshed[i]?.reference ?? c.reference,
  }));
  const base = summarizeResults(done, againstRecorded);
  return {
    done,
    summary: againstRecorded ? { ...base, verdict: rescored.verdict, retention: rescored.retention } : base,
    captainQuoteLosses: rescored.captainQuoteLosses,
    decisionLosses: rescored.decisionLosses,
    toolQuoteLosses: rescored.toolQuoteLosses,
  };
}

export type ResultSummary = {
  verdict: string;
  candidatePool: { overall: number; quote: number; decision: number; items: number };
  referencePool: { overall: number; quote: number; decision: number; items: number };
  candidateCostTotal: number;
  referenceCostTotal: number;
  candidateTokens: ArmTokens;
  retention: ClassRetention[];
};

export function summarizeResults(done: readonly CaseReport[], againstRecorded: boolean): ResultSummary {
  const candidatePool = poolScores(done.map((c) => c.candidate));
  const referencePool = poolScores(done.map((c) => c.reference));
  const retention = poolRetention(done.map((c) => c.retention));
  const modelVerdict = done.length >= 20
    ? verdictFor(candidatePool.overall, referencePool.overall, candidatePool.quote, referencePool.quote, candidatePool.decision, referencePool.decision)
    : "NEEDS-DECISION";
  const verdict = againstRecorded ? retentionVerdict(retention, done.length, done.map((c) => c.retention)) : modelVerdict;
  const candidateCostTotal = done.reduce((sum, c) => sum + c.candidateCost, 0);
  const referenceCostTotal = done.reduce((sum, c) => sum + c.referenceCost, 0);
  const candidateTokens = done.reduce((sum, c) => addTokens(sum, c.candidateTokens), NO_TOKENS);
  return { verdict, candidatePool, referencePool, candidateCostTotal, referenceCostTotal, candidateTokens, retention };
}

export function writeReports(
  fs: FileSystem.FileSystem,
  path: Path.Path,
  out: string,
  args: ReplayArgs,
  done: readonly CaseReport[],
  failures: { case: string; arm: string; error: string }[],
  summary: ResultSummary,
): Effect.Effect<void, ReadError> {
  return Effect.gen(function* () {
    yield* fs.makeDirectory(out, { recursive: true }).pipe(
      Effect.mapError((cause) => new ReadError({ message: "cannot create " + out + ": " + String(cause) })),
    );
    const payload = {
      candidate: args.candidate,
      reference: args.reference,
      verdict: summary.verdict,
      candidatePool: summary.candidatePool,
      referencePool: summary.referencePool,
      candidateCostTotal: summary.candidateCostTotal,
      referenceCostTotal: summary.referenceCostTotal,
      candidateTokens: summary.candidateTokens,
      retention: summary.retention,
      failures,
      cases: done,
    };
    yield* fs.writeFileString(path.join(out, "report.json"), JSON.stringify(payload, undefined, 2)).pipe(
      Effect.mapError((cause) => new ReadError({ message: "cannot write report: " + String(cause) })),
    );
    yield* fs.writeFileString(path.join(out, "report.md"), renderReportMarkdown({ candidate: args.candidate, reference: args.reference, cases: done, failures, verdict: summary.verdict, retention: summary.retention })).pipe(
      Effect.mapError((cause) => new ReadError({ message: "cannot write report: " + String(cause) })),
    );
  });
}

export function poolScores(scores: readonly SummaryScore[]): { overall: number; quote: number; decision: number; items: number } {
  let hits = 0;
  let items = 0;
  let quoteHits = 0;
  let quoteItems = 0;
  let decisionHits = 0;
  let decisionItems = 0;
  for (const s of scores) {
    hits += s.hits;
    items += s.total;
    quoteHits += Math.round(s.quoteRecall * s.quoteTotal);
    quoteItems += s.quoteTotal;
    decisionHits += Math.round(s.decisionRecall * s.decisionTotal);
    decisionItems += s.decisionTotal;
  }
  return {
    overall: items === 0 ? 1 : hits / items,
    quote: quoteItems === 0 ? 1 : quoteHits / quoteItems,
    decision: decisionItems === 0 ? 1 : decisionHits / decisionItems,
    items,
  };
}
