import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadSelection } from "../../src/bodies/selection";
import type { Action, Event, Index } from "../../src/dispatcher/dispatch";
import { logLine } from "../../src/dispatcher/dispatch-log";
import {
  DAY,
  activeRules,
  logPath,
  readDispatchLog,
  readLog,
  render,
  report,
  type ActiveRule,
  type Said,
} from "../../src/report/dispatch-report";
import { cappedNote } from "../../src/dispatcher/repo-walk";
import { run } from "../lib/dispatch";
import { failureOf, value, valueOf } from "../lib/effect";

const REPO = new URL("../../", import.meta.url).pathname;
const FIXTURE = join(REPO, "tests/fixtures/dispatch.log");

const TO = Date.parse("2026-09-24T09:00:00.000Z");
const WEEK = { from: TO - 7 * DAY, to: TO };

const ACTIVE: ActiveRule[] = [
  { name: "prove-it-works", triggers: [{ predicate: "always" }] },
  { name: "comment-discipline", triggers: [{ predicate: "repo-contains", glob: "**/*.ts" }] },
  { name: "typescript-best-practices", triggers: [{ predicate: "repo-contains", glob: "**/*.ts" }] },
  { name: "git-hygiene", triggers: [{ predicate: "tool-call", tool: "bash", argument: "command", matches: "*git commit*" }] },
];

const fixture = () => readLog(readFileSync(FIXTURE, "utf8"));

const STAMP = "2026-09-20T10:00:00.000Z";

const written = (lines: ReadonlyArray<readonly [session: string, text: string]>, stamp = STAMP): string =>
  lines.map(([session, text]) => `${stamp} ${session} ${text}`).join("\n");

const said = (text: string): Said | undefined => readLog(written([["s", text]])).entries[0]?.said;

const weekOf = (text: string) => report(readLog(text), ACTIVE, WEEK);

describe("reading the log", () => {
  test("a line that starts with no timestamp is skipped and named by its line number", () => {
    expect(fixture().unreadable).toEqual([22]);
  });

  test("every line a Rule action writes is read back as the Rule it names", () => {
    const text = { text: "Follow it." };
    const actions: Array<[Action, Said]> = [
      [{ type: "inject", rule: "a", why: "always", ...text }, { kind: "reached", rule: "a" }],
      [{ type: "deliver", rule: "a", why: "file-matches matched b.ts", ...text }, { kind: "reached", rule: "a" }],
      [{ type: "queue", rule: "a", why: "compaction dropped it" }, { kind: "queued", rule: "a" }],
      [{ type: "dropped", rule: "a", why: "the session ended" }, { kind: "dropped", rule: "a", why: "the session ended" }],
      [{ type: "broken", rule: "a", why: "it never reached the model" }, { kind: "broken", rule: "a", why: "it never reached the model" }],
    ];
    for (const [action, expected] of actions) expect(said(logLine(action)), action.type).toEqual(expected);
  });

  test("an inject written before a Rule's line carried its reason still reaches the Rule", () => {
    expect(said("inject unslop")).toEqual({ kind: "reached", rule: "unslop" });
  });

  test("a pull line is read back as the Body it names, not as a Rule", () => {
    expect(said("pull unslop: read unslop/SKILL.md")).toEqual({ kind: "pull", body: "unslop" });
  });

  test("the note a capped walk writes is read as a hole asked of a partial tree", () => {
    expect(said(cappedNote("/Users/someone/a dir, with a comma"))).toEqual({ kind: "hole", answered: "from a partial tree" });
  });

  test("the note builds before the fallback walk wrote is read as a hole asked of no tree", () => {
    expect(said("broken dispatcher: /private/tmp is not a git repository, so repo-contains was not asked")).toEqual({
      kind: "hole",
      answered: "not at all",
    });
  });

  test("a verb the report does not know names no Rule, whatever the verb is called", () => {
    for (const verb of ["build", "trim", "toString", "constructor"]) expect(said(`${verb} x: y`), verb).toEqual({ kind: "other" });
  });

  test("a broken Dispatcher that is not a hole names no Rule", () => {
    expect(said("broken dispatcher: this session's state could not be written down: EACCES")).toEqual({ kind: "other" });
  });
});

