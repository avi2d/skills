import { homedir } from "node:os";
import { Effect, Path, type FileSystem } from "effect";
import type { IndexedRule } from "../dispatcher/dispatch";
import { indexFor } from "../generate/dispatch-index";
import type { FileFailure } from "../platform/failures";
import { attempt } from "../platform/files";
import { DISPATCHERS, active } from "../generate/generate";
import { main } from "../platform/platform";

export type ActiveRule = Pick<IndexedRule, "name" | "triggers">;

export type Answered = "not at all" | "from a partial tree";

export type Said =
  | { kind: "reached" | "queued"; rule: string }
  | { kind: "dropped" | "broken"; rule: string; why: string }
  | { kind: "pull"; body: string }
  | { kind: "hole"; answered: Answered }
  | { kind: "other" };

export type Entry = { at: number; session: string; said: Said };

export type Log = { entries: Entry[]; unreadable: number[] };

export type Window = { from: number; to: number };

export type Reach = { rule: string; sessions: number; last?: number };

export type Loss = { session: string; rule: string; at: number; how: "dropped" | "broken" | "queued"; why: string };

export type Hole = {
  sessions: number;
  answered: Record<Answered, number>;
  missed: Array<{ rule: string; sessions: number }>;
};

export type Report = {
  window: Window;
  sessions: number;
  unreadable: number[];
  active: Reach[];
  inactive: Reach[];
  losses: Loss[];
  hole: Hole;
};

export const DAY = 24 * 60 * 60 * 1000;

export const WEEK = 7 * DAY;

const STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const LINE = /^(\S+) (\S+) (\S+)(?: (.*))?$/;
const SUBJECT = /^([^\s:]+)(?::(?: (.*))?)?$/;

const RULE_VERBS = new Map<string, "reached" | "queued" | "dropped" | "broken">([
  ["inject", "reached"],
  ["deliver", "reached"],
  ["queue", "queued"],
  ["dropped", "dropped"],
  ["broken", "broken"],
]);

// The log outlives the build that wrote it, so a shape no current writer produces is still read.
const HOLES: ReadonlyArray<{ shape: RegExp; answered: Answered }> = [
  { shape: /^.+ is not a git repository, so repo-contains was not asked$/, answered: "not at all" },
  {
    shape:
      /^git ls-files failed in .+, and the fallback walk hit its cap of \d+ entries before every glob matched, so repo-contains answered from a partial tree$/,
    answered: "from a partial tree",
  },
];

function holeIn(why: string): Said {
  const hole = HOLES.find(({ shape }) => shape.test(why));
  return hole ? { kind: "hole", answered: hole.answered } : { kind: "other" };
}

function saidBy(verb: string, rest: string): Said | undefined {
  if (verb === "pull") {
    const [, body] = SUBJECT.exec(rest) ?? [];
    return body === undefined ? undefined : { kind: "pull", body };
  }
  const kind = RULE_VERBS.get(verb);
  if (kind === undefined) return { kind: "other" };
  const [, rule, why = ""] = SUBJECT.exec(rest) ?? [];
  if (rule === undefined) return undefined;
  if (kind === "reached" || kind === "queued") return { kind, rule };
  if (kind === "broken" && rule === "dispatcher") return holeIn(why);
  return { kind, rule, why };
}

function entryOf(line: string): Entry | undefined {
  const [, stamp, session, verb, rest = ""] = LINE.exec(line) ?? [];
  if (stamp === undefined || session === undefined || verb === undefined || !STAMP.test(stamp)) return undefined;
  const said = saidBy(verb, rest);
  return said && { at: Date.parse(stamp), session, said };
}

export function readLog(text: string): Log {
  const entries: Entry[] = [];
  const unreadable: number[] = [];
  for (const [at, line] of text.split("\n").entries()) {
    if (line === "") continue;
    const entry = entryOf(line);
    if (entry) entries.push(entry);
    else unreadable.push(at + 1);
  }
  return { entries, unreadable };
}

export type Pull = { session: string; body: string };

export function pullsOf(log: Log): Pull[] {
  return log.entries.flatMap((entry) => (entry.said.kind === "pull" ? [{ session: entry.session, body: entry.said.body }] : []));
}

function sessionsIn(entries: readonly Entry[], window: Window): Map<string, Entry[]> {
  const seen = new Set(entries.filter((e) => e.at >= window.from && e.at <= window.to).map((e) => e.session));
  const sessions = new Map<string, Entry[]>();
  for (const entry of entries) {
    if (!seen.has(entry.session)) continue;
    const lines = sessions.get(entry.session);
    if (lines) lines.push(entry);
    else sessions.set(entry.session, [entry]);
  }
  return sessions;
}

