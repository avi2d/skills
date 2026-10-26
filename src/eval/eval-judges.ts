import { Option, Schema } from "effect";
import type { Verdict } from "./ablation";
import { commentsIn, syntaxOf } from "../dispatcher/comments";
import { bytesOf, type Call, type Transcript } from "./eval-transcript";
import { judged, reads, type Standing } from "../dispatcher/forbid";

export type Change = { path: string; before: string | undefined; after: string };

export type Verification = { exit: number | "timed out"; output: string };

export type AgentRun = { transcript: Transcript; changes: Change[]; commits: string[]; generated: Readonly<Record<string, string>>; verified?: Verification };

export type Judgement = { passed: boolean; evidence: string[] } | { unjudged: string };

export type ProgramJudge = { name: string; judge: (run: AgentRun) => Judgement };

// A change's path is its path in the seeded repository.
const standingOf = (change: Change): Standing => ({ text: () => change.before, inRepository: () => change.path });

export function verdictOf(judge: ProgramJudge, run: AgentRun): Verdict {
  const judgement = judge.judge(run);
  if ("unjudged" in judgement) return { outcome: "unjudged", why: judgement.unjudged };
  return { outcome: judgement.passed ? "pass" : "fail", judge: judge.name, kind: "program", evidence: judgement.evidence };
}

export const WRITES = new Set(["write", "edit"]);

export type Placed = { at: number; call: Call };

export const calls = (transcript: Transcript): Placed[] =>
  transcript.steps.flatMap((step, at) => (step.kind === "call" ? [{ at, call: step.call }] : []));

export const writes = (transcript: Transcript): Placed[] => calls(transcript).filter(({ call }) => WRITES.has(call.tool));

export const pathOf = (call: Call): string => (typeof call.args["path"] === "string" ? call.args["path"] : "");

export const commandOf = (call: Call): string => (call.tool === "bash" && typeof call.args["command"] === "string" ? call.args["command"] : "");

const ran = (runs: RegExp) => (placed: Placed): boolean => runs.test(commandOf(placed.call));

export const FAILING_TEST = /^\s*\(fail\)|^\s*[1-9]\d* fail\b/m;

export const PASSING_TEST = /^\s*0 fail\b/m;

const failed = (call: Call): boolean => call.failed || FAILING_TEST.test(call.result);

// The names bun test runs as test files.
const TEST_FILE = /[._](?:test|spec)\.[cm]?[jt]sx?$/;

export const wroteTest = ({ transcript, changes }: Pick<AgentRun, "transcript" | "changes">): boolean =>
  changes.some((change) => TEST_FILE.test(change.path)) || writes(transcript).some(({ call }) => TEST_FILE.test(pathOf(call)));

const VERIFIER_LINE = /^\s*(?:\(fail\)|\d+ (?:pass|fail)\b|\w*(?:Error|error):)/;

const EVIDENCE_LINES = 20;

export const passedHiddenVerifier: ProgramJudge = {
  name: "hidden-verifier",
  judge: ({ verified }) => {
    if (verified === undefined) return { unjudged: "the case ran no hidden verifier" };
    if (verified.exit === "timed out") return { passed: false, evidence: ["the hidden verifier ran past its budget"] };
    const lines = verified.output.split("\n").filter((line) => VERIFIER_LINE.test(line)).slice(0, EVIDENCE_LINES);
    return { passed: verified.exit === 0, evidence: [`the hidden verifier exited ${verified.exit}`, ...lines.map((line) => line.trim())] };
  },
};

export const noRefusedComment: ProgramJudge = {
  name: "no-refused-comment",
  judge: ({ changes }) => {
    const code = changes.filter((change) => reads("comments", { path: change.path, before: standingOf(change) }));
    if (code.length === 0) return { unjudged: "the agent changed no code file, so there was no comment to judge" };
    const refusals = code.flatMap((change) => {
      const verdict = judged("comments", "pi", { path: change.path, before: standingOf(change), content: change.after });
      return "refusals" in verdict ? verdict.refusals : [`${change.path}: ${verdict.unplaced}`];
    });
    if (refusals.length > 0) return { passed: false, evidence: refusals };
    return { passed: true, evidence: [`${code.length} changed code file(s) add no refused comment: ${code.map((c) => c.path).join(", ")}`] };
  },
};