describe("which Rules reach sessions", () => {
  test("a Rule counts the sessions it reached, not the lines", () => {
    const text = written([
      ["s1", "inject prove-it-works: always"],
      ["s1", "inject prove-it-works: compaction dropped it"],
      ["s2", "deliver prove-it-works: file-matches matched a.ts"],
    ]);
    expect(weekOf(text).active.find((r) => r.rule === "prove-it-works")?.sessions).toBe(2);
  });

  test("an active Rule that reached no session is named as never reaching one", () => {
    expect(render("fixture.log", report(fixture(), ACTIVE, WEEK))).toInclude(
      "Never reached a session: git-hygiene, typescript-best-practices.",
    );
  });

  test("a Rule no longer active that still reached a session is listed apart, with when it last did", () => {
    const { active, inactive } = report(fixture(), ACTIVE, WEEK);
    expect(active.map((r) => r.rule)).not.toContain("unslop");
    expect(inactive).toEqual([{ rule: "unslop", sessions: 1, last: Date.parse("2026-09-21T08:00:00.000Z") }]);
  });

  test("a session is in the window when any line of it is, and is read whole", () => {
    const { sessions, active } = report(fixture(), ACTIVE, WEEK);
    expect(sessions).toBe(6);
    expect(active.find((r) => r.rule === "comment-discipline")?.sessions, "the straddling session injected before the window").toBe(3);
  });

  test("a session whose every line falls after the window's end is not in it", () => {
    const text = written([["later", "inject prove-it-works: always"]], "2026-09-25T08:00:00.000Z");
    expect(weekOf(text).sessions).toBe(0);
  });
});

describe("which sessions lost a Rule", () => {
  test("a Rule queued at compaction and injected at the next prompt was not lost", () => {
    const text = written([
      ["s", "inject prove-it-works: always"],
      ["s", "queue prove-it-works: compaction dropped it"],
      ["s", "inject prove-it-works: compaction dropped it"],
    ]);
    expect(weekOf(text).losses).toEqual([]);
  });

  test("a Rule the session ended holding is lost once, as dropped", () => {
    const text = written([
      ["s", "queue prove-it-works: compaction dropped it"],
      ["s", "dropped prove-it-works: the session ended before a prompt it could inject at"],
    ]);
    expect(weekOf(text).losses).toEqual([
      { session: "s", rule: "prove-it-works", at: Date.parse(STAMP), how: "dropped", why: "the session ended before a prompt it could inject at" },
    ]);
  });

  test("a Rule still queued at the session's last line is lost, though no session end was logged", () => {
    const text = written([
      ["s", "inject comment-discipline: repo-contains matched a.ts"],
      ["s", "queue comment-discipline: compaction dropped it"],
    ]);
    expect(weekOf(text).losses).toMatchObject([{ session: "s", rule: "comment-discipline", how: "queued" }]);
  });

  test("a Rule is lost once in a session, however many lines that session logged losing it", () => {
    const text = written([
      ["s", "broken git-hygiene: trigger names argument `command`, and bash was called with cmd"],
      ["s", "broken git-hygiene: trigger names argument `command`, and bash was called with cmd, description"],
      ["s", "queue git-hygiene: compaction dropped it"],
      ["s", "dropped git-hygiene: the session ended before a prompt it could inject at"],
      ["t", "broken git-hygiene: trigger names argument `command`, and bash was called with cmd"],
    ]);
    const { losses } = weekOf(text);
    expect(losses).toEqual([
      { session: "s", rule: "git-hygiene", at: Date.parse(STAMP), how: "broken", why: "trigger names argument `command`, and bash was called with cmd" },
      { session: "t", rule: "git-hygiene", at: Date.parse(STAMP), how: "broken", why: "trigger names argument `command`, and bash was called with cmd" },
    ]);
    expect(render("x", weekOf(text))).toInclude("Sessions that lost a Rule: 2, 2 Rules lost in all.");
  });

  test("a write the core could not place, and so left unjudged, is not a lost Rule", () => {
    const index: Index = {
      harness: "pi",
      rules: [{ name: "comment-discipline", triggers: [{ predicate: "always" }], text: "# Comments\n", forbid: "comments" }],
      profiles: [],
      hub: [],
    };
    const edit: Event = { type: "tool-call", tool: "edit", input: {}, writes: ["src/a.ts"], changes: [{ path: "src/a.ts", before: { text: () => undefined, inRepository: () => "src/a.ts" }, edits: [{ old: "a", new: "b" }] }] };
    const { actions } = run(index, [edit]);
    expect(actions).toHaveLength(1);
    const text = written([["s", "inject comment-discipline: always"], ...actions.map((action) => ["s", logLine(action)] as const)]);
    expect(weekOf(text).losses).toEqual([]);
  });

  test("a broken Rule is lost, and a broken Dispatcher is not a lost Rule", () => {
    expect(report(fixture(), ACTIVE, WEEK).losses.map((l) => [l.rule, l.how])).toEqual([
      ["comment-discipline", "queued"],
      ["prove-it-works", "dropped"],
      ["git-hygiene", "broken"],
    ]);
  });
});