function reachedBy(entries: readonly Entry[]): Map<string, number> {
  const last = new Map<string, number>();
  for (const { at, said } of entries) if (said.kind === "reached") last.set(said.rule, at);
  return last;
}

function lossesOf(session: string, entries: readonly Entry[]): Loss[] {
  const losses = new Map<string, Loss>();
  const lose = (loss: Loss) => {
    if (!losses.has(loss.rule)) losses.set(loss.rule, loss);
  };
  const queued = new Map<string, number>();
  for (const { at, said } of entries) {
    if (said.kind === "queued") queued.set(said.rule, at);
    else if (said.kind === "reached") queued.delete(said.rule);
    else if (said.kind === "dropped" || said.kind === "broken") {
      queued.delete(said.rule);
      lose({ session, rule: said.rule, at, how: said.kind, why: said.why });
    }
  }
  for (const [rule, at] of queued) lose({ session, rule, at, how: "queued", why: "still queued at the session's last line" });
  return [...losses.values()];
}

const byCount = <T extends { sessions: number }>(name: (item: T) => string) => (a: T, b: T): number =>
  b.sessions - a.sessions || (name(a) < name(b) ? -1 : name(a) > name(b) ? 1 : 0);

function holeOf(sessions: ReadonlyMap<string, Entry[]>, reached: ReadonlyMap<string, Map<string, number>>, rules: readonly ActiveRule[]): Hole {
  const answered: Record<Answered, number> = { "not at all": 0, "from a partial tree": 0 };
  const holed: string[] = [];
  for (const [session, entries] of sessions) {
    const holes = entries.flatMap(({ said }) => (said.kind === "hole" ? [said] : []));
    if (holes.length === 0) continue;
    holed.push(session);
    for (const kind of new Set(holes.map((h) => h.answered))) answered[kind] += 1;
  }
  const scoped = rules.filter((rule) => rule.triggers.some((t) => t.predicate === "repo-contains"));
  return {
    sessions: holed.length,
    answered,
    missed: scoped
      .map((rule) => ({ rule: rule.name, sessions: holed.filter((s) => !reached.get(s)?.has(rule.name)).length }))
      .toSorted(byCount((m) => m.rule)),
  };
}

export function report(log: Log, rules: readonly ActiveRule[], window: Window): Report {
  const sessions = sessionsIn(log.entries, window);
  const reached = new Map([...sessions].map(([session, entries]) => [session, reachedBy(entries)]));

  const reach = new Map<string, Reach>();
  for (const inSession of reached.values()) {
    for (const [rule, at] of inSession) {
      const seen = reach.get(rule);
      reach.set(rule, { rule, sessions: (seen?.sessions ?? 0) + 1, last: Math.max(seen?.last ?? at, at) });
    }
  }
  const names = new Set(rules.map((rule) => rule.name));
  const order = byCount<Reach>((r) => r.rule);

  return {
    window,
    sessions: sessions.size,
    unreadable: log.unreadable,
    active: rules.map((rule) => reach.get(rule.name) ?? { rule: rule.name, sessions: 0 }).toSorted(order),
    inactive: [...reach.values()].filter((r) => !names.has(r.rule)).toSorted(order),
    losses: [...sessions].flatMap(([session, entries]) => lossesOf(session, entries)).toSorted((a, b) => a.at - b.at),
    hole: holeOf(sessions, reached, rules),
  };
}

const minute = (at: number): string => `${new Date(at).toISOString().slice(0, 16)}Z`;

const share = (part: number, whole: number): string => `${((part / whole) * 100).toFixed(1)}%`.padStart("100.0%".length);

const counted = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

function table(rows: ReadonlyArray<readonly [string, string, string]>): string[] {
  const wide = Math.max(...rows.map(([name]) => name.length));
  const count = Math.max(...rows.map(([, n]) => n.length));
  return rows.map(([name, n, rest]) => `  ${name.padEnd(wide)}  ${n.padStart(count)}  ${rest}`.trimEnd());
}

