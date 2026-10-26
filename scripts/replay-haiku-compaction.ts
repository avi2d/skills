#!/usr/bin/env bun
import { Config, Console, Effect, FileSystem, Path } from "effect";
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import { NO_PRIOR_HISTORY, conversationOf, historyPromptOf, isMuseSession, turnPrefixPromptOf } from "../harness/pi/extensions/haiku-compaction";
import { registryOf, resolveModel, runArm, type Model } from "./replay-haiku-compaction/models";
import { runMain } from "../node_modules/@avi2dg/checks/src/core/main.ts";
import {
  ArgsError,
  ModelError,
  ParseSkip,
  ReadError,
  isSessionEntry,
  parseItems,
  scoreSummaries,
  stripFileSections,
  type SessionEntry,
} from "./replay-haiku-compaction/scoring";
import { buildCase, caseKey, explicitFilter, selectCases, type ReplayCase } from "./replay-haiku-compaction/cases";
import { retentionOf } from "./replay-haiku-compaction/retention";
import {
  NO_TOKENS,
  RECORDED_REFERENCE,
  addTokens,
  assembleSummary,
  parseReplayArgs,
  splitModelRef,
  summarizeResults,
  writeReports,
  type ArmTokens,
  type CaseReport,
  type ReplayArgs,
  type ResultSummary,
} from "./replay-haiku-compaction/report";
import { rescoreReport } from "./replay-haiku-compaction/rescore";

const NAME = "replay-haiku-compaction";
function readSessionEntries(fs: FileSystem.FileSystem, file: string): Effect.Effect<SessionEntry[], ReadError> {
  return Effect.gen(function* () {
    const text = yield* fs.readFileString(file).pipe(
      Effect.mapError((cause) => new ReadError({ message: "cannot read " + file + ": " + String(cause) })),
    );
    const out: SessionEntry[] = [];
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (trimmed === "") continue;
      const parsed = yield* Effect.try({
        try: (): unknown => JSON.parse(trimmed),
        catch: () => new ParseSkip({ file }),
      }).pipe(Effect.catchTag("ParseSkip", () => Effect.succeed(undefined)));
      if (isSessionEntry(parsed)) out.push(parsed);
    }
    return out;
  });
}

function collectCases(fs: FileSystem.FileSystem, path: Path.Path, args: ReplayArgs): Effect.Effect<ReplayCase[], ReadError | ArgsError> {
  return Effect.gen(function* () {
    const wanted = args.cases ? explicitFilter(args.cases) : undefined;
    const tagged: { dir: string; file: string; value: ReplayCase }[] = [];
    for (const sessionsRoot of args.sessionsRoots) {
      const entries = yield* fs.readDirectory(sessionsRoot).pipe(
        Effect.mapError((cause) => new ReadError({ message: "cannot list " + sessionsRoot + ": " + String(cause) })),
      );
      for (const dirEntry of [...entries].sort()) {
        const found = yield* collectDir(fs, path, sessionsRoot, dirEntry, wanted, args.sessionModel);
        tagged.push(...found);
      }
    }
    if (tagged.length === 0) return yield* new ArgsError({ message: "no usable " + args.sessionModel + " compaction cases found" });
    if (wanted || args.all) return tagged.map((item) => item.value);
    const whole = selectCases(tagged.filter((item) => !item.value.split), Math.min(8, args.limit), 2);
    const splitBuckets = tagged
      .filter((item) => item.value.split)
      .map((item) => ({ dir: item.dir + " (split)", file: item.file, value: item.value }));
    return [...whole, ...selectCases(splitBuckets, args.limit - whole.length, 2)];
  });
}

function collectFile(
  lines: readonly SessionEntry[],
  dirEntry: string,
  fileEntry: string,
  allowed: Set<number> | undefined,
  sessionModel: string,
): { dir: string; file: string; value: ReplayCase }[] {
  const tagged: { dir: string; file: string; value: ReplayCase }[] = [];
  for (const [i, line] of lines.entries()) {
    if (line.type !== "compaction") continue;
    if (allowed && !allowed.has(i)) continue;
    const built = buildCase(fileEntry, dirEntry, lines, i, sessionModel);
    if (built) tagged.push({ dir: dirEntry, file: fileEntry, value: built });
  }
  return tagged;
}