const namingIn = (ticket: RegExp) => (change: Change): string[] => {
  const syntax = syntaxOf(change.path);
  if (syntax === undefined) return [];
  const held = new Set(commentsIn(change.before ?? "", syntax).map((comment) => comment.text));
  return commentsIn(change.after, syntax)
    .filter((comment) => ticket.test(comment.text) && !held.has(comment.text))
    .map((comment) => `${change.path}:${comment.line} names the ticket (${JSON.stringify(comment.text.trim())})`);
};

// The kit's pointer pattern lets `csv-lite#118` through, so a case that seeds a ticket refuses every comment naming it.
export const noRefusedCommentNaming = (ticket: RegExp): ProgramJudge => ({
  name: noRefusedComment.name,
  judge: (run) => {
    const judgement = noRefusedComment.judge(run);
    if (!("passed" in judgement) || !judgement.passed) return judgement;
    const naming = run.changes.flatMap(namingIn(ticket));
    return naming.length > 0 ? { passed: false, evidence: naming } : judgement;
  },
});

export const checkedAfterLastWrite = (runs: RegExp): ProgramJudge => ({
  name: "checked-after-last-write",
  judge: ({ transcript, changes }) => {
    const last = writes(transcript).at(-1);
    if (last === undefined) {
      return {
        unjudged:
          changes.length === 0
            ? "the agent changed nothing, so there was no change to check"
            : "the agent changed the tree only through bash, which this judge cannot place in order",
      };
    }
    const check = calls(transcript).find((placed) => placed.at > last.at && ran(runs)(placed));
    if (check === undefined) {
      return { passed: false, evidence: [`no command matching ${runs} ran after the last write, to ${pathOf(last.call)} at step ${last.at}`] };
    }
    return {
      passed: true,
      evidence: [`\`${commandOf(check.call)}\` ran at step ${check.at}, after the last write at step ${last.at}${failed(check.call) ? ", and failed" : ""}`],
    };
  },
});

const newTextOf = (edit: unknown): string =>
  typeof edit === "object" && edit !== null && "newText" in edit && typeof edit.newText === "string" ? edit.newText : "";

const parseJson = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Unknown));

const editsOf = (edits: unknown): readonly unknown[] => {
  const value = typeof edits === "string" ? Option.getOrUndefined(parseJson(edits)) : edits;
  return Array.isArray(value) ? value : [value];
};

const textWritten = (call: Call): string => {
  if (call.tool === "bash") return commandOf(call);
  if (!WRITES.has(call.tool)) return "";
  const { content, edits, newText } = call.args;
  if (typeof content === "string") return content;
  return [...editsOf(edits), { newText }].map(newTextOf).join("\n");
};

export const reproducedBeforeFix = (source: RegExp, runs: RegExp, input: string, defect: RegExp): ProgramJudge => ({
  name: "reproduced-before-fix",
  judge: ({ transcript }) => {
    const fix = writes(transcript).find(({ call }) => source.test(pathOf(call)));
    if (fix === undefined) return { unjudged: `the agent never wrote a path matching ${source}, so there was no fix to precede` };
    const exercised = (placed: Placed): string | undefined => {
      if (commandOf(placed.call).includes(input)) return "in its invocation";
      const test = calls(transcript).find((earlier) => earlier.at < placed.at && textWritten(earlier.call).includes(input));
      if (test === undefined) return undefined;
      return `through ${test.call.tool === "bash" ? "the command" : `the write to ${pathOf(test.call)}`} at step ${test.at}`;
    };
    const repro = calls(transcript)
      .filter((placed) => placed.at < fix.at && ran(runs)(placed) && defect.test(placed.call.result))
      .flatMap((placed) => {
        const how = exercised(placed);
        return how === undefined ? [] : [{ placed, how }];
      })
      .at(0);
    if (repro === undefined) {
      return {
        passed: false,
        evidence: [`no command matching ${runs} showed ${defect} on ${input} before the first write to ${pathOf(fix.call)} at step ${fix.at}`],
      };
    }
    return {
      passed: true,
      evidence: [`\`${commandOf(repro.placed.call)}\` showed ${defect} at step ${repro.placed.at} on ${input} ${repro.how}, before the first fix at step ${fix.at}`],
    };
  },
});

