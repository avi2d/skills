import {
  FAILING_TEST,
  PASSING_TEST,
  WRITES,
  calls,
  commandOf,
  pathOf,
  writes,
  type Judgement,
  type Placed,
  type ProgramJudge,
} from "./eval-judges";
import type { Call } from "./eval-transcript";

const HEADER = /^(\S+\.[cm]?[jt]sx?):\s*$/;

const SUMMARY = /^Ran \d+ tests? across\b/;

const FAIL_LINE = /^\s*\(fail\)/;

const PASS_LINE = /^\s*\(pass\)/;

const RESULT_LINE = /^\s*\((?:pass|fail)\)|^\s*\d+ (?:pass|fail)\b/;

type FileBlock = { file: string; failed: boolean; passed: boolean };

type SuiteRun = { blocks: FileBlock[]; passed: boolean; unattributed: boolean; text: string };

const suiteRunsIn = (output: string): SuiteRun[] => {
  const runs: SuiteRun[] = [];
  let blocks: FileBlock[] = [];
  let text: string[] = [];
  let unattributed = false;
  const close = (): void => {
    const all = text.join("\n");
    if (blocks.length > 0 || unattributed) runs.push({ blocks, passed: PASSING_TEST.test(all) && !FAILING_TEST.test(all), unattributed, text: all });
    blocks = [];
    text = [];
    unattributed = false;
  };
  for (const line of output.split("\n")) {
    text.push(line);
    const file = HEADER.exec(line)?.[1];
    const block = blocks.at(-1);
    if (file !== undefined) blocks.push({ file, failed: false, passed: false });
    else if (block === undefined) unattributed ||= RESULT_LINE.test(line);
    else if (FAIL_LINE.test(line)) block.failed = true;
    else if (PASS_LINE.test(line)) block.passed = true;
    if (SUMMARY.test(line)) close();
  }
  close();
  return runs;
};

const sameFile = (path: string, header: string): boolean => path === header || path.endsWith(`/${header.replace(/^\.\//, "")}`);

const TEST_TOKEN = /[\w./-]+\.test\.[cm]?[jt]sx?/g;

const sameTestFile = (a: string, b: string): boolean => a === b || a.endsWith(`/${b}`) || b.endsWith(`/${a}`);