function collectDir(
  fs: FileSystem.FileSystem,
  path: Path.Path,
  sessionsRoot: string,
  dirEntry: string,
  wanted: Map<string, Set<number>> | undefined,
  sessionModel: string,
): Effect.Effect<{ dir: string; file: string; value: ReplayCase }[], ReadError> {
  return Effect.gen(function* () {
    const dirPath = path.join(sessionsRoot, dirEntry);
    const info = yield* fs.stat(dirPath).pipe(
      Effect.mapError((cause) => new ReadError({ message: "cannot stat " + dirPath + ": " + String(cause) })),
    );
    if (info.type !== "Directory") return [];
    const files = yield* fs.readDirectory(dirPath).pipe(
      Effect.mapError((cause) => new ReadError({ message: "cannot list " + dirPath + ": " + String(cause) })),
    );
    const tagged: { dir: string; file: string; value: ReplayCase }[] = [];
    for (const fileEntry of [...files].sort()) {
      if (!fileEntry.endsWith(".jsonl")) continue;
      const allowed = wanted?.get(fileEntry);
      if (wanted && !allowed) continue;
      const lines = yield* readSessionEntries(fs, path.join(dirPath, fileEntry));
      tagged.push(...collectFile(lines, dirEntry, fileEntry, allowed, sessionModel));
    }
    return tagged;
  });
}

function messageText(message: { readonly content?: unknown }): string {
  const content = message.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (typeof part === "object" && part !== null && "text" in part) return String((part as { readonly text: unknown }).text);
        return "";
      })
      .join("\n");
  }
  return "";
}

export function userTextOf(messages: readonly { readonly role: string; readonly content?: unknown }[]): string {
  return messages.filter((message) => message.role === "user").map(messageText).join("\n");
}

function promptFor(c: ReplayCase, keepUrls: boolean): { historyPrompt: string | undefined; prefixPrompt: string | undefined } {
  const historyPrompt = c.history.length > 0 ? historyPromptOf(conversationOf(c.history), c.previousSummary, undefined, keepUrls) : undefined;
  const prefixPrompt = c.split && c.prefix.length > 0 ? turnPrefixPromptOf(conversationOf(c.prefix), keepUrls) : undefined;
  return { historyPrompt, prefixPrompt };
}

type SummaryArms = {
  readonly historyCandidate: string | undefined;
  readonly historyReference: string | undefined;
  readonly prefixCandidate: string;
  readonly prefixReference: string;
  readonly candidateCost: number;
  readonly referenceCost: number;
  readonly candidateTokens: ArmTokens;
};

function runSummaryArms(
  registry: ModelRegistry,
  candidate: Model,
  reference: Model | undefined,
  historyPrompt: string | undefined,
  prefixPrompt: string | undefined,
  maxOutputTokens: number,
): Effect.Effect<SummaryArms, ModelError> {
  return Effect.gen(function* () {
    let historyCandidate: string | undefined;
    let historyReference: string | undefined;
    let candidateCost = 0;
    let referenceCost = 0;
    let candidateTokens = NO_TOKENS;
    if (historyPrompt) {
      const historyDone = yield* runArm(registry, candidate, historyPrompt, maxOutputTokens);
      historyCandidate = historyDone.text;
      candidateCost += historyDone.cost;
      candidateTokens = addTokens(candidateTokens, historyDone.tokens);
      if (reference) {
        const historyRef = yield* runArm(registry, reference, historyPrompt, maxOutputTokens);
        historyReference = historyRef.text;
        referenceCost += historyRef.cost;
      }
    }
    let prefixCandidate = "";
    let prefixReference = "";
    if (prefixPrompt) {
      const prefixDone = yield* runArm(registry, candidate, prefixPrompt, maxOutputTokens);
      prefixCandidate = prefixDone.text;
      candidateCost += prefixDone.cost;
      candidateTokens = addTokens(candidateTokens, prefixDone.tokens);
      if (reference) {
        const prefixRef = yield* runArm(registry, reference, prefixPrompt, maxOutputTokens);
        prefixReference = prefixRef.text;
        referenceCost += prefixRef.cost;
      }
    }
    return { historyCandidate, historyReference, prefixCandidate, prefixReference, candidateCost, referenceCost, candidateTokens };
  });
}