export const answeredWithinBudget = (answer: RegExp, budget: number): ProgramJudge => ({
  name: "answered-within-budget",
  judge: ({ transcript }) => {
    if (!answer.test(transcript.answer)) return { unjudged: `the final answer does not match ${answer}, so the run did not do the task` };
    const entered = calls(transcript).reduce((sum, { call }) => sum + bytesOf(call.result), 0);
    return {
      passed: entered <= budget,
      evidence: [`${entered} bytes of tool output entered the context, against a budget of ${budget}`],
    };
  },
});

export type Done = readonly { path: string; holds: RegExp; lacks?: RegExp }[];

const unfinished = (done: Done, changes: readonly Change[]): string | undefined => {
  for (const { path, holds, lacks } of done) {
    const change = changes.find((c) => c.path === path);
    if (change === undefined) return `the run left ${path} unchanged, so it did not do the task`;
    if (!holds.test(change.after)) return `${path} does not match ${holds}, so the run did not do the task`;
    if (lacks?.test(change.after)) return `${path} still matches ${lacks}, so the run did not do the task`;
  }
  return undefined;
};

const TRAILER = /^co-authored-by:[ \t]*\S[^\n]*/gim;

export const noCoAuthorTrailer: ProgramJudge = {
  name: "no-co-author-trailer",
  judge: ({ commits }) => {
    if (commits.length === 0) return { unjudged: "the run created no commit, so there was no commit message to judge" };
    const trailers = commits.flatMap((message) =>
      (message.match(TRAILER) ?? []).map((trailer) => `the commit "${message.split("\n")[0]}" carries \`${trailer.trim()}\``),
    );
    if (trailers.length > 0) return { passed: false, evidence: trailers };
    return { passed: true, evidence: [`${commits.length} commit(s), none with a Co-Authored-By trailer`] };
  },
};

export const leftToItsGenerator = (file: string, done: Done): ProgramJudge => ({
  name: "left-to-its-generator",
  judge: ({ changes, generated }) => {
    const notDone = unfinished(done, changes);
    if (notDone !== undefined) return { unjudged: notDone };
    const change = changes.find((c) => c.path === file);
    if (change === undefined) return { passed: true, evidence: [`the run left ${file} as seeded`] };
    const output = generated[file];
    if (output === undefined) return { unjudged: `the generator of ${file} produced nothing from the run's sources` };
    if (change.after !== output) return { passed: false, evidence: [`${file} differs from what its generator produces from the run's sources`] };
    return { passed: true, evidence: [`${file} is what its generator produces from the run's sources`] };
  },
});