const testsIn = (checks: readonly string[], text: string): string[] => {
  const tokens = new Set(text.match(TEST_TOKEN) ?? []);
  return checks.filter((path) => [...tokens].some((token) => sameTestFile(path, token.replace(/^\.\//, ""))));
};

// A failure piped through tail loses the check's header but keeps its location in a stack frame.
const blamedInCut = (checks: readonly string[], text: string): string | undefined => {
  const located = text
    .split("\n")
    .filter((line) => /:\d+/.test(line))
    .join("\n");
  return testsIn(checks, located)[0];
};

const wordsOf = (command: string): string[][] =>
  command.split(/[;&|\n()]+/).map((segment) => segment.replace(/\d*[<>]+\s*\S*/g, "").replace(/["']/g, "").trim().split(/\s+/));

const testRunsIn = (command: string): string[][] =>
  wordsOf(command).flatMap((words) => {
    const at = words.findIndex((word, i) => word === "bun" && words[i + 1] === "test");
    return at === -1 ? [] : [words.slice(at + 2)];
  });

const NAME_FILTER = /^(?:-t|--test-name-pattern)(?:=|$)/;

const targetOf = (checks: readonly string[], args: readonly string[]): "check" | "suite" | "elsewhere" => {
  if (args.some((arg) => NAME_FILTER.test(arg))) return "elsewhere";
  if (testsIn(checks, args.join(" ")).length > 0) return "check";
  return args.every((arg) => arg.startsWith("-")) ? "suite" : "elsewhere";
};

// A deletion marker names a file the run no longer has.
const listsCheck = (checks: readonly string[], text: string): boolean =>
  testsIn(
    checks,
    text
      .split("\n")
      .filter((line) => !/^\s*(D\b|deleted:)/i.test(line))
      .join("\n"),
  ).length > 0;

// Which of a command's test runs printed a cut output cannot be told, so every one of them must run the check.
const ranTheCheck = (checks: readonly string[], text: string, command: string): boolean => {
  const targets = testRunsIn(command).map((args) => targetOf(checks, args));
  return targets.length > 0 && targets.every((target) => target === "check" || (target === "suite" && listsCheck(checks, text)));
};

const REMOVES = new Set(["rm", "mv", "unlink"]);

const covers = (target: string, check: string): boolean => {
  const glob = /[*?[{]/.exec(target);
  const stem = target.slice(0, glob?.index).replace(/^\.\//, "");
  if (glob !== null) return `/${check}`.includes(`/${stem}`);
  const dir = stem.replace(/\/+$/, "");
  return sameTestFile(check, dir) || `/${check}`.includes(`/${dir}/`);
};

const removesCheck = (checks: readonly string[], command: string): boolean =>
  wordsOf(command).some((words) => {
    const at = words.findIndex((word) => REMOVES.has(word));
    const targets = at === -1 ? [] : words.slice(at + 1).filter((word) => !word.startsWith("-"));
    return targets.some((target) => checks.some((check) => covers(target, check)));
  });

export type Planted = { check: RegExp };

type Red = { at: number; call: Call; file: string };

type Watch = { checks: readonly string[]; firstAt: number; red?: Red; lastRed?: Red; unseen?: Placed };

const passedAfter = (red: Red, { at, call }: Placed): Judgement => {
  const sawRed = `\`${commandOf(red.call)}\` failed under ${red.file} at step ${red.at}`;
  const green = at === red.at ? "the tests passed later in the same command" : `\`${commandOf(call)}\` passed at step ${at}`;
  return { passed: true, evidence: [`${sawRed}, and ${green}`] };
};

const cutAfterRed = (watch: Watch, run: SuiteRun, placed: Placed): Judgement | undefined => {
  const { at, call } = placed;
  const command = commandOf(call);
  const blamed = blamedInCut(watch.checks, run.text);
  if (blamed !== undefined && !run.passed) {
    const red = { at, call, file: blamed };
    watch.red ??= red;
    watch.lastRed = watch.red;
    return undefined;
  }
  const { red } = watch;
  if (red !== undefined && run.passed && !removesCheck(watch.checks, command) && ranTheCheck(watch.checks, run.text, command)) return passedAfter(red, placed);
  if (at > watch.firstAt) watch.unseen ??= placed;
  return undefined;
};

function greenAfterRed(watch: Watch, run: SuiteRun, placed: Placed): Judgement | undefined {
  const own = run.blocks.filter((block) => watch.checks.some((path) => sameFile(path, block.file)));
  if (own.length === 0 && run.unattributed) return cutAfterRed(watch, run, placed);
  const failing = own.find((block) => block.failed);
  if (failing !== undefined) {
    const { at, call } = placed;
    watch.red ??= { at, call, file: failing.file };
    watch.lastRed = watch.red;
    return undefined;
  }
  const { red } = watch;
  if (red === undefined || !own.some((block) => block.passed) || !run.passed) return undefined;
  if (removesCheck(watch.checks, commandOf(placed.call))) return undefined;
  return passedAfter(red, placed);
}

function neverGreen({ checks, lastRed, unseen }: Watch): Judgement {
  if (unseen !== undefined) {
    return { unjudged: `the output of \`${commandOf(unseen.call)}\` at step ${unseen.at} shows test results without the check's own header, so whether the check went red or green there cannot be seen` };
  }
  if (lastRed === undefined) return { passed: false, evidence: [`no test run failed under the check it wrote (${checks.join(", ")})`] };
  return { passed: false, evidence: [`\`${commandOf(lastRed.call)}\` failed under ${lastRed.file} at step ${lastRed.at}, and that check never passed after it without being rewritten`] };
}

// A red run stops counting once the check that went red is rewritten, since the check that failed is not the one delivered.
export const seenFailing = ({ check }: Planted): ProgramJudge => ({
  name: "seen-failing",
  judge: ({ transcript }) => {
    const written = writes(transcript).filter(({ call }) => check.test(pathOf(call)));
    const first = written[0];
    if (first === undefined) return { unjudged: `the agent never wrote a check matching ${check} through the write tools` };
    const watch: Watch = { checks: written.map(({ call }) => pathOf(call)), firstAt: first.at };
    for (const placed of calls(transcript)) {
      const { call } = placed;
      if (watch.red !== undefined && WRITES.has(call.tool) && sameFile(pathOf(call), watch.red.file)) delete watch.red;
      // Only a command runs tests. A saved log read back shows headers without running anything.
      if (call.tool !== "bash") continue;
      for (const run of suiteRunsIn(call.result)) {
        const green = greenAfterRed(watch, run, placed);
        if (green !== undefined) return green;
      }
    }
    return neverGreen(watch);
  },
});
