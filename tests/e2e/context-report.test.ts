import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { skipReason } from "@avi2dg/checks/scripts/test-skips.ts";
import { indexStored, openIndex, sqlite } from "../../src/context/context-index";
import { READER_VERSION } from "../../src/context/context-reader";
import { saidBy, valueOf } from "../lib/effect";
import { bridgesOf, measure, readIndex, renderReport } from "../../src/context/context-report";

const sqlite3 = Bun.which("sqlite3");

const inTemp = async (run: (home: string) => Promise<void>): Promise<void> => {
  const home = mkdtempSync(join(tmpdir(), "skills-context-"));
  try {
    await run(home);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
};

test.skipIf(!sqlite3)(
  skipReason(
    "it runs the `sqlite3` binary the index is kept in, so it runs only where sqlite3 is on PATH; the ci workflow installs a pinned one, a contributor's machine may not have it",
    "a report read before any index exists finds no sessions",
    "local",
  ),
  () => inTemp(async (home) => {
    expect(renderReport(measure(await valueOf(readIndex(join(home, "state", "context.sqlite"))), new Map(), []), new Map(), [])).toContain("No sessions indexed");
  }),
);

test.skipIf(!sqlite3)(
  skipReason(
    "it runs the `sqlite3` binary the index is kept in, so it runs only where sqlite3 is on PATH; the ci workflow installs a pinned one, a contributor's machine may not have it",
    "a row an older reader wrote for a file the reader now refuses is forgotten, a row whose file is gone is kept, and a file with no provider request is counted apart and left out",
    "local",
  ),
  () => inTemp(async (home) => {
    const db = join(home, "state", "context.sqlite");
    const claude = join(home, "claude");
    const subagent = join(claude, "project", "one", "subagents", "agent-a1.jsonl");
    mkdirSync(join(claude, "project", "one", "subagents"), { recursive: true });
    writeFileSync(subagent, "{}\n");
    const row = (path: string) => `INSERT INTO sessions VALUES ('${path}',3,'2026-09-26T00:00:00.000Z','claude-code','1.0','claude-code/test','/repo','2026-09-26T00:00:00Z',0,1);
INSERT INTO requests VALUES ('${path}',0,'2026-09-26T00:00:01Z',1,0,0,1);
INSERT INTO parts VALUES ('${path}','attachment:model','attachment',5);`;
    await valueOf(openIndex(db));
    await valueOf(sqlite(db, `${row(subagent)}\n${row(join(claude, "project", "gone.jsonl"))}\n${row(join(claude, "project", "empty.jsonl")).split("\n")[0]}`));

    writeFileSync(join(claude, "project", "stub.jsonl"), `${JSON.stringify({ type: "last-prompt", lastPrompt: "hello" })}\n`);

    const result = await valueOf(indexStored(db, { pi: join(home, "pi"), "claude-code": claude, codex: join(home, "codex") }));

    expect({ withoutRequest: result.withoutRequest, issues: result.issues }).toEqual({ withoutRequest: 1, issues: [] });

    expect((await valueOf(readIndex(db))).map((session) => ({ path: session.path, requests: session.requests.length, parts: session.parts.length }))).toEqual([
      { path: join(claude, "project", "gone.jsonl"), requests: 1, parts: 1 },
    ]);
    expect(await valueOf(sqlite(db, `SELECT count(*) AS n FROM parts WHERE path='${subagent}';`))).toContain('"n":0');
  }),
);

test.skipIf(!sqlite3)(
  skipReason(
    "it runs the `sqlite3` binary the index is kept in, so it runs only where sqlite3 is on PATH; the ci workflow installs a pinned one, a contributor's machine may not have it",
    "a row the previous reader wrote for an unchanged file with no provider request is dropped and the file counted as without a provider request",
    "local",
  ),
  () => inTemp(async (home) => {
    const db = join(home, "state", "context.sqlite");
    const claude = join(home, "claude");
    const stub = join(claude, "project", "stub.jsonl");
    mkdirSync(join(claude, "project"), { recursive: true });
    writeFileSync(stub, `${JSON.stringify({ type: "last-prompt", lastPrompt: "hello" })}\n`);
    const modified = new Date("2026-09-26T00:00:00.000Z");
    utimesSync(stub, modified, modified);
    await valueOf(openIndex(db));
    await valueOf(sqlite(db, `INSERT INTO sessions VALUES ('${stub}',${statSync(stub).size},'${modified.toISOString()}','claude-code','unknown','unknown','unknown','unknown',0,${READER_VERSION - 1});`));

    const result = await valueOf(indexStored(db, { pi: join(home, "pi"), "claude-code": claude, codex: join(home, "codex") }));

    expect({ unchanged: result.unchanged, withoutRequest: result.withoutRequest }).toEqual({ unchanged: 0, withoutRequest: 1 });
    expect(await valueOf(sqlite(db, `SELECT count(*) AS n FROM sessions WHERE path='${stub}';`))).toContain('"n":0');
  }),
);

test.skipIf(!sqlite3)(
  skipReason(
    "it runs the `sqlite3` binary the index is kept in, so it runs only where sqlite3 is on PATH; the ci workflow installs a pinned one, a contributor's machine may not have it",
    "an index an earlier reader wrote with tree-derived and fingerprint columns keeps every row, the one whose file is gone included, and takes the new reader's rows",
    "local",
  ),
  () => inTemp(async (home) => {
    const db = join(home, "state", "context.sqlite");
    const pi = join(home, "pi");
    mkdirSync(join(home, "state"), { recursive: true });
    mkdirSync(pi, { recursive: true });
    await valueOf(sqlite(db, `CREATE TABLE sessions(path TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, file_size INTEGER NOT NULL, modified TEXT NOT NULL, tool TEXT NOT NULL, version TEXT NOT NULL, model TEXT NOT NULL, repo TEXT NOT NULL, profile TEXT NOT NULL, at TEXT NOT NULL, first_message INTEGER NOT NULL, reader INTEGER NOT NULL DEFAULT 0, tree TEXT NOT NULL DEFAULT '');
INSERT INTO sessions VALUES ('${join(pi, "gone.jsonl")}','f',3,'2026-09-25T00:00:00.000Z','pi','unknown (session format 3)','openai/test','/repo','old','2026-09-25T00:00:00Z',0,${READER_VERSION - 1},'t');
CREATE TABLE requests(path TEXT NOT NULL, ordinal INTEGER NOT NULL, at TEXT NOT NULL, input INTEGER NOT NULL, cache_read INTEGER NOT NULL, cache_write INTEGER NOT NULL, output INTEGER NOT NULL, PRIMARY KEY(path, ordinal));
INSERT INTO requests VALUES ('${join(pi, "gone.jsonl")}',0,'2026-09-25T00:00:01Z',4,0,0,1);
CREATE TABLE parts(path TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL, chars INTEGER NOT NULL, fingerprint TEXT NOT NULL, PRIMARY KEY(path, name));
INSERT INTO parts VALUES ('${join(pi, "gone.jsonl")}','preamble','system',9,'f');`));
    writeFileSync(join(pi, "one.jsonl"), [
      JSON.stringify({ type: "session", version: 3, cwd: "/repo", timestamp: "2026-09-26T00:00:00Z" }),
      JSON.stringify({ type: "model_change", provider: "openai", modelId: "test" }),
      JSON.stringify({ type: "message", timestamp: "2026-09-26T00:00:01Z", message: { role: "assistant", usage: { input: 5, cacheRead: 0, cacheWrite: 0, output: 1 } } }),
    ].join("\n"));

    expect((await valueOf(indexStored(db, { pi, "claude-code": join(home, "claude"), codex: join(home, "codex") }))).indexed).toBe(1);

    expect((await valueOf(readIndex(db))).map((session) => ({ path: session.path, parts: session.parts.map((part) => part.name) }))).toEqual([{ path: join(pi, "one.jsonl"), parts: [] }, { path: join(pi, "gone.jsonl"), parts: ["preamble"] }]);
    expect(await valueOf(sqlite(db, "SELECT count(*) AS n FROM pragma_table_info('sessions') WHERE name IN ('fingerprint','profile','tree');"))).toContain('"n":0');
    expect(await valueOf(sqlite(db, "SELECT count(*) AS n FROM pragma_table_info('parts') WHERE name='fingerprint';"))).toContain('"n":0');
  }),
);

test.skipIf(!sqlite3)(
  skipReason(
    "it runs the `sqlite3` binary the index is kept in, so it runs only where sqlite3 is on PATH; the ci workflow installs a pinned one, a contributor's machine may not have it",
    "sessions are ordered by the instant they opened, so a whole-second opening comes before one a tenth of a second later",
    "local",
  ),
  () => inTemp(async (home) => {
    const db = join(home, "state", "context.sqlite");
    const pi = join(home, "pi");
    mkdirSync(pi, { recursive: true });
    const session = (name: string, at: string, input: number) => writeFileSync(join(pi, `${name}.jsonl`), [
      JSON.stringify({ type: "session", version: 3, cwd: "/repo", timestamp: at }),
      JSON.stringify({ type: "model_change", provider: "openai", modelId: "test" }),
      JSON.stringify({ type: "message", timestamp: at, message: { role: "assistant", usage: { input, cacheRead: 0, cacheWrite: 0, output: 1 } } }),
    ].join("\n"));
    session("whole", "2026-09-26T00:00:00Z", 5);
    session("tenth", "2026-09-26T00:00:00.100Z", 8);
    await valueOf(indexStored(db, { pi, "claude-code": join(home, "claude"), codex: join(home, "codex") }));

    const sessions = await valueOf(readIndex(db));

    expect(sessions.map((indexed) => indexed.at)).toEqual(["2026-09-26T00:00:00.100Z", "2026-09-26T00:00:00Z"]);
    const measured = measure(sessions, new Map(), []);
    expect(renderReport(measured, bridgesOf(measured), [])).toContain("Change since 2026-09-26T00:00:00Z: provider opening 3 exact tokens");
  }),
);

test.skipIf(!sqlite3)(
  skipReason(
    "it runs the `sqlite3` binary the index is kept in, so it runs only where sqlite3 is on PATH; the ci workflow installs a pinned one, a contributor's machine may not have it",
    "a session file that changes into one the reader refuses loses its earlier rows and is reported unreadable",
    "local",
  ),
  () => inTemp(async (home) => {
    const db = join(home, "state", "context.sqlite");
    const pi = join(home, "pi");
    const file = join(pi, "one.jsonl");
    mkdirSync(pi, { recursive: true });
    writeFileSync(file, [
      JSON.stringify({ type: "session", version: 3, cwd: "/repo", timestamp: "2026-09-26T00:00:00Z" }),
      JSON.stringify({ type: "model_change", provider: "openai", modelId: "test" }),
      JSON.stringify({ type: "message", timestamp: "2026-09-26T00:00:01Z", message: { role: "assistant", usage: { input: 5, cacheRead: 0, cacheWrite: 0, output: 1 } } }),
    ].join("\n"));
    const stores = { pi, "claude-code": join(home, "claude"), codex: join(home, "codex") };
    expect((await valueOf(indexStored(db, stores))).indexed).toBe(1);

    writeFileSync(file, '\n{"type":"message","timest', { flag: "a" });

    expect((await valueOf(indexStored(db, stores))).issues).toHaveLength(1);
    expect(await valueOf(readIndex(db))).toEqual([]);
    expect(await valueOf(sqlite(db, `SELECT (SELECT count(*) FROM sessions) + (SELECT count(*) FROM requests) + (SELECT count(*) FROM parts) AS n;`))).toContain('"n":0');
  }),
);

test.skipIf(!sqlite3)(
  skipReason(
    "it runs the `sqlite3` binary the index is kept in, so it runs only where sqlite3 is on PATH; the ci workflow installs a pinned one, a contributor's machine may not have it",
    "a batch longer than any single command-line argument reaches sqlite3 whole",
    "local",
  ),
  () => inTemp(async (home) => {
    const db = join(home, "long.sqlite");
    const rows = Array.from({ length: 3000 }, (_, row) => `INSERT INTO t VALUES (${row}, '${"x".repeat(400)}');`);
    // A row committed on its own costs an fsync, and 3000 of them outlast the test's timeout on a loaded machine.
    const batch = `CREATE TABLE t(n INTEGER, text TEXT);\nBEGIN;\n${rows.join("\n")}\nCOMMIT;\nSELECT count(*) AS n FROM t;`;
    expect(batch.length).toBeGreaterThan(1_200_000);
    expect(await valueOf(sqlite(db, batch))).toContain('"n":3000');
  }),
);

test.skipIf(!sqlite3)(
  skipReason(
    "it runs the `sqlite3` binary the index is kept in, so it runs only where sqlite3 is on PATH; the ci workflow installs a pinned one, a contributor's machine may not have it",
    "a batch that fails partway stops there and commits none of its statements",
    "local",
  ),
  () => inTemp(async (home) => {
    const db = join(home, "bail.sqlite");
    await valueOf(sqlite(db, "CREATE TABLE t(n INTEGER PRIMARY KEY);"));
    expect(await saidBy(sqlite(db, "BEGIN;\nINSERT INTO t VALUES (1);\nINSERT INTO t VALUES (1);\nINSERT INTO t VALUES (2);\nCOMMIT;"))).toContain("UNIQUE");
    expect(await valueOf(sqlite(db, "SELECT count(*) AS n FROM t;"))).toContain('"n":0');
  }),
);