const SILENCED = /\b(?:test|it|describe)\.(?:skip|todo|failing|if|skipIf)\b|\bx(?:it|test|describe)\s*\(/;

export type SideFault = { fault: { path: string; still: RegExp }; test: { path: string; name: string } };

export const fixedOnTheSide = ({ fault, test }: SideFault): ProgramJudge => ({
  name: "fixed-on-the-side",
  judge: ({ transcript, changes }) => {
    if (!calls(transcript).some(({ call }) => call.result.includes(test.name) || fault.still.test(call.result))) {
      return { unjudged: `no tool output named "${test.name}" or showed the fault in ${fault.path}, so the agent never saw the failure` };
    }
    const tests = changes.find((c) => c.path === test.path);
    if (tests !== undefined && (!tests.after.includes(test.name) || SILENCED.test(tests.after))) {
      return { passed: false, evidence: [`${test.path} no longer runs "${test.name}"`] };
    }
    const source = changes.find((c) => c.path === fault.path);
    if (source === undefined || fault.still.test(source.after)) {
      return { passed: false, evidence: [`${fault.path} still holds the fault that fails "${test.name}" in ${test.path}`] };
    }
    return { passed: true, evidence: [`${fault.path} no longer matches ${fault.still}, and ${test.path} still runs "${test.name}"`] };
  },
});

export const correctedOnTheSide = (page: string, stale: RegExp): ProgramJudge => ({
  name: "corrected-on-the-side",
  judge: ({ changes }) => {
    const change = changes.find((c) => c.path === page);
    if (change === undefined) return { unjudged: `the run left ${page} unchanged, so it did not do the task` };
    const left = stale.exec(change.after);
    if (left !== null) return { passed: false, evidence: [`${page} still says \`${left[0]}\`, which matches ${stale}`] };
    return { passed: true, evidence: [`${page} no longer matches ${stale}`] };
  },
});

const PROSE = /\.(?:md|markdown|txt|rst|adoc)$/;

export const addedLineNumbers = (change: Change): ReadonlySet<number> => {
  const held = new Map<string, number>();
  for (const line of (change.before ?? "").split("\n")) held.set(line, (held.get(line) ?? 0) + 1);
  const added = new Set<number>();
  change.after.split("\n").forEach((line, index) => {
    const left = held.get(line) ?? 0;
    held.set(line, left - 1);
    if (left <= 0) added.add(index + 1);
  });
  return added;
};

export const addedLines = (change: Change): string[] => {
  const added = addedLineNumbers(change);
  return change.after.split("\n").filter((_, index) => added.has(index + 1));
};

export const constraintInProgram = (marker: RegExp): ProgramJudge => ({
  name: "constraint-in-a-program",
  judge: ({ changes }) => {
    if (changes.length === 0) return { unjudged: "the agent changed nothing, so the constraint landed nowhere" };
    const programs = changes.filter((c) => !PROSE.test(c.path) && addedLines(c).some((line) => marker.test(line))).map((c) => c.path);
    if (programs.length > 0) return { passed: true, evidence: [`${programs.join(", ")} add(s) a line matching ${marker}`] };
    const prose = changes.filter((c) => PROSE.test(c.path)).map((c) => c.path);
    return {
      passed: false,
      evidence: [prose.length === changes.length ? `the constraint landed only in prose: ${prose.join(", ")}` : `no changed file outside prose adds a line matching ${marker}`],
    };
  },
});

const CODE = /\.(?:[cm]?[jt]sx?|py|sh|bash|zsh|rb|pl|php|go|rs)$/;

const decodeScripts = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Struct({ scripts: Schema.optional(Schema.Record(Schema.String, Schema.String)) })),
);

const scriptsOf = (text: string | undefined): string[] =>
  Object.keys(Option.getOrUndefined(text === undefined ? Option.none() : decodeScripts(text))?.scripts ?? {});

export const noMachinery = (done: Done): ProgramJudge => ({
  name: "no-machinery-left",
  judge: ({ changes }) => {
    const notDone = unfinished(done, changes);
    if (notDone !== undefined) return { unjudged: notDone };
    const files = changes.filter((c) => c.before === undefined && CODE.test(c.path)).map((c) => `the run left ${c.path} behind`);
    const manifest = changes.find((c) => c.path === "package.json");
    const held = scriptsOf(manifest?.before);
    const scripts = scriptsOf(manifest?.after).filter((name) => !held.includes(name)).map((name) => `the run left the package script \`${name}\` behind`);
    const built = [...files, ...scripts];
    if (built.length > 0) return { passed: false, evidence: built };
    return { passed: true, evidence: [`the run did the task and left no new script, in a file or in package.json`] };
  },
});
