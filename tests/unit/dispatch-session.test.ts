import { describe, expect, test } from "bun:test";
import { dispatch, type Event, type Index, type IndexedProfile } from "../../src/dispatcher/dispatch";
import { START } from "../../src/dispatcher/run-state";
import { logLine } from "../../src/dispatcher/dispatch-log";
import type { Outcome } from "../../src/dispatcher/verdict";
import {
  always,
  carried,
  compaction,
  delivered,
  end,
  onPush,
  onWrite,
  prompt,
  promptAt,
  promptIn,
  projectOf,
  QUALITY,
  ran,
  ruled,
  start,
  subject,
  typescript,
  wrote,
  injected,
  kept,
  nth,
  roundTripped,
  run,
} from "../lib/dispatch";

describe("a session that ends", () => {
  const index = ruled([["typescript-best-practices", typescript]]);

  test("it says which Rules were still due, rather than going quiet after the queue", () => {
    const { actions } = run(index, [promptIn("src/a.ts"), compaction, end]);
    expect(actions.map((a) => a.type)).toEqual(["inject", "queue", "dropped"]);
    expect(logLine(nth(actions, 2))).toBe(
      "dropped typescript-best-practices: the session ended before a prompt it could inject at",
    );
  });

  test("it says nothing about a Rule that did arrive", () => {
    const { actions } = run(index, [promptIn("src/a.ts"), end]);
    expect(actions.map((a) => a.type)).toEqual(["inject"]);
  });

  test("it says nothing about a Rule that never matched", () => {
    expect(run(index, [start, promptIn("main.rs"), end]).actions).toEqual([]);
  });

  test("a session that ended before its first prompt reports nothing as dropped", () => {
    expect(run(index, [start, end]).actions).toEqual([]);
  });

  test("a Rule delivered mid-turn is not reported as dropped", () => {
    const writes = ruled([["typescript-best-practices", onWrite]]);
    const { actions } = run(writes, [wrote("src/a.ts"), end]);
    expect(actions.map((a) => a.type)).toEqual(["deliver"]);
  });

  test("what was still due is reported in declared order", () => {
    const two = ruled([
      ["first", typescript],
      ["second", typescript],
    ]);
    const { actions } = run(two, [promptIn("a.ts"), compaction, end]);
    expect(actions.filter((a) => a.type === "dropped").map((a) => a.rule)).toEqual(["first", "second"]);
  });
});

describe("compaction", () => {
  test("a Rule injected before a compaction is injected again after it", () => {
    const index = ruled([["unslop", always]]);
    expect(injected(run(index, [prompt, compaction, prompt]).actions)).toEqual(["unslop", "unslop"]);
  });

  test("a Rule whose predicate cannot fire again is re-injected too", () => {
    const index = ruled([["typescript-best-practices", onWrite]]);
    const { actions } = run(index, [wrote("a.ts"), compaction, prompt]);
    expect(injected(actions)).toEqual(["typescript-best-practices", "typescript-best-practices"]);
  });

  test("what a compaction re-armed says so, rather than claiming the predicate matched again", () => {
    const index = ruled([["typescript-best-practices", typescript]]);
    const { actions } = run(index, [promptIn("a.ts"), compaction, promptIn("a.ts")]);
    expect(actions.map(logLine)).toEqual([
      "inject typescript-best-practices: repo-contains matched a.ts",
      "queue typescript-best-practices: compaction dropped it",
      "inject typescript-best-practices: compaction dropped it",
    ]);
  });

  test("a Rule that never matched is not injected by a compaction", () => {
    const index = ruled([["typescript-best-practices", typescript]]);
    expect(run(index, [start, promptIn("main.rs"), compaction, promptIn("main.rs")]).actions).toEqual([]);
  });

  test("re-arming is logged, so the second injection is not a mystery", () => {
    const index = ruled([["unslop", always]]);
    const { actions } = run(index, [prompt, compaction, prompt]);
    expect(actions.map((a) => a.type)).toEqual(["inject", "queue", "inject"]);
    expect(logLine(nth(actions, 1))).toMatch(/unslop.*compaction/);
  });
});

describe("a session start", () => {
  test("it forgets what a previous session injected", () => {
    const index = ruled([["unslop", always]]);
    const first = run(index, [prompt]);
    const second = dispatch(index, start, first.state);
    expect(injected(dispatch(index, prompt, second.state).actions)).toEqual(["unslop"]);
  });

  test("a carrying start keeps what the session already injected", () => {
    const index = ruled([["unslop", always]]);
    const { actions } = run(index, [prompt, carried, prompt]);
    expect(injected(actions)).toEqual(["unslop"]);
  });
});

