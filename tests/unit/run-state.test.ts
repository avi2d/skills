import { describe, expect, test } from "bun:test";
import { decodeRunState, isRunState, START, type RunState } from "../../src/dispatcher/run-state";
import { dispatch } from "../../src/dispatcher/dispatch";
import { always, end, prompt, ruled } from "../lib/dispatch";

const full: RunState = {
  rules: {
    queued: { state: "pending", why: "compaction dropped it" },
    sent: { state: "injected" },
    seen: { state: "checked" },
  },
  model: "luna",
  holding: ["read", "bash"],
  walked: { "/repo": { files: ["src/a.ts"], capped: false } },
  gate: {
    held: 1,
    baseline: { root: "/repo", tree: "t0" },
    judged: {
      tree: "t1",
      failed: { outcome: "failed", check: { name: "lint", command: "bun run lint" }, status: "exited 1", tail: "nope" },
    },
    asked: "Not finished yet",
  },
  project: { path: "/repo/package.json", declares: ["effect"], on: [], off: ["unslop"] },
};

describe("isRunState", () => {
  test("it accepts the start and every lifecycle state the type declares", () => {
    expect(isRunState(START)).toBe(true);
    expect(isRunState(full)).toBe(true);
  });

  test("it accepts what JSON carries, so a stored session comes back as one", () => {
    expect(isRunState(JSON.parse(JSON.stringify(full)))).toBe(true);
  });

  test("it accepts the unreadable project beside the declared one", () => {
    expect(isRunState({ rules: {}, project: { path: "/repo/package.json", unreadable: "is not JSON" } })).toBe(true);
  });

  test("it carries the baseline commit the gate diffs its checks against", () => {
    expect(isRunState({ rules: {}, gate: { held: 0, baseline: { root: "/repo", tree: "t0", head: "c0" } } })).toBe(true);
    expect(isRunState({ rules: {}, gate: { held: 0, baseline: { root: "/repo", tree: "t0", head: 3 } } })).toBe(false);
  });

  test("it rejects the old shape's three collections", () => {
    expect(isRunState({ injected: [], checked: [], pending: {} })).toBe(false);
  });

  test("it rejects a rule held as pending and injected at once", () => {
    expect(isRunState({ rules: { naming: { state: "pending", why: "w" } }, injected: ["naming"] })).toBe(false);
  });

  test("it rejects lifecycles the union forbids", () => {
    expect(isRunState({ rules: { naming: { state: "pending" } } })).toBe(false);
    expect(isRunState({ rules: { naming: { state: "pending", why: 3 } } })).toBe(false);
    expect(isRunState({ rules: { naming: { state: "injected", why: "w" } } })).toBe(false);
    expect(isRunState({ rules: { naming: { state: "checked", why: "w" } } })).toBe(false);
    expect(isRunState({ rules: { naming: { state: "queued", why: "w" } } })).toBe(false);
    expect(isRunState({ rules: { naming: "injected" } })).toBe(false);
    expect(isRunState({ rules: null })).toBe(false);
    expect(isRunState({ rules: ["naming"] })).toBe(false);
  });

  test("it rejects a field the type declares when it holds what the type forbids", () => {
    expect(isRunState({ rules: {}, model: 3 })).toBe(false);
    expect(isRunState({ rules: {}, holding: "read" })).toBe(false);
    expect(isRunState({ rules: {}, holding: ["read", 3] })).toBe(false);
    expect(isRunState({ rules: {}, walked: { "/repo": { files: ["a"], capped: "no" } } })).toBe(false);
    expect(isRunState({ rules: {}, walked: { "/repo": { files: "a", capped: false } } })).toBe(false);
    expect(isRunState({ rules: {}, gate: { held: "0" } })).toBe(false);
    expect(isRunState({ rules: {}, gate: { held: 0, baseline: { root: 1, tree: "t" } } })).toBe(false);
    expect(isRunState({ rules: {}, gate: { held: 0, judged: { tree: "t", failed: { outcome: "failed" } } } })).toBe(false);
    expect(isRunState({ rules: {}, gate: { held: 0, asked: 4 } })).toBe(false);
    expect(isRunState({ rules: {}, project: { path: "/p", unreadable: 4 } })).toBe(false);
    expect(isRunState({ rules: {}, project: { path: "/p", declares: ["bun"], on: [], off: [] } })).toBe(false);
    expect(isRunState({ rules: {}, project: { path: "/p", declares: [], on: "naming", off: [] } })).toBe(false);
    expect(
      isRunState({ rules: {}, project: { path: "/p", unreadable: "no", declares: [], on: [], off: [] } }),
    ).toBe(false);
  });

  test("it rejects a key the type does not declare", () => {
    expect(isRunState({ ...full, awaiting: [] })).toBe(false);
    expect(isRunState({ rules: {}, gate: { held: 0, checks: [] } })).toBe(false);
  });
});

