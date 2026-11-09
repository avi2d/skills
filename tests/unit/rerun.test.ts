import { expect, test } from "bun:test";
import { type Action, type Event, type Index } from "../../src/dispatcher/dispatch";
import type { Change } from "../../src/dispatcher/forbid";
import { RERUN_REFUSAL, bashLooksMutating, outputGoesToFile, stripped } from "../../src/dispatcher/rerun";
import { ruled, run } from "../lib/dispatch";

const index = ruled([]);

const call = (command: string, tool = "bash"): Event => ({ type: "tool-call", tool, input: { command } });
const result = (command: string, seconds: number): Event => ({ type: "tool-result", tool: "bash", command, seconds });
const failed = (command: string, seconds: number): Event => ({ type: "tool-result", tool: "bash", command, seconds, failed: true });

const forbidding: Index = {
  harness: "pi",
  rules: [{ name: "comment-discipline", triggers: [{ predicate: "always" }], text: "# Comments\n", forbid: "comments" }],
  profiles: [],
  hub: [],
};

const changeOf = (content: string): Change => ({
  path: "src/a.ts",
  before: { onDisk: "src/a.ts", text: () => "", inRepository: () => "src/a.ts" },
  content,
});

const refusedWrite: Event = {
  type: "tool-call",
  tool: "write",
  input: {},
  writes: ["src/a.ts"],
  changes: [changeOf("const a = 1;\n// @ts-expect-error x\n")],
};
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

test("a first save of unsaved output passes once, and the next save to another file is refused", () => {
  const asked = [...slowSince(400), call(`${SLOW} > /tmp/first.log`)];
  expect(after(asked).refused).toEqual([]);
  const saved = [...asked, result(`${SLOW} > /tmp/first.log`, 70)];
  expect(after([...saved, call(`${SLOW} > /tmp/second.log`)]).refused).toEqual([RERUN_REFUSAL]);
  expect(after([...saved, call(`${SLOW} > /tmp/third.log`)]).refused).toEqual([RERUN_REFUSAL]);
});

test("an identical rerun settles a flake, and a rerun after an edit passes", () => {
  expect(after([...slowSince(400), call(SLOW)]).refused).toEqual([]);
  expect(after([...slowSince(400), wrote("src/a.ts"), call(`${SLOW} 2>&1 | tail -5`)]).refused).toEqual([]);
});

test("a fast run keeps no command, so its filter-rerun passes", () => {
  expect(after([...slowSince(12), call(`${SLOW} 2>&1 | tail -5`)]).refused).toEqual([]);
});

test("a read-only bash result keeps the slow command, and a confirmed file-mutating one clears it", () => {
  expect(after([...slowSince(400), result("ls", 2), call(`${SLOW} 2>&1 | tail -5`)]).refused).toEqual([RERUN_REFUSAL]);
  expect(after([...slowSince(400), result("git config user.name", 1), call(`${SLOW} 2>&1 | tail -5`)]).refused).toEqual([RERUN_REFUSAL]);
  expect(after([...slowSince(400), result("git stash list", 1), call(`${SLOW} 2>&1 | tail -5`)]).refused).toEqual([RERUN_REFUSAL]);
  expect(after([...slowSince(400), result("mkdir -p /tmp/x", 2), call(`${SLOW} 2>&1 | tail -5`)]).refused).toEqual([]);
  expect(after([...slowSince(400), result("echo done > status.txt", 2), call(`${SLOW} 2>&1 | tail -5`)]).refused).toEqual([]);
  expect(after([...slowSince(400), result('git commit -m "rerun the suite"', 4), call(`${SLOW} 2>&1 | tail -5`)]).refused).toEqual([]);
});

test("a refused write and a failed bash result keep the slow command, so the next filtered rerun is still refused", () => {
  const denied = run(forbidding, [...slowSince(400), refusedWrite, call(`${SLOW} 2>&1 | tail -5`)]);
  expect(denied.actions.some((action) => action.type === "refuse")).toBe(true);
  expect(denied.actions.flatMap((action) => (action.type === "rerun-refused" ? [action.text] : []))).toEqual([RERUN_REFUSAL]);
  const broken = run(ruled([]), [...slowSince(400), failed("mkdir -p /tmp/x", 2), call(`${SLOW} 2>&1 | tail -5`)]);
  expect(broken.actions.flatMap((action) => (action.type === "rerun-refused" ? [action.text] : []))).toEqual([RERUN_REFUSAL]);
});

test("a rerun to /dev/null is refused, and a hook-cased Bash call is refused too", () => {
  expect(after([...slowSince(400), call(`${SLOW} > /dev/null 2>&1`)]).refused).toEqual([RERUN_REFUSAL]);
  expect(after([...slowSince(400), call(`${SLOW} 2>&1 | tail -5`, "Bash")]).refused).toEqual([RERUN_REFUSAL]);
});

test("stripping keeps chained commands and inputs apart, so an unrelated chain or a different input never shares a guard", () => {
  expect(stripped(`${SLOW} 2>&1 | tail -3`)).toBe(SLOW);
  expect(stripped(`${SLOW} > /tmp/eval.log 2>&1`)).toBe(SLOW);
  expect(stripped(`EVAL_CONCURRENCY=3 ${SLOW}`)).toBe(`EVAL_CONCURRENCY=3 ${SLOW}`);
  expect(stripped("cd /repo && bun test tests/a.test.ts")).toBe("cd /repo && bun test tests/a.test.ts");
  expect(stripped("cd /repo && bun test tests/a.test.ts")).not.toBe(stripped("cd /repo && git status"));
  expect(stripped("bun run eval < first.json")).not.toBe(stripped("bun run eval < second.json"));
  expect(stripped('echo "a b"')).not.toBe(stripped("echo a b"));
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
  for (const command of ["git config user.name", "git config --list", "git stash list", "git stash show"]) {
    expect(bashLooksMutating(command), command).toBe(false);
  }
  for (const command of ["touch x", "git commit -m y", "git -c user.name=x commit", "git config user.name x", "git stash push -m x", "git stash", "bun install", "sed -i s/a/b/ x", "echo x > y"]) {
    expect(bashLooksMutating(command), command).toBe(true);
  }
});
