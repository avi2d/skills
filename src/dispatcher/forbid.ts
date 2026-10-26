import { SYNTAXES, refused } from "./comments";
import type { Harness } from "./harness";
import { proseRefused, readerOf } from "./prose";

export const FORBIDS = ["comments", "prose"] as const;
export type Forbid = (typeof FORBIDS)[number];

export const isForbid = (value: unknown): value is Forbid => FORBIDS.some((forbid) => forbid === value);

export type ClaudeEdit = { old: string; new: string; all: boolean };

export type CodexHunk = { old: string; new: string; atEnd?: boolean; context?: string };

export type Replacement = ClaudeEdit | CodexHunk;

// `text` gives nothing when there was no file to read, and `inRepository` gives the file's path from
// the root of the repository holding it, and nothing when none does.
export type Standing = { text: () => string | undefined; inRepository: () => string | undefined };

export type Change = { path: string; before: Standing } & ({ content: string } | { edits: readonly Replacement[] });

export type Located = Pick<Change, "path" | "before">;

export type Verdict = { refusals: string[] } | { unplaced: string };

type Matcher = {
  // Nothing when the matchers do not read the file.
  namedAs: (file: Located) => string | undefined;
  refuses: (path: string, after: string, added: ReadonlySet<number>) => string[];
};

const MATCHERS: Record<Forbid, Matcher> = {
  comments: {
    namedAs: ({ path }) => (Object.hasOwn(SYNTAXES, path.slice(path.lastIndexOf(".") + 1)) ? path : undefined),
    refuses: refused,
  },
  prose: {
    namedAs: ({ before }) => {
      const path = before.inRepository();
      return path !== undefined && readerOf(path) !== undefined ? path : undefined;
    },
    refuses: proseRefused,
  },
};

export const reads = (forbid: Forbid, file: Located): boolean => MATCHERS[forbid].namedAs(file) !== undefined;

const lf = (text: string): string => text.replaceAll("\r\n", "\n");

const withEndings = (text: string): string[] => text.match(/[^\n]*\n|[^\n]+/g) ?? [];

type Reading = (text: string) => string;

const same: Reading = (text) => text;

const lines =
  (read: Reading): Reading =>
  (text) =>
    text.split("\n").map(read).join("\n");