const LUNA = "openai-codex/gpt-6-luna";
const MUSE = "opencode-go/muse-spark-1.3-contributor";
const QWEN = "ollama/qwen3.6:35b-a3b-iq3s";
const HOSTED = "anthropic/claude-opus-5-5";
const fields = { skills: [], references: [] };
const profiles: IndexedProfile[] = [
  { name: "default", models: [], rules: ["unslop", "comment-discipline"], ...fields },
  { name: "luna", models: [LUNA], rules: ["unslop", "comment-discipline", "force-determinism"], ...fields },
  { name: "muse", models: [MUSE], rules: ["unslop", "comment-discipline", "guard-the-context-window"], ...fields },
  { name: "local", models: [QWEN], rules: ["unslop", "comment-discipline", "guard-the-context-window"], ...fields, tools: ["read", "write", "edit", "bash"] },
];
const scoped = ruled([
  ["force-determinism", always],
  ["guard-the-context-window", always],
  ["unslop", always],
  ["comment-discipline", onWrite],
]);
const index: Index = { ...scoped, profiles };
const startedOn = (model: string, holding?: string[]): Event => ({ type: "session-start", model, ...(holding ? { holding } : {}) });
const switchedTo = (model: string): Event => ({ type: "model-switch", model });
const promptOn = (model: string): Event => ({ type: "prompt", model });

describe("complete model profiles", () => {
  test("an exact model gets only its named Rules", () => {
    expect(injected(run(index, [startedOn(LUNA), promptOn(LUNA)]).actions)).toEqual(["force-determinism", "unslop"]);
  });

  test("unknown and unreported models get the default list", () => {
    expect(injected(run(index, [startedOn(HOSTED), promptOn(HOSTED)]).actions)).toEqual(["unslop"]);
    expect(injected(run(index, [start, prompt]).actions)).toEqual(["unslop"]);
  });

  test("a switch withdraws Rules absent from the next profile", () => {
    const { actions, state } = run(index, [startedOn(LUNA), promptOn(LUNA), switchedTo(MUSE), promptOn(MUSE)]);
    expect(actions.filter((a) => a.type === "withdraw").map((a) => a.rule)).toEqual(["force-determinism"]);
    expect(state.rules).toEqual({ unslop: { state: "injected" }, "guard-the-context-window": { state: "injected" } });
  });

  test("a Rule compaction queued is withdrawn too, so it does not come back on the new model", () => {
    const { actions, state } = run(index, [startedOn(LUNA), promptOn(LUNA), compaction, switchedTo(MUSE), promptOn(MUSE)]);
    expect(actions.filter((a) => a.type === "withdraw").map((a) => a.rule)).toEqual(["force-determinism"]);
    expect(injected(actions).slice(-2)).toEqual(["guard-the-context-window", "unslop"]);
    expect(state.rules["force-determinism"]).toBeUndefined();
  });

  test("a prompt that names no model keeps the model the session started on", () => {
    const { actions, state } = run(index, [startedOn(MUSE), promptIn("a.ts")]);
    expect(injected(actions)).toEqual(["guard-the-context-window", "unslop"]);
    expect(state.model).toBe(MUSE);
  });

  test("a switch the harness reports no model for withdraws nothing", () => {
    const { actions } = run(index, [startedOn(LUNA), promptOn(LUNA), { type: "model-switch" }]);
    expect(actions.filter((a) => a.type === "withdraw")).toEqual([]);
  });

  test("a project switch is logged for a model whose Profile leaves the Rule out, and not for one whose Profile names it", () => {
    const on = projectOf({ on: ["guard-the-context-window"] });
    const off = projectOf({ off: ["guard-the-context-window"] });
    const logged = (model: string, project: Event) => run(index, [startedOn(model), project]).actions.filter((a) => a.type === "switched").map(logLine);
    expect(logged(HOSTED, promptAt(on))).toEqual([`switched guard-the-context-window on: ${QUALITY} switches it on`]);
    expect(logged(MUSE, promptAt(on))).toEqual([]);
    expect(logged(HOSTED, promptAt(off))).toEqual([]);
    expect(logged(MUSE, promptAt(off))).toEqual([`switched guard-the-context-window off: ${QUALITY} switches it off`]);
  });

  test("tool-triggered Rules obey the complete list", () => {
    const { actions } = run(index, [startedOn(HOSTED), promptOn(HOSTED), wrote("a.ts")]);
    expect(delivered(actions)).toEqual(["comment-discipline"]);
    const other: Index = { ...index, profiles: profiles.map((p) => p.name === "default" ? { ...p, rules: ["unslop"] } : p) };
    expect(delivered(run(other, [startedOn(HOSTED), promptOn(HOSTED), wrote("a.ts")]).actions)).toEqual([]);
  });

  test("an exact profile trims tools at start and restores the original list at a switch to default", () => {
    const holding = ["web_search", "bash", "read"];
    const { actions } = run(index, [startedOn(QWEN, holding), switchedTo(HOSTED)]);
    expect(actions.filter((a) => a.type === "trim")).toEqual([
      { type: "trim", profile: "local", why: `the session's model is ${QWEN}`, rules: ["unslop", "comment-discipline", "guard-the-context-window"], tools: ["bash", "read"] },
      { type: "trim", profile: "default", why: "the session's model now uses a Profile without tools", rules: ["unslop", "comment-discipline"], tools: holding },
    ]);
  });

  test("switching from a trimmed model to another exact Profile restores starting tools", () => {
    const holding = ["web_search", "read"];
    const actions = run(index, [startedOn(QWEN, holding), switchedTo(MUSE)]).actions.filter((action) => action.type === "trim");
    expect(actions.at(-1)).toMatchObject({ profile: "muse", tools: holding });
  });

  test("a harness that reported nothing held at the start gets nothing to restore on a switch away", () => {
    const { actions } = run(index, [startedOn(QWEN), switchedTo(HOSTED)]);
    expect(actions.filter((a) => a.type === "trim").map((a) => a.profile)).toEqual(["local"]);
  });

  test("a switch between two Profiles without tools hands nothing back, because nothing was trimmed", () => {
    const { actions } = run(index, [startedOn(HOSTED, ["web_search", "read"]), switchedTo(LUNA)]);
    expect(actions.filter((a) => a.type === "trim")).toEqual([]);
  });

  test("profiles without tools keep exactly what their harness supplied", () => {
    const holding = ["web_search", "read"];
    for (const model of ["ollama/future-model", LUNA, HOSTED]) {
      expect(kept(run(index, [startedOn(model, holding)]).actions)).toEqual([]);
    }
    expect(injected(run(index, [startedOn("ollama/future-model"), promptOn("ollama/future-model")]).actions)).toEqual(["unslop"]);
  });
});

