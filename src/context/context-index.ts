import { homedir } from "node:os";
import { Effect, Option, Result, Schema, Stream, type FileSystem } from "effect";
import { ChildProcess, type ChildProcessSpawner } from "effect/process";
import { FetchFailed, type FileFailure } from "../platform/failures";
import { attempt, filesUnder, outputOf, unlessAbsent } from "../platform/files";
import { parseSession, READER_VERSION, TOOLS, type Part, type Session, type Tool, type Usage } from "./context-reader";
import { main } from "../platform/platform";
import { readLog, type Log } from "../report/dispatch-report";
import { HOLDING, isCarriage, RULE_BODY, RULE_PREFIX, RULE_PREVIEW } from "./context-records";

export const stateDir = (env: Readonly<Record<string, string | undefined>>): string =>
  `${env.XDG_STATE_HOME ?? `${env.HOME ?? homedir()}/.local/state`}/skills`;
export const databaseIn = (state: string): string => `${state}/context.sqlite`;
export const STORE: Record<Tool, string> = {
  pi: `${homedir()}/.pi/agent/sessions`,
  "claude-code": `${homedir()}/.claude/projects`,
  codex: `${homedir()}/.codex/sessions`,
};

const INDEX_SCHEMA = `CREATE TABLE IF NOT EXISTS sessions(path TEXT PRIMARY KEY, file_size INTEGER NOT NULL, modified TEXT NOT NULL, tool TEXT NOT NULL, version TEXT NOT NULL, model TEXT NOT NULL, repo TEXT NOT NULL, at TEXT NOT NULL, first_message INTEGER NOT NULL, reader INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS requests(path TEXT NOT NULL, ordinal INTEGER NOT NULL, at TEXT NOT NULL, input INTEGER NOT NULL, cache_read INTEGER NOT NULL, cache_write INTEGER NOT NULL, output INTEGER NOT NULL, PRIMARY KEY(path, ordinal));
CREATE TABLE IF NOT EXISTS parts(path TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL, chars INTEGER NOT NULL, PRIMARY KEY(path, name));`;

const quote = (value: string): string => `'${value.replaceAll("'", "''")}'`;
const Stored = Schema.Struct({ path: Schema.String, file_size: Schema.Number, modified: Schema.String, reader: Schema.Number });
const RETIRED_COLUMNS = { sessions: ["fingerprint", "profile", "tree"], parts: ["fingerprint"] };
const Columns = Schema.Array(Schema.Struct({ name: Schema.String }));

export const sqlite = Effect.fnUntraced(function* (db: string, sql: string): Effect.fn.Return<string, FetchFailed, ChildProcessSpawner.ChildProcessSpawner> {
  const result = yield* outputOf(ChildProcess.make("sqlite3", ["-bail", "-json", db], { stdin: Stream.make(new TextEncoder().encode(sql)) })).pipe(
    Effect.mapError((cause) => new FetchFailed({ message: `sqlite3 ${db}: ${cause.message}` })),
  );
  if (result.code !== 0) return yield* new FetchFailed({ message: `sqlite3 ${db}: ${result.stderr.trim()}` });
  return result.stdout;
});

export const readRows = <A, E>(db: string, sql: string, schema: Schema.Codec<A, E>): Effect.Effect<A, FetchFailed, ChildProcessSpawner.ChildProcessSpawner> =>
  Effect.gen(function* () {
    const text = yield* sqlite(db, sql);
    return yield* Schema.decodeUnknownEffect(Schema.fromJsonString(schema))(text || "[]").pipe(
      Effect.mapError((error) => new FetchFailed({ message: `sqlite3 ${db}: ${error.message}` })),
    );
  });

export const readBefore = (row: typeof Stored.Type | undefined, fileSize: number, modified: string): boolean =>
  row !== undefined && row.reader === READER_VERSION && modified !== "unknown" && row.file_size === fileSize && row.modified === modified;

export const openIndex = Effect.fnUntraced(function* (db: string): Effect.fn.Return<void, FetchFailed | FileFailure, FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner> {
  yield* attempt(db, (fs) => fs.makeDirectory(db.slice(0, db.lastIndexOf("/")), { recursive: true }));
  yield* sqlite(db, INDEX_SCHEMA);
  const columns = yield* readRows(db, "PRAGMA table_info(sessions);", Columns);
  if (!columns.some((column) => column.name === "reader")) yield* sqlite(db, "ALTER TABLE sessions ADD COLUMN reader INTEGER NOT NULL DEFAULT 0;");
  for (const [table, retired] of Object.entries(RETIRED_COLUMNS)) {
    const present = yield* readRows(db, `PRAGMA table_info(${table});`, Columns);
    for (const name of retired) if (present.some((column) => column.name === name)) yield* sqlite(db, `ALTER TABLE ${table} DROP COLUMN ${name};`);
  }
});

const forget = (path: string): string => `DELETE FROM requests WHERE path=${path}; DELETE FROM parts WHERE path=${path}; DELETE FROM sessions WHERE path=${path};`;

