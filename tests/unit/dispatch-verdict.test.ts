import { describe, expect, test } from "bun:test";
import { dispatch, type Action, type Event, type RunState } from "../../src/dispatcher/dispatch";
import { START } from "../../src/dispatcher/run-state";
import { logLine } from "../../src/dispatcher/dispatch-log";
import { HOLDS, type Check, type Gate, type Outcome } from "../../src/dispatcher/verdict";
import { ruled, start, subject, run } from "../lib/dispatch";

describe("the verdict gate", () => {
  const index = ruled([]);
  const TEST: Check = { name: "test", command: "bun run test" };
  const LINT: Check = { name: "lint", command: "bun run lint" };
  const at = (tree: string, root = "/repo"): Gate => ({ root, tree, checks: [TEST, LINT] });
  const said = (tree: string, text = "fix the thing"): Event => ({ type: "prompt", baseline: { root: "/repo", tree }, text });
  const saidAt = (tree: string, head: string, root = "/repo"): Event => ({ type: "prompt", baseline: { root, tree, head }, text: "fix the thing" });
  const settledOn = (tree: string, root = "/repo"): Event => ({ type: "settled", gate: at(tree, root) });
  const failing: Outcome = { outcome: "failed", check: TEST, status: "exited 1", tail: "(fail) a thing\n 1 fail" };
  const passing: Outcome = { outcome: "passed", checks: ["test", "lint"] };

  type Settle = { actions: Action[]; state: RunState; ran: boolean };

  function settle(state: RunState, tree: string, verdict: Outcome, after = tree, root = "/repo"): Settle {
    const first = dispatch(index, settledOn(tree, root), state);
    if (!first.actions.some((a) => a.type === "verify")) return { ...first, ran: false };
    const judged = dispatch(index, { type: "verdict", tree, after, seconds: 1, verdict }, first.state);
    return { actions: [...first.actions, ...judged.actions], state: judged.state, ran: true };
  }

  const holds = (actions: readonly Action[]) => actions.flatMap((a) => (a.type === "hold" ? [a] : []));
  const released = (actions: readonly Action[]) => actions.flatMap((a) => (a.type === "release" ? [a] : []));

  const prompted = (tree: string): RunState => dispatch(index, said(tree), START).state;

  test("a repository that declares no checks is left alone", () => {
    const { actions } = run(index, [said("t0"), { type: "settled" }]);
    expect(actions).toEqual([]);
  });

  test("a turn that changed nothing is not verified", () => {
    expect(settle(prompted("t0"), "t0", passing)).toMatchObject({ actions: [], ran: false });
  });

  test("a turn that changed the tree is verified with the repository's own checks, test before lint", () => {
    const { actions } = dispatch(index, settledOn("t1"), prompted("t0"));
    expect(actions).toEqual([{ type: "verify", root: "/repo", tree: "t1", checks: [TEST, LINT] }]);
  });

  test("a turn that moved since the baseline commit verifies with that commit as its base", () => {
    const state = dispatch(index, saidAt("t0", "c0"), START).state;
    const { actions } = dispatch(index, settledOn("t1"), state);
    expect(actions).toEqual([{ type: "verify", root: "/repo", tree: "t1", base: "c0", checks: [TEST, LINT] }]);
  });

  test("a pass lets the session settle, and the tree it passed is not verified again", () => {
    const first = settle(prompted("t0"), "t1", passing);
    expect(first.actions.map((a) => a.type)).toEqual(["verify", "passed"]);
    expect(settle(first.state, "t1", passing)).toMatchObject({ actions: [], ran: false });
  });

  test("a tree the checks rewrote as they ran is the one they judged, so the next settle does not run them again", () => {
    const first = settle(prompted("t0"), "t1", passing, "t1-after");
    expect(settle(first.state, "t1-after", passing).ran).toBe(false);
  });

  test("a failure holds the session, and hands the model the command, how it failed and what it printed", () => {
    const [hold] = holds(settle(prompted("t0"), "t1", failing).actions);
    expect(hold).toMatchObject({ tree: "t1", check: "test", held: 1, of: HOLDS });
    expect(hold?.text).toContain("`bun run test`");
    expect(hold?.text).toContain("commands.test");
    expect(hold?.text).toContain("exited 1");
    expect(hold?.text).toContain("(fail) a thing");
    expect(hold?.text).toContain(`hold 1 of ${HOLDS}`);
  });

  test("a settle on a tree nothing has changed since it failed is held from the verdict, not run again", () => {
    const first = settle(prompted("t0"), "t1", failing);
    const again = settle(first.state, "t1", passing);
    expect(again.ran).toBe(false);
    expect(holds(again.actions)[0]?.text).toContain("nothing has changed since, so it was not run again");
  });

  test("a session held by checks that keep failing is let go, and the loop ends", () => {
    for (const [label, treeAt] of [
      ["the model keeps changing the tree", (n: number) => `t${n}`],
      ["the model stops changing it", () => "t1"],
    ] as const) {
      let state = prompted("t0");
      const heldAt: boolean[] = [];
      const seen: Action[] = [];
      for (let n = 1; n <= 20; n += 1) {
        const step = settle(state, treeAt(n), failing);
        state = step.state;
        seen.push(...step.actions);
        heldAt.push(holds(step.actions).length > 0);
        if (!heldAt.at(-1)) break;
      }
      expect(heldAt, `${label}: the gate held the session past its bound`).toEqual([...Array(HOLDS).fill(true), false]);
      expect(released(seen).map((a) => a.why), label).toEqual([
        `test still fails after ${HOLDS} holds, so the session is let go with it failing`,
      ]);
    }
  });

  test("a human prompt gives the next turn holds of its own", () => {
    let state = prompted("t0");
    for (let n = 1; n <= HOLDS + 1; n += 1) state = settle(state, `t${n}`, failing).state;
    state = dispatch(index, said("t9", "try again"), state).state;
    expect(holds(settle(state, "t10", failing).actions)[0]?.held).toBe(1);
  });

  test("the hold coming back as a prompt, as Codex sends it, is not a human prompt and does not reset the count", () => {
    let state = prompted("t0");
    const heldAt: boolean[] = [];
    for (let n = 1; n <= 10; n += 1) {
      const step = settle(state, `t${n}`, failing);
      const [hold] = holds(step.actions);
      heldAt.push(hold !== undefined);
      if (!hold) break;
      state = dispatch(index, said(`t${n}`, hold.text), step.state).state;
    }
    expect(heldAt, "the gate's own continuation reset its count, so the session was never let go").toEqual([
      ...Array(HOLDS).fill(true),
      false,
    ]);
  });

  test("a settle in a root the prompt did not see records that root's tree and runs nothing, then checks what changes there", () => {
    for (const [label, before] of [
      ["the prompt was in another repository", prompted("t0")],
      ["the prompt was outside any gated repository", dispatch(index, { type: "prompt", text: "look around" }, START).state],
      ["the Dispatcher arrived after the prompt", START],
    ] as const) {
      const moved = settle(before, "o1", failing, "o1", "/other");
      expect(moved, `${label}: a turn that may not have changed the tree was checked`).toMatchObject({ actions: [], ran: false });
      expect(settle(moved.state, "o1", failing, "o1", "/other").ran, `${label}: the recorded tree was checked`).toBe(false);
      const changed = settle(moved.state, "o2", failing, "o2", "/other");
      expect(holds(changed.actions).map((a) => a.tree), label).toEqual(["o2"]);
    }
  });

  test("a check that could not say, because it could not start or a command it runs is missing, lets this settle go and no more", () => {
    for (const why of ["`bun run test` could not be started: spawn sh ENOENT", "`bun run lint` exited 127, so something it runs is not installed in this checkout"]) {
      const unsure: Outcome = { outcome: "inconclusive", why };
      const first = settle(prompted("t0"), "t1", unsure);
      expect(holds(first.actions), why).toEqual([]);
      expect(released(first.actions).map((a) => a.why), why).toEqual([`${why}, so this settle is let go unchecked`]);
      expect(holds(settle(first.state, "t1", failing).actions).map((a) => a.held), `${why}: the same tree was not checked again`).toEqual([1]);
      const later = dispatch(index, said("t1"), first.state);
      expect(holds(settle(later.state, "t2", failing).actions).map((a) => a.held), `${why}: the next prompt was not gated`).toEqual([1]);
    }
  });

  test("checks that could not finish stand the gate down for the rest of the session, rather than cost every settle again", () => {
    const cut: Outcome = { outcome: "overran", why: "`bun run test` was still running when the gate's 120s ran out" };
    const first = settle(prompted("t0"), "t1", cut);
    expect(holds(first.actions)).toEqual([]);
    expect(released(first.actions)[0]?.why).toContain("stands down for the rest of this session");
    const later = dispatch(index, said("t1"), first.state);
    expect(settle(later.state, "t2", failing)).toMatchObject({ actions: [], ran: false });
  });

  test("a turn that ended in failure is not verified, because it never said it was done", () => {
    const failed: Event = { type: "settled", failed: "the turn ended as error", gate: at("t1") };
    const { actions } = dispatch(index, failed, prompted("t0"));
    expect(actions).toEqual([]);
  });

  test("a new session starts with a gate of its own, and a resumed one keeps its count", () => {
    let state = prompted("t0");
    for (let n = 1; n <= HOLDS; n += 1) state = settle(state, `t${n}`, failing).state;
    expect(dispatch(index, start, state).state.gate).toBeUndefined();
    expect(dispatch(index, { type: "session-start", carrying: true }, state).state.gate?.held).toBe(HOLDS);
  });

  test("every gate action has a log line naming the tree it was about", () => {
    let state = prompted("t0");
    const seen: Action[] = [];
    for (const [tree, verdict] of [
      ["t1", passing],
      ["t2", failing],
      ["t3", failing],
      ["t4", failing],
    ] as const) {
      const step = settle(state, tree, verdict);
      state = step.state;
      seen.push(...step.actions);
    }
    expect(new Set(seen.map((a) => a.type))).toEqual(new Set(["verify", "passed", "hold", "release"]));
    for (const action of seen) expect(logLine(action), action.type).toInclude(subject(action));
  });
});