describe("decodeRunState", () => {
  test("it passes a new state through", () => {
    expect(decodeRunState(full)).toBe(full);
    expect(decodeRunState(START)).toBe(START);
  });

  test("it maps the old collections onto the map and carries the rest", () => {
    expect(
      decodeRunState({
        injected: ["sent", "seen"],
        checked: ["seen"],
        pending: { queued: "compaction dropped it" },
        model: "luna",
        holding: ["read"],
      }),
    ).toEqual({
      rules: {
        sent: { state: "injected" },
        seen: { state: "checked" },
        queued: { state: "pending", why: "compaction dropped it" },
      },
      model: "luna",
      holding: ["read"],
    });
  });

  test("a rule the old shape holds twice decodes once, checked over injected over pending", () => {
    expect(decodeRunState({ injected: ["a"], checked: [], pending: { a: "stale" } })?.rules).toEqual({
      a: { state: "injected" },
    });
    expect(decodeRunState({ injected: ["a"], checked: ["a"], pending: { a: "stale" } })?.rules).toEqual({
      a: { state: "checked" },
    });
    expect(decodeRunState({ injected: [], checked: ["a"], pending: {} })?.rules).toEqual({ a: { state: "checked" } });
  });

  test("a rule named after a member every object inherits still decodes", () => {
    const checked = decodeRunState({ injected: [], checked: ["constructor"], pending: {} });
    expect(Object.entries(checked?.rules ?? {})).toEqual([["constructor", { state: "checked" }]]);
    const pending = decodeRunState({ injected: [], checked: [], pending: { constructor: "stale" } });
    expect(Object.entries(pending?.rules ?? {})).toEqual([["constructor", { state: "pending", why: "stale" }]]);
  });

  test("it refuses what neither shape allows", () => {
    expect(decodeRunState(undefined)).toBeUndefined();
    expect(decodeRunState({ injected: "sent", checked: [], pending: {} })).toBeUndefined();
    expect(decodeRunState({ injected: [], checked: [], pending: { queued: 3 } })).toBeUndefined();
    expect(decodeRunState({ injected: [], checked: [], pending: {}, holding: "read" })).toBeUndefined();
  });
});

describe("a rule the old shape held as pending and injected at once", () => {
  const index = ruled([["naming", always]]);
  const decoded = decodeRunState({ injected: ["naming"], checked: [], pending: { naming: "compaction dropped it" } });

  test("it decodes to injected, so the session ending drops nothing", () => {
    if (decoded === undefined) expect.unreachable("a legacy state did not decode");
    expect(decoded.rules).toEqual({ naming: { state: "injected" } });
    expect(dispatch(index, end, decoded).actions).toEqual([]);
  });

  test("the stale pending entry fires nothing at the next prompt", () => {
    if (decoded === undefined) expect.unreachable("a legacy state did not decode");
    const { actions, state } = dispatch(index, prompt, decoded);
    expect(actions).toEqual([]);
    expect(state.rules).toEqual({ naming: { state: "injected" } });
  });
});