function lossLines(losses: readonly Loss[]): string[] {
  const bySession = new Map<string, { first: number; how: Map<string, string[]> }>();
  for (const loss of losses) {
    const how = loss.how === "queued" ? loss.why : `${loss.how}, ${loss.why}`;
    const session = bySession.get(loss.session) ?? { first: loss.at, how: new Map<string, string[]>() };
    session.how.set(how, [...(session.how.get(how) ?? []), loss.rule]);
    bySession.set(loss.session, session);
  }
  const out = [`Sessions that lost a Rule: ${bySession.size}, ${counted(losses.length, "Rule", "Rules")} lost in all.`];
  for (const [session, { first, how }] of bySession) {
    out.push(`  ${minute(first)}  ${session}`);
    for (const [said, rules] of how) out.push(`    ${rules.join(", ")}: ${said}`);
  }
  return out;
}

function holeLines(hole: Hole, sessions: number): string[] {
  if (hole.sessions === 0) return ["No session hit the repo-contains hole."];
  const out = [
    `The repo-contains hole: ${hole.sessions} of ${counted(sessions, "session", "sessions")} (${share(hole.sessions, sessions).trim()}).`,
    `  ${hole.answered["not at all"]} could not ask it at all, from a build before the fallback walk.`,
    `  ${hole.answered["from a partial tree"]} asked it of a partial tree, the walk having hit its cap.`,
  ];
  if (hole.missed.length === 0) return out;
  return [
    ...out,
    "  Rules scoped by repo-contains that never reached those sessions:",
    ...table(hole.missed.map(({ rule, sessions: n }) => [rule, String(n), share(n, hole.sessions)] as const)).map((l) => `  ${l}`),
  ];
}

export function render(path: string, found: Report): string {
  const { window, sessions } = found;
  const days = Math.round((window.to - window.from) / DAY);
  const out = [`The dispatch log at ${path}, over the ${days} days to ${minute(window.to)}.`];
  if (found.unreadable.length > 0) {
    const skipped = counted(found.unreadable.length, "line that is not a dispatch log line", "lines that are not dispatch log lines");
    out.push(`Skipped ${skipped}, at ${found.unreadable.join(", ")}.`);
  }
  if (sessions === 0) return [...out, "No session wrote to it."].join("\n");

  out.push(`${counted(sessions, "session", "sessions")} wrote to it.`, "", "Active Rules, by the sessions each reached:");
  out.push(...table(found.active.map(({ rule, sessions: n }) => [rule, String(n), share(n, sessions)] as const)));
  const never = found.active.filter((r) => r.sessions === 0).map((r) => r.rule);
  out.push(never.length === 0 ? "Every active Rule reached a session." : `Never reached a session: ${never.join(", ")}.`);
  if (found.inactive.length > 0) {
    out.push("", "Inactive Rules that still reached a session, switched on by a project or from a build that carried them:");
    out.push(
      ...table(found.inactive.map(({ rule, sessions: n, last }) => [rule, String(n), last === undefined ? "" : `last at ${minute(last)}`] as const)),
    );
  }
  out.push("", ...(found.losses.length === 0 ? ["No session lost a Rule."] : lossLines(found.losses)));
  out.push("", ...holeLines(found.hole, sessions));
  return out.join("\n");
}

export const logPath = (env: Readonly<Record<string, string | undefined>>): Effect.Effect<string, never, Path.Path> =>
  Effect.map(Path.Path, ({ join }) =>
    join(env.XDG_STATE_HOME ?? join(env.HOME ?? homedir(), ".local", "state"), "skills", "dispatch.log"));

export const readDispatchLog = (path: string): Effect.Effect<Log, FileFailure, FileSystem.FileSystem> =>
  attempt(path, (fs) => fs.readFileString(path)).pipe(Effect.map(readLog));

export const activeRules = Effect.fnUntraced(function* (repo: string) {
  const { bodies, profiles } = yield* active(repo);
  const rules = new Map<string, ActiveRule>();
  for (const { harness } of DISPATCHERS) {
    for (const { name, triggers } of (yield* indexFor(harness, bodies, profiles)).rules) rules.set(name, { name, triggers });
  }
  return [...rules.values()];
});

export const dispatchReport = Effect.fnUntraced(function* (repo: string, path: string, window: Window) {
  const log = yield* readDispatchLog(path);
  return render(path, report(log, yield* activeRules(repo), window));
});

if (import.meta.main) {
  const repo = new URL("../../", import.meta.url).pathname;
  const to = Date.now();
  main(
    Effect.gen(function* () {
      console.log(yield* dispatchReport(repo, yield* logPath(process.env), { from: to - WEEK, to }));
    }),
  );
}
