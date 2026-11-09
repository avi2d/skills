import { expect, test } from "bun:test";
import { type Action, type Event } from "../../src/dispatcher/dispatch";
import { RERUN_REFUSAL, bashLooksMutating, outputGoesToFile, stripped } from "../../src/dispatcher/rerun";
import { ruled, run } from "../lib/dispatch";

const index = ruled([]);

const call = (command: string, tool = "bash"): Event => ({ type: "tool-call", tool, input: { command } });
const result = (command: string, seconds: number): Event => ({ type: "tool-result", tool: "bash", command, seconds });
const wrote = (path: string): Event => ({ type: "tool-call", tool: "write", input: { path, content: "x" }, writes: [path] });

const after = (events: readonly Event[]): { actions: Action[]; refused: string[] } => {
  const done = run(index, events);
  return { actions: done.actions, refused: done.actions.flatMap((action) => (action.type === "rerun-refused" ? [action.text] : [])) };
};

const SLOW = "bun run eval";
const slowSince = (seconds: number): Event[] => [call(SLOW), result(SLOW, seconds)];

test("a rerun that changes only its output filter is refused, and the rerun sent to a log is allowed", () => {
  expect(after([...slowSince(400), call(`${SLOW} 2>&1 | tail -20`)])).toEqual({
    actions: [{ type: "rerun-refused", why: expect.any(String), text: RERUN_REFUSAL }],
    refused: [RERUN_REFUSAL],
  });
  expect(after([...slowSince(400), call(`${SLOW} 2>&1 | grep -i fail`)]).refused).toEqual([RERUN_REFUSAL]);
  expect(after([...slowSince(400), call(`${SLOW} > /tmp/eval.log 2>&1`)]).refused).toEqual([]);
});

test("an identical rerun settles a flake, and a rerun after an edit passes", () => {
  expect(after([...slowSince(400), call(SLOW)]).refused).toEqual([]);
  expect(after([...slowSince(400), wrote("src/a.ts"), call(`${SLOW} 2>&1 | tail -5`)]).refused).toEqual([]);
});

test("a fast run keeps no command, so its filter-rerun passes", () => {
  expect(after([...slowSince(12), call(`${SLOW} 2>&1 | tail -5`)]).refused).toEqual([]);
});

test("a read-only bash call between keeps the slow command, and a file-mutating one clears it", () => {
  expect(after([...slowSince(400), call("ls"), call(`${SLOW} 2>&1 | tail -5`)]).refused).toEqual([RERUN_REFUSAL]);
  expect(after([...slowSince(400), call("mkdir -p /tmp/x"), call(`${SLOW} 2>&1 | tail -5`)]).refused).toEqual([]);
  expect(after([...slowSince(400), call("echo done > status.txt"), call(`${SLOW} 2>&1 | tail -5`)]).refused).toEqual([]);
  expect(after([...slowSince(400), call('git commit -m "rerun the suite"'), call(`${SLOW} 2>&1 | tail -5`)]).refused).toEqual([]);
});

test("a rerun to /dev/null is refused, and a hook-cased Bash call is refused too", () => {
  expect(after([...slowSince(400), call(`${SLOW} > /dev/null 2>&1`)]).refused).toEqual([RERUN_REFUSAL]);
  expect(after([...slowSince(400), call(`${SLOW} 2>&1 | tail -5`, "Bash")]).refused).toEqual([RERUN_REFUSAL]);
});

test("stripping keeps the command and drops its trailing filters and redirection", () => {
  expect(stripped(`${SLOW} 2>&1 | tail -3`)).toBe(SLOW);
  expect(stripped(`${SLOW} > /tmp/eval.log 2>&1`)).toBe(SLOW);
  expect(stripped(`EVAL_CONCURRENCY=3 ${SLOW}`)).toBe(`EVAL_CONCURRENCY=3 ${SLOW}`);
});

test("only an output sent to a real file counts as saved", () => {
  expect(outputGoesToFile(`${SLOW} > /tmp/eval.log 2>&1`)).toBe(true);
  expect(outputGoesToFile(`${SLOW} 2>&1 | tee /tmp/eval.log | tail -3`)).toBe(true);
  expect(outputGoesToFile(`${SLOW} 2>&1 | tail -3`)).toBe(false);
  expect(outputGoesToFile(`${SLOW} > /dev/null 2>&1`)).toBe(false);
  expect(outputGoesToFile('echo "a > b"')).toBe(false);
});

test("a bash call that writes nothing is not a change", () => {
  for (const command of ["ls", "git status", "git diff", `${SLOW} 2>&1 | tail -3`]) {
    expect(bashLooksMutating(command), command).toBe(false);
  }
  for (const command of ["touch x", "git commit -m y", "git -c user.name=x commit", "bun install", "sed -i s/a/b/ x", "echo x > y"]) {
    expect(bashLooksMutating(command), command).toBe(true);
  }
});
