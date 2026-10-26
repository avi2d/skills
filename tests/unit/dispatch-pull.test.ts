import { describe, expect, test } from "bun:test";
import type { Event, Index } from "../../src/dispatcher/dispatch";
import { logLine } from "../../src/dispatcher/dispatch-log";
import { nth, run, ruled, subject } from "../lib/dispatch";

const BODY = "library/writing/references/unslop/SKILL.md";

const hub: Index["hub"] = [{ name: "unslop", skill: BODY }];

const withHub: Index = { ...ruled([]), hub };

const read = (path: string): Event => ({ type: "read", tool: "read", paths: [path] });

describe("a read of a Body's SKILL.md", () => {
  test("it logs a pull naming the Body, and nothing else about the read", () => {
    const { actions } = run(withHub, [read(`/repo/${BODY}`)]);
    expect(actions).toEqual([{ type: "pull", body: "unslop", why: "read unslop/SKILL.md" }]);
    expect(logLine(nth(actions, 0))).toBe("pull unslop: read unslop/SKILL.md");
    expect(subject(nth(actions, 0))).toBe("unslop");
  });

  test("a native Windows path to it logs the same pull", () => {
    const { actions } = run(withHub, [read(`C:\\Users\\avi\\Projects\\skills\\${BODY.replaceAll("/", "\\")}`)]);
    expect(actions).toEqual([{ type: "pull", body: "unslop", why: "read unslop/SKILL.md" }]);
  });

  test("a tool call that reads it logs nothing, because the read has not happened yet", () => {
    const { actions } = run(withHub, [{ type: "tool-call", tool: "read", input: { path: `/repo/${BODY}` } }]);
    expect(actions).toEqual([]);
  });

  test("a read of a reference file under a Body logs nothing", () => {
    const { actions } = run(withHub, [read("/repo/library/writing/references/unslop/references/tactics.md")]);
    expect(actions).toEqual([]);
  });

  test("a read of a path outside the Hub logs nothing", () => {
    const { actions } = run(withHub, [read("/repo/src/dispatcher/dispatch.ts")]);
    expect(actions).toEqual([]);
  });

  test("a read of a SKILL.md the Hub does not hold logs nothing", () => {
    const { actions } = run(withHub, [read("/repo/library/writing/references/elsewhere/SKILL.md")]);
    expect(actions).toEqual([]);
  });

  test("no paths means no pulls", () => {
    const { actions } = run(withHub, [{ type: "read", tool: "read", paths: [] }]);
    expect(actions).toEqual([]);
  });
});