function runCase(
  registry: ModelRegistry,
  candidate: Model,
  reference: Model | undefined,
  c: ReplayCase,
  maxOutputTokens: number,
  keepUrls: boolean,
): Effect.Effect<CaseReport, ModelError> {
  return Effect.gen(function* () {
    const { historyPrompt, prefixPrompt } = promptFor(c, keepUrls);
    const arms = yield* runSummaryArms(registry, candidate, reference, historyPrompt, prefixPrompt, maxOutputTokens);
    yield* Console.log(caseKey(c.dir, c.file, c.index) + " cost candidate=" + arms.candidateCost.toFixed(4) + " reference=" + arms.referenceCost.toFixed(4));
    const historyFallback = c.split && c.history.length === 0 ? (c.previousSummary ?? NO_PRIOR_HISTORY) : undefined;
    const sourceText = (historyPrompt ?? "") + "\n" + (prefixPrompt ?? "") + "\n" + (c.previousSummary ?? "");
    const captainText = userTextOf([...c.history, ...c.prefix]) + "\n" + (c.previousSummary ?? "");
    return caseReportOf(c, sourceText, captainText, {
      candidateText: assembleSummary(c.split, arms.historyCandidate ?? historyFallback, arms.prefixCandidate, c.readFiles, c.modifiedFiles),
      referenceText: reference
        ? assembleSummary(c.split, arms.historyReference ?? historyFallback, arms.prefixReference, c.readFiles, c.modifiedFiles)
        : c.recorded,
      candidateCost: arms.candidateCost,
      referenceCost: arms.referenceCost,
      candidateTokens: arms.candidateTokens,
    });
  });
}

type CaseOutcome = {
  readonly candidateText: string;
  readonly referenceText: string;
  readonly candidateCost: number;
  readonly referenceCost: number;
  readonly candidateTokens: ArmTokens;
};

function caseReportOf(c: ReplayCase, sourceText: string, captainText: string, outcome: CaseOutcome): CaseReport {
  return {
      file: c.file,
      dir: c.dir,
      index: c.index,
      split: c.split,
      tokensBefore: c.tokensBefore,
      rebuiltTokens: c.rebuiltTokens,
      skipped: c.skipped,
      historyMessages: c.history.length,
      prefixMessages: c.prefix.length,
      recordedModel: c.recordedModel,
      recordedItems: parseItems(c.recorded).length,
      recordedChars: stripFileSections(c.recorded).length,
      candidateChars: stripFileSections(outcome.candidateText).length,
      referenceChars: stripFileSections(outcome.referenceText).length,
      candidateCost: outcome.candidateCost,
      referenceCost: outcome.referenceCost,
      candidateTokens: outcome.candidateTokens,
      retention: retentionOf(c.recorded, outcome.candidateText, sourceText, captainText),
      candidate: scoreSummaries(c.recorded, outcome.candidateText),
      reference: scoreSummaries(c.recorded, outcome.referenceText),
      candidateText: outcome.candidateText,
      referenceText: outcome.referenceText,
      recordedText: c.recorded,
      sourceText,
      captainText,
      previousSummary: c.previousSummary,
    };
}

function estimatePromptChars(cases: readonly ReplayCase[], keepUrls: boolean): number {
  let promptChars = 0;
  for (const c of cases) {
    const { historyPrompt, prefixPrompt } = promptFor(c, keepUrls);
    promptChars += (historyPrompt ?? "").length + (prefixPrompt ?? "").length;
  }
  return promptChars;
}

function logDryRun(cases: readonly ReplayCase[]): Effect.Effect<boolean> {
  return Effect.gen(function* () {
    for (const c of cases) {
      const items = parseItems(c.recorded);
      const quotes = items.filter((item) => item.quote).length;
      const decisions = items.filter((item) => item.openDecision).length;
      yield* Console.log(caseKey(c.dir, c.file, c.index) + " split=" + String(c.split) + " items=" + String(items.length) + " quotes=" + String(quotes) + " decisions=" + String(decisions) + " rebuiltTokens=" + String(c.rebuiltTokens) + "/" + String(c.tokensBefore));
    }
    return true;
  });
}

type RunOutcome = {
  done: CaseReport[];
  failures: { case: string; arm: string; error: string }[];
};

function runAllCases(
  registry: ModelRegistry,
  candidate: Model,
  reference: Model | undefined,
  cases: readonly ReplayCase[],
  maxOutputTokens: number,
  keepUrls: boolean,
): Effect.Effect<RunOutcome, ModelError | ReadError | ArgsError> {
  return Effect.gen(function* () {
    const done: CaseReport[] = [];
    const failures: { case: string; arm: string; error: string }[] = [];
    for (const c of cases) {
      const key = caseKey(c.dir, c.file, c.index);
      const report = yield* runCase(registry, candidate, reference, c, maxOutputTokens, keepUrls).pipe(
        Effect.catch((cause) =>
          Effect.gen(function* () {
            failures.push({ case: key, arm: "case", error: cause.message });
            yield* Console.log(key + ": FAILED " + cause.message);
            return undefined;
          }),
        ),
      );
      if (report) {
        done.push(report);
        yield* Console.log(key + " candidate=" + report.candidate.overall.toFixed(3) + " reference=" + report.reference.overall.toFixed(3) + " items=" + String(report.candidate.total));
      }
    }
    return { done, failures };
  });
}