const punctuation: Reading = (text) =>
  text
    .replaceAll(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replaceAll(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replaceAll(/[\u2010-\u2015\u2212]/g, "-")
    .replaceAll(/[\u00A0\u2002-\u200A\u202F\u205F\u3000]/g, " ");

const fuzzy: Reading = (text) => punctuation(lines((line) => line.trimEnd())(text.normalize("NFKC")));

const straight: Reading = (text) => text.replaceAll(/[\u2018\u2019]/g, "'").replaceAll(/[\u201C\u201D]/g, '"');

const OPENERS = new Set([" ", "\t", "\n", "\r", "(", "[", "{", "\u2014", "\u2013"]);

const letter = (char: string | undefined): boolean => char !== undefined && /\p{L}/u.test(char);

function curled(now: string, held: string): string {
  const doubles = /[\u201C\u201D]/.test(held);
  const singles = /[\u2018\u2019]/.test(held);
  return now.replaceAll(/["']/g, (quote, at: number) => {
    const opens = at === 0 || OPENERS.has(now[at - 1] ?? "");
    if (quote === '"') return doubles ? (opens ? "\u201C" : "\u201D") : quote;
    if (!singles) return quote;
    if (letter(now[at - 1]) && letter(now[at + 1])) return "\u2019";
    return opens ? "\u2018" : "\u2019";
  });
}

type Span = { at: number; end: number; old: string; now: string };

type Found = { written: string; spans: Span[]; read: Reading };

// A string is why the harness would not apply the edits, said of any one of them.
type Placing = (held: string, edits: readonly Replacement[]) => Found | string;

const NOWHERE = "matches nothing in the file as it stands";

type Loose = {
  readings: readonly Reading[];
  lands: (now: string, held: string, old: string) => string;
  appends: (held: string) => boolean;
} & ({ inPlace: true } | { inPlace: false; counted: Reading });

const appended = (before: string, now: string): Span => ({
  at: before.length,
  end: before.length,
  old: "",
  now: before === "" || before.endsWith("\n") ? now : `\n${now}`,
});

const replacesAll = (edit: Replacement): boolean => "all" in edit && edit.all;

// Every edit is matched against the file as it stands and not against what an earlier edit made of it.
function matched(before: string, edits: readonly Replacement[], read: Reading): Span[] | undefined {
  const spans: Span[] = [];
  for (const edit of edits) {
    const now = lf(edit.new);
    if (edit.old === "") {
      spans.push(appended(before, now));
      continue;
    }
    const old = read(lf(edit.old));
    let at = before.indexOf(old);
    if (at < 0) return undefined;
    while (at >= 0) {
      spans.push({ at, end: at + old.length, old: lf(edit.old), now });
      at = replacesAll(edit) ? before.indexOf(old, at + old.length) : -1;
    }
  }
  return spans;
}

// pi writes each line an edit touches as its reading made it. Claude Code's reading maps every
// character to one, so it writes in the file's own bytes, curling the new text's quotes when the
// file's had to be straightened.
function loosely(loose: Loose): Placing {
  return (held, edits) => {
    if (edits.some((edit) => edit.old === "") && !loose.appends(held)) return "has no old text to find";
    for (const read of loose.readings) {
      const before = read(held);
      const spans = matched(before, edits, read);
      if (spans === undefined) continue;
      const count = loose.inPlace ? read : loose.counted;
      const copies = (old: string): number => count(held).split(count(lf(old))).length - 1;
      if (edits.some((edit) => edit.old !== "" && !replacesAll(edit) && copies(edit.old) > 1)) {
        return "matches more than one place in the file as it stands";
      }
      const written = loose.inPlace ? held : before;
      return { written, read, spans: spans.map((span) => ({ ...span, now: loose.lands(span.now, written.slice(span.at, span.end), span.old) })) };
    }
    return NOWHERE;
  };
}

const PASSES: readonly Reading[] = [same, (line) => line.trimEnd(), (line) => line.trim(), (line) => punctuation(line.trim())];

const linesOf = (text: string): string[] => withEndings(lf(text)).map((line) => (line.endsWith("\n") ? line.slice(0, -1) : line));

type Rows = { rows: string[]; starts: number[] };

type Sighted = { row: number; pass: number };

function rowsOf(held: string): Rows {
  const rows = held.split("\n");
  if (rows.at(-1) === "") rows.pop();
  const starts = [0];
  for (const row of rows) starts.push((starts.at(-1) ?? 0) + row.length + 1);
  return { rows, starts };
}

function sought(rows: readonly string[], pattern: readonly string[], from: number, atEnd = false): Sighted | undefined {
  const start = atEnd && rows.length >= pattern.length ? rows.length - pattern.length : from;
  for (const [pass, read] of PASSES.entries()) {
    for (let row = start; row + pattern.length <= rows.length; row++) {
      if (pattern.every((line, at) => read(rows[row + at] ?? "") === read(line))) return { row, pass };
    }
  }
  return undefined;
}

type Hunk = { pattern: string[]; replacing: string[]; found: Sighted };

function hunkAt(rows: readonly string[], pattern: string[], replacing: string[], cursor: number, atEnd?: boolean): Hunk | undefined {
  const found = sought(rows, pattern, cursor, atEnd);
  if (found !== undefined) return { pattern, replacing, found };
  if (pattern.at(-1) !== "") return undefined;
  const trimmed = pattern.slice(0, -1);
  const again = sought(rows, trimmed, cursor, atEnd);
  if (again === undefined) return undefined;
  return { pattern: trimmed, replacing: replacing.at(-1) === "" ? replacing.slice(0, -1) : replacing, found: again };
}

function hunkSpan(held: string, { rows, starts }: Rows, old: string, { pattern, replacing, found }: Hunk): Span {
  const last = found.row + pattern.length - 1;
  const end = replacing.length === 0 ? Math.min(starts[last + 1] ?? held.length, held.length) : (starts[last] ?? 0) + (rows[last] ?? "").length;
  return { at: starts[found.row] ?? 0, end, old: lf(old), now: replacing.join("\n") };
}

// Codex matches a hunk's old lines only against whole lines, from the line after the previous hunk or
// after the `@@` context line it names, trying every line with one pass before the next, looser pass;
// the lines it matched it replaces whole. A hunk's text is its lines, so "" is none and "\n" is one blank.
const hunked: Placing = (held, edits) => {
  const table = rowsOf(held);
  const spans: Span[] = [];
  let cursor = 0;
  let loosest = 0;
  for (const edit of edits) {
    const context = "context" in edit ? edit.context : undefined;
    if (context !== undefined) {
      const anchor = sought(table.rows, [context], cursor);
      if (anchor === undefined) return NOWHERE;
      cursor = anchor.row + 1;
    }
    const pattern = linesOf(edit.old);
    if (pattern.length === 0) {
      spans.push(appended(held, lf(edit.new)));
      continue;
    }
    const hunk = hunkAt(table.rows, pattern, linesOf(edit.new), cursor, "atEnd" in edit ? edit.atEnd : undefined);
    if (hunk === undefined) return NOWHERE;
    spans.push(hunkSpan(held, table, edit.old, hunk));
    cursor = hunk.found.row + hunk.pattern.length;
    loosest = Math.max(loosest, hunk.found.pass);
  }
  return { written: held, spans, read: lines(PASSES[loosest] ?? same) };
};

// The readings are the looser ones each harness tries, in its order, when an edit's exact text is not
// in the file, so an edit is never placed where its harness would not land it.
// pi counts an edit's copies under its loosest reading whichever reading placed it, and Claude Code
// under the one that did. pi applies no edit with no old text, and Claude Code none to a file that
// holds anything.
const PLACING: Record<Harness, Placing> = {
  pi: loosely({
    readings: [same, fuzzy],
    inPlace: false,
    lands: (now) => now,
    appends: () => false,
    counted: fuzzy,
  }),
  codex: hunked,
  "claude-code": loosely({
    readings: [same, straight],
    inPlace: true,
    lands: (now, held, old) => (held === old ? now : curled(now, held)),
    appends: (held) => held === "",
  }),
};

type Placed = { after: string; added: ReadonlySet<number> };

type Group = { first: number; last: number; spans: Span[] };

function lineStarts(text: string): number[] {
  const starts = [0];
  for (const line of withEndings(text)) starts.push((starts.at(-1) ?? 0) + line.length);
  return starts;
}

function groupsOf(spans: readonly Span[], starts: readonly number[]): Group[] {
  const lineOf = (at: number): number => {
    let line = 0;
    while (line < starts.length - 1 && (starts[line + 1] ?? 0) <= at) line++;
    return line;
  };
  const groups: Group[] = [];
  for (const span of spans) {
    const first = lineOf(span.at);
    const last = lineOf(Math.max(span.at, span.end - 1));
    const group = groups.at(-1);
    if (group !== undefined && first <= group.last) {
      group.last = Math.max(group.last, last);
      group.spans.push(span);
    } else groups.push({ first, last, spans: [span] });
  }
  return groups;
}

// `verbatim` maps the offset in `after` of each line kept whole to that line's index in `kept`.
function rebuilt(
  kept: readonly string[],
  written: string,
  starts: readonly number[],
  groups: readonly Group[],
): { after: string; verbatim: Map<number, number> } {
  let after = "";
  const verbatim = new Map<number, number>();
  const keep = (from: number, to: number): void => {
    for (let line = from; line < to; line++) {
      verbatim.set(after.length, line);
      after += kept[line] ?? "";
    }
  };
  let line = 0;
  for (const group of groups) {
    keep(line, group.first);
    let from = starts[group.first] ?? written.length;
    for (const span of group.spans) {
      after += written.slice(from, span.at) + span.now;
      from = span.end;
    }
    after += written.slice(from, starts[group.last + 1] ?? written.length);
    line = group.last + 1;
  }
  keep(line, kept.length);
  return { after, verbatim };
}

function addedIn(after: string, kept: readonly string[], verbatim: ReadonlyMap<number, number>, read: Reading): Set<number> {
  const bare = (row: string): string => read(row.endsWith("\n") ? row.slice(0, -1) : row);
  const added = new Set<number>();
  let replaced = 0;
  let run: Array<[string, number]> = [];
  const settle = (upTo: number): void => {
    for (const at of uncovered(kept.slice(replaced, upTo).map(bare), run)) added.add(at);
    run = [];
  };
  let offset = 0;
  for (const [at, row] of withEndings(after).entries()) {
    const was = verbatim.get(offset);
    if (was !== undefined && kept[was] === row) {
      settle(was);
      replaced = was + 1;
    } else run.push([bare(row), at + 1]);
    offset += row.length;
  }
  settle(kept.length);
  return added;
}

// `written` has as many lines as `held`, and the spans are sorted, apart, and offsets into `written`.
// Only the lines the edits replaced can cover one they wrote, so a copy elsewhere in the file, in a
// string for instance, never decides whether a line was added.
function landed(held: string, written: string, spans: readonly Span[], read: Reading): Placed {
  const kept = withEndings(held);
  const starts = lineStarts(written);
  const { after, verbatim } = rebuilt(kept, written, starts, groupsOf(spans, starts));
  return { after, added: addedIn(after, kept, verbatim, read) };
}

function placed(change: Change, harness: Harness): Placed | { unplaced: string } {
  const before = change.before.text();
  if ("content" in change) return { after: change.content, added: addedLines(before, change.content) };
  const [only, ...rest] = change.edits;
  const creates = harness === "claude-code" && only !== undefined && rest.length === 0 && only.old === "";
  if (before === undefined && !creates) return { unplaced: `${change.path} could not be read to place an edit in` };
  const held = lf(before ?? "");
  const found = PLACING[harness](held, change.edits);
  if (typeof found === "string") return { unplaced: `an edit to ${change.path} ${found}` };
  const { written, spans, read } = found;
  spans.sort((a, b) => a.at - b.at);
  if (spans.some((span, index) => span.at < (spans[index - 1]?.end ?? 0))) {
    return { unplaced: `two edits to ${change.path} overlap in the file as it stands` };
  }
  return landed(held, written, spans, read);
}

function uncovered(held: readonly string[], now: ReadonlyArray<readonly [line: string, at: number]>): number[] {
  const copies = new Map<string, number>();
  for (const line of held) copies.set(line, (copies.get(line) ?? 0) + 1);
  const out: number[] = [];
  for (const [line, at] of now) {
    const left = copies.get(line) ?? 0;
    if (left > 0) copies.set(line, left - 1);
    else out.push(at);
  }
  return out;
}

// A line is added when the file did not already hold that many copies of it, whatever its line
// ending, so a line a write only carries over is never counted as added.
export function addedLines(before: string | undefined, after: string): Set<number> {
  const numbered = after.split(/\r?\n/).map((line, at): [string, number] => [line, at + 1]);
  return new Set(uncovered(before?.split(/\r?\n/) ?? [], numbered));
}

export function judged(forbid: Forbid, harness: Harness, change: Change): Verdict {
  const matcher = MATCHERS[forbid];
  const named = matcher.namedAs(change);
  if (named === undefined) return { refusals: [] };
  const write = placed(change, harness);
  if ("unplaced" in write) return write;
  return { refusals: matcher.refuses(named, write.after, write.added) };
}