describe("the dispatch log", () => {
  test("every action produced has a line", () => {
    const logging = ruled([
      ["unslop", always],
      ["typescript-best-practices", onWrite],
      ["push-with-care", { predicate: "tool-call", tool: "bash", argument: "cmd", matches: "*" }],
    ]);
    const { actions } = run(logging, [start, promptIn("a.ts"), wrote("a.ts"), ran("git push"), compaction, prompt, end]);
    expect(actions.length, "the run produced nothing to log, so this proves nothing").toBeGreaterThan(0);
    for (const action of actions) {
      expect(logLine(action), `${action.type} ${subject(action)} has no line`).toInclude(subject(action));
    }
  });

  test("an action carrying text over several lines is still one line", () => {
    const verdict: Outcome = { outcome: "inconclusive", why: "`bun run test` could not be started:\nspawn sh\r\nENOENT" };
    const { actions } = dispatch(ruled([]), { type: "verdict", tree: "t1", after: "t1", seconds: 1, verdict }, START);
    expect(logLine(nth(actions, 0))).toBe("release t1: `bun run test` could not be started:\\nspawn sh\\nENOENT, so this settle is let go unchecked");
  });

  test("a broken predicate is distinguishable from a Rule that correctly did not match", () => {
    const broken = ruled([["push-with-care", { predicate: "tool-call", tool: "bash", argument: "cmd", matches: "*" }]]);
    const quiet = ruled([["push-with-care", onPush]]);

    const noise = run(broken, [ran("git status"), prompt]).actions;
    expect(noise.map(logLine)).toEqual([logLine(nth(noise, 0))]);
    expect(nth(noise, 0).type).toBe("broken");
    expect(run(quiet, [ran("git status"), prompt]).actions).toEqual([]);
  });
});

describe("run state", () => {
  test("it is plain JSON, so nothing about it is tied to the process that made it", () => {
    const logging = ruled([
      ["unslop", always],
      ["typescript-best-practices", onWrite],
    ]);
    const { state } = run(logging, [prompt, wrote("a.ts")]);
    const revived = roundTripped(state);

    expect(revived).toEqual(state);
    expect(dispatch(logging, prompt, revived).actions).toEqual([]);
    const rearmed = roundTripped(dispatch(logging, compaction, revived).state);
    expect(injected(dispatch(logging, prompt, rearmed).actions)).toEqual(["unslop", "typescript-best-practices"]);
  });
});