function logRetention(summary: ResultSummary): Effect.Effect<void> {
  return Effect.gen(function* () {
    for (const slot of summary.retention) {
      yield* Console.log(NAME + ": retention " + slot.class + " recorded " + String(slot.recorded) + "/" + String(slot.pooled) + " candidate " + String(slot.candidate) + "/" + String(slot.pooled));
    }
    const tokens = summary.candidateTokens;
    yield* Console.log(NAME + ": candidate tokens calls=" + String(tokens.calls) + " estimated in=" + String(tokens.estimatedInput) + " out=" + String(tokens.estimatedOutput) + " reported in=" + String(tokens.reportedInput) + " out=" + String(tokens.reportedOutput));
  });
}

const main = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const home = yield* Config.String("HOME").pipe(Config.withDefault(""));
  const args = yield* parseReplayArgs(process.argv.slice(2), home);
  if (args.rescore) return yield* rescoreReport(fs, path, args.rescore, args.out, NAME);
  const cases = yield* collectCases(fs, path, args);
  yield* Console.log(NAME + ": " + String(cases.length) + " usable " + args.sessionModel + " compaction case(s)");
  const [sessionProvider, sessionId] = splitModelRef(args.sessionModel);
  const keepUrls = isMuseSession({ provider: sessionProvider, id: sessionId });
  const promptChars = estimatePromptChars(cases, keepUrls);
  yield* Console.log(NAME + ": rebuilt prompt input ~" + String(Math.round(promptChars / 4)) + " tokens across " + String(cases.length) + " case(s)");
  if (args.dryRun) return yield* logDryRun(cases);
  const againstRecorded = args.reference === RECORDED_REFERENCE;
  const arms = againstRecorded ? 1 : 2;
  const totalInputTokens = Math.round(promptChars / 4) * arms;
  if (!args.yes) {
    return yield* new ArgsError({ message: "about " + String(totalInputTokens) + " input tokens across " + String(arms) + " arm(s); re-run with --yes to spend it" });
  }
  const registry = yield* registryOf(process.cwd());
  const candidate = yield* resolveModel(registry, args.candidate);
  const reference = againstRecorded ? undefined : yield* resolveModel(registry, args.reference);
  yield* Console.log(NAME + ": candidate " + args.candidate + ", reference " + args.reference);
  const { done, failures } = yield* runAllCases(registry, candidate, reference, cases, args.maxOutputTokens, keepUrls);
  const summary = summarizeResults(done, againstRecorded);
  return yield* finishLiveRun(fs, path, args, done, failures, summary);
}).pipe(Effect.scoped);

function finishLiveRun(
  fs: FileSystem.FileSystem,
  path: Path.Path,
  args: ReplayArgs,
  done: readonly CaseReport[],
  failures: { case: string; arm: string; error: string }[],
  summary: ResultSummary,
): Effect.Effect<boolean, ReadError | Config.ConfigError> {
  return Effect.gen(function* () {
    yield* logRetention(summary);
    yield* Console.log(NAME + ": spend candidate=" + summary.candidateCostTotal.toFixed(4) + " reference=" + summary.referenceCostTotal.toFixed(4));
    yield* Console.log(NAME + ": candidate overall " + summary.candidatePool.overall.toFixed(3) + " over " + String(summary.candidatePool.items) + " items; reference " + summary.referencePool.overall.toFixed(3));
    yield* Console.log(NAME + ": quotes candidate " + summary.candidatePool.quote.toFixed(3) + " reference " + summary.referencePool.quote.toFixed(3) + "; decisions candidate " + summary.candidatePool.decision.toFixed(3) + " reference " + summary.referencePool.decision.toFixed(3));
    yield* Console.log(NAME + ": verdict " + summary.verdict + " (" + String(done.length) + " ok, " + String(failures.length) + " failed)");
    const out = args.out ?? (yield* Config.String("TMPDIR").pipe(Config.withDefault("/tmp"))) + "/replay-haiku-compaction-" + String(Date.now());
    yield* writeReports(fs, path, out, args, done, failures, summary);
    yield* Console.log(NAME + ": wrote " + out);
    return true;
  });
}

if (import.meta.main) runMain(NAME, main);