const insertSession = (session: Session, fileSize: number, modified: string): string => {
  const path = quote(session.path);
  const record = `INSERT INTO sessions(path,file_size,modified,tool,version,model,repo,at,first_message,reader) VALUES (${path},${fileSize},${quote(modified)},${quote(session.tool)},${quote(session.version)},${quote(session.model)},${quote(session.repo)},${quote(session.at)},${session.firstMessage},${READER_VERSION});`;
  const requests = session.requests.map((usage: Usage, ordinal) =>
    `INSERT INTO requests VALUES (${path},${ordinal},${quote(usage.at)},${usage.input},${usage.cacheRead},${usage.cacheWrite},${usage.output});`).join("\n");
  const parts = session.parts.map((p: Part) =>
    `INSERT OR REPLACE INTO parts(path,name,kind,chars) VALUES (${path},${quote(p.name)},${quote(p.kind)},${p.chars});`).join("\n");
  return `BEGIN; ${forget(path)} ${record}\n${requests}\n${parts}\nCOMMIT;`;
};

export const isSession = (tool: Tool, rel: string): boolean =>
  rel.endsWith(".jsonl") && !(tool === "claude-code" && rel.split("/").includes("subagents"));

export const sessionNamed = (path: string, session: string): boolean => {
  const name = path.split(/[\\/]/).pop() ?? path;
  return session === name || name.includes(session);
};

export function openingParts(session: Session, log: Log): Part[] {
  const first = session.requests[0];
  if (!first) return [...session.parts];
  const reached = [...new Set(log.entries.filter((entry) =>
    sessionNamed(session.path, entry.session) && entry.at <= Date.parse(first.at) && entry.said.kind === "reached")
    .flatMap((entry) => entry.said.kind === "reached" ? [entry.said.rule] : []))];
  if (session.parts.some((part) => isCarriage(part.kind))) {
    const rules = reached.join(", ");
    const holding = (part: Part): string => {
      if (reached.length === 0) return "";
      return part.kind === RULE_PREVIEW ? `${HOLDING}a preview of the carriage for ${rules}` : `${HOLDING}${rules}`;
    };
    return session.parts.map((part) => isCarriage(part.kind) ? { ...part, name: `${part.name}${holding(part)}` } : part);
  }
  return [...session.parts, ...reached.map((rule) => ({ name: `${RULE_PREFIX}${rule}`, kind: RULE_BODY, chars: 0 }))];
}

type FileOutcome = { readonly kind: "indexed" | "unchanged" | "withoutRequest" } | { readonly kind: "unreadable"; readonly issue: string };

const indexFile = Effect.fnUntraced(function* (
  db: string,
  tool: Tool,
  path: string,
  row: typeof Stored.Type | undefined,
  log: Log,
): Effect.fn.Return<FileOutcome, FetchFailed | FileFailure, FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner> {
  const info = yield* attempt(path, (fs) => fs.stat(path));
  const modified = Option.match(info.mtime, { onNone: () => "unknown", onSome: (date) => date.toISOString() });
  if (readBefore(row, Number(info.size), modified)) return { kind: "unchanged" };
  const text = yield* attempt(path, (fs) => fs.readFileString(path));
  const parsed = yield* Effect.result(parseSession(tool, path, text));
  if (Result.isSuccess(parsed) && parsed.success.requests.length > 0) {
    yield* sqlite(db, insertSession({ ...parsed.success, parts: openingParts(parsed.success, log) }, Number(info.size), modified));
    return { kind: "indexed" };
  }
  if (row !== undefined) yield* sqlite(db, `BEGIN; ${forget(quote(path))} COMMIT;`);
  return Result.isFailure(parsed) ? { kind: "unreadable", issue: parsed.failure.message } : { kind: "withoutRequest" };
});

export const indexStored = Effect.fnUntraced(function* (
  db: string,
  stores: Readonly<Record<Tool, string>>,
  log: Log = { entries: [], unreadable: [] },
): Effect.fn.Return<{ indexed: number; unchanged: number; withoutRequest: number; issues: string[] }, FetchFailed | FileFailure, FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner> {
  yield* openIndex(db);
  const previous = yield* readRows(db, "SELECT path,file_size,modified,reader FROM sessions;", Schema.Array(Stored));
  const existing = new Map(previous.map((record) => [record.path, record]));
  const counts = { indexed: 0, unchanged: 0, withoutRequest: 0 };
  const issues: string[] = [];
  for (const tool of TOOLS) {
    const root = stores[tool];
    const paths = yield* filesUnder(root).pipe(unlessAbsent);
    const files = Option.getOrElse(paths, (): string[] => []).map((rel) => ({ rel, path: `${root}/${rel}` }));
    const refused = files.filter(({ rel, path }) => !isSession(tool, rel) && existing.has(path));
    yield* sqlite(db, `BEGIN; ${refused.map(({ path }) => forget(quote(path))).join(" ")} COMMIT;`);
    for (const { rel, path } of files) {
      if (!isSession(tool, rel)) continue;
      const outcome = yield* indexFile(db, tool, path, existing.get(path), log);
      if (outcome.kind === "unreadable") issues.push(outcome.issue);
      else counts[outcome.kind] += 1;
    }
  }
  return { ...counts, issues };
});

if (import.meta.main) {
  main(Effect.gen(function* () {
    const state = stateDir(process.env);
    const database = databaseIn(state);
    if (process.argv.includes("--rebuild")) yield* attempt(database, (fs) => fs.remove(database, { force: true }));
    const logPath = `${state}/dispatch.log`;
    const logText = yield* attempt(logPath, (fs) => fs.readFileString(logPath)).pipe(unlessAbsent);
    const log = readLog(Option.getOrElse(logText, () => ""));
    const result = yield* indexStored(database, STORE, log);
    for (const issue of result.issues) console.error(issue);
    console.log(`${result.indexed} sessions indexed, ${result.unchanged} unchanged, ${result.withoutRequest} without a provider request, ${result.issues.length} unreadable`);
  }));
}