describe("the repo-contains hole", () => {
  test("a session counts once, and once for each way it asked repo-contains", () => {
    const text = written([
      ["s", "broken dispatcher: /a is not a git repository, so repo-contains was not asked"],
      ["s", "broken dispatcher: /a is not a git repository, so repo-contains was not asked"],
      ["s", cappedNote("/b")],
      ["t", cappedNote("/b")],
    ]);
    const { hole } = weekOf(text);
    expect(hole.sessions).toBe(2);
    expect(hole.answered).toEqual({ "not at all": 1, "from a partial tree": 2 });
  });

  test("its cost counts the Rules repo-contains scopes, less any that reached the session another way", () => {
    expect(report(fixture(), ACTIVE, WEEK).hole.missed).toEqual([
      { rule: "typescript-best-practices", sessions: 2 },
      { rule: "comment-discipline", sessions: 1 },
    ]);
  });
});

describe("the report", () => {
  test("reads the fixture log as a week of it", () => {
    expect(render("fixture.log", report(fixture(), ACTIVE, WEEK))).toBe(
      [
        "The dispatch log at fixture.log, over the 7 days to 2026-09-24T09:00Z.",
        "Skipped 1 line that is not a dispatch log line, at 22.",
        "6 sessions wrote to it.",
        "",
        "Active Rules, by the sessions each reached:",
        "  comment-discipline         3   50.0%",
        "  prove-it-works             3   50.0%",
        "  git-hygiene                0    0.0%",
        "  typescript-best-practices  0    0.0%",
        "Never reached a session: git-hygiene, typescript-best-practices.",
        "",
        "Inactive Rules that still reached a session, switched on by a project or from a build that carried them:",
        "  unslop  1  last at 2026-09-21T08:00Z",
        "",
        "Sessions that lost a Rule: 3, 3 Rules lost in all.",
        "  2026-09-18T11:00Z  2026-09-18T10-00-00-000Z_01a0bbbb-0000-7000-8000-000000000000.jsonl",
        "    comment-discipline: still queued at the session's last line",
        "  2026-09-19T09:31Z  11111111-2222-4333-8444-555555555555",
        "    prove-it-works: dropped, the session ended before a prompt it could inject at",
        "  2026-09-22T08:00Z  2026-09-22T08-00-00-000Z_01a0dddd-0000-7000-8000-000000000000.jsonl",
        "    git-hygiene: broken, trigger names argument `command`, and bash was called with cmd",
        "",
        "The repo-contains hole: 2 of 6 sessions (33.3%).",
        "  1 could not ask it at all, from a build before the fallback walk.",
        "  1 asked it of a partial tree, the walk having hit its cap.",
        "  Rules scoped by repo-contains that never reached those sessions:",
        "    typescript-best-practices  2  100.0%",
        "    comment-discipline         1   50.0%",
      ].join("\n"),
    );
  });

  test("a window no session wrote in says so and stops", () => {
    expect(render("fixture.log", report(fixture(), ACTIVE, { from: 0, to: 1 }))).toBe(
      [
        "The dispatch log at fixture.log, over the 0 days to 1970-01-01T00:00Z.",
        "Skipped 1 line that is not a dispatch log line, at 22.",
        "No session wrote to it.",
      ].join("\n"),
    );
  });

  test("the active Rules are those any Profile names", async () => {
    const selection = await valueOf(loadSelection(REPO));
    const on = [...new Set(selection.profiles.flatMap((profile) => profile.rules))];
    const rules = await valueOf(activeRules(REPO));
    expect(rules.map((r) => r.name).sort()).toEqual(on.sort());
    expect(rules.every((r) => r.triggers.length > 0)).toBe(true);
  });

  test("a log that is not there fails naming the path it looked at", async () => {
    const missing = join(REPO, "tests/fixtures/no-such.log");
    const failure = await failureOf(readDispatchLog(missing));
    expect(failure).toMatchObject({ _tag: "FileFailure", path: missing, code: "ENOENT" });
  });
});

describe("the command line", () => {
  test("looks where the Dispatchers write: XDG_STATE_HOME when it is set, and under HOME when it is not", () => {
    expect(value(logPath({ XDG_STATE_HOME: "/state", HOME: "/home/x" }))).toBe("/state/skills/dispatch.log");
    expect(value(logPath({ HOME: "/home/x" }))).toBe("/home/x/.local/state/skills/dispatch.log");
  });
});
