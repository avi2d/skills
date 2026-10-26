import { stripVTControlCharacters } from "node:util";
import type { Theme, ThemeColor } from "@earendil-works/pi-coding-agent";

export type Role = "error" | "warning" | "success" | "added" | "removed" | "link" | "text";

export type Span = { readonly role: Role; readonly text: string };

export type Scheme = "meaning" | "links" | "paths";

export type OutputTheme = Pick<Theme, "fg">;

const ROLE_COLOR = {
  error: "error",
  warning: "warning",
  success: "success",
  added: "toolDiffAdded",
  removed: "toolDiffRemoved",
  link: "mdLink",
  text: "text",
} as const satisfies Record<Role, ThemeColor>;

const LINK =
  /(?<![\w.~/@+-])(?:[a-z][a-z\d+.-]*:\/\/[^\s'"<>()[\]{}]+|(?:~|\.\.?)?\/[\w.@+-]+(?:\/[\w.@+-]*)*|[\w.@+-]+(?:\/[\w.@+-]+)+\/?|[\w.@+-]+\/(?![\w.@+-])|[\w.@+-]+\.[A-Za-z]\w*(?=:\d))(?::\d+(?::\d+)?)?/gi;
const ROOTED = /^(?:[a-z][a-z\d+.-]*:\/\/|~?\/|\.\.?\/)/i;
const TRAILING_PUNCTUATION = /[.,;:!?]+$/;
const LINE_AND_COLUMN = /(?::\d+)+$/;

// A bare `a/b` is as often prose, such as and/or, as a path, so a relative one needs a second slash, an extension or a trailing slash, and a bare file name a line number.
function isLink(text: string): boolean {
  if (ROOTED.test(text)) return true;
  const path = text.replace(LINE_AND_COLUMN, "");
  if (!/^[^/]*[A-Za-z_]/.test(path)) return false;
  if (!path.includes("/")) return path !== text;
  return /\/.*\//.test(path) || /\.[A-Za-z]\w*$/.test(path) || path.endsWith("/");
}

function linkSpans(line: string): Span[] {
  const spans: Span[] = [];
  let at = 0;
  for (const match of line.matchAll(LINK)) {
    const text = match[0].replace(TRAILING_PUNCTUATION, "");
    if (!isLink(text)) continue;
    if (match.index > at) spans.push({ role: "text", text: line.slice(at, match.index) });
    spans.push({ role: "link", text });
    at = match.index + text.length;
  }
  if (at < line.length) spans.push({ role: "text", text: line.slice(at) });
  return spans;
}

const NOTHING_WRONG = /\b(?:0|no|zero)\s+(?:errors?|warnings?|fail(?:s|ed|ures?)?|problems?|issues?)\b/gi;
const ERROR =
  /\b(?:errors?|fail(?:s|ed|ing|ures?)?|fatal|panic(?:ked)?|exception|traceback|denied|refused|not ok|no such file|not found|exited with code [1-9]\d*|timed out|aborted)\b|\bERR!|[✗✘]/i;
const WARNING = /\b(?:warn(?:ing|ings)?|deprecat(?:ed|ion)|truncated|showing lines)\b|⚠/i;
const SUCCESS = /\b(?:ok|pass(?:es|ed|ing)?|success(?:ful|fully)?|succeeded)\b|[✓✔]/i;

function meaning(said: string): Role {
  const claims = said.replace(NOTHING_WRONG, "");
  if (ERROR.test(claims)) return "error";
  if (WARNING.test(claims)) return "warning";
  return SUCCESS.test(claims) ? "success" : "text";
}

// A path such as src/errors.ts is no claim about the run, so only the words around the links decide a line's role.
export function classifyLine(line: string, scheme: Scheme): Span[] {
  if (scheme === "paths") return line ? [{ role: "link", text: line }] : [];
  const spans = linkSpans(line);
  if (scheme === "links") return spans;
  const role = meaning(
    spans
      .filter((span) => span.role === "text")
      .map((span) => span.text)
      .join(" "),
  );
  return role === "text" ? spans : [{ role, text: line }];
}

const HUNK = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/;

// A leading minus outside a hunk is ls's permission column or a list bullet, and inside one `--- x` is a removed line, so only the line counts a hunk header declares decide what a sign means.
function diffRoles(lines: readonly string[]): ReadonlyArray<Role | undefined> {
  let removing = 0;
  let adding = 0;
  return lines.map((line) => {
    const hunk = HUNK.exec(line);
    if (hunk) {
      removing = Number(hunk[1] ?? 1);
      adding = Number(hunk[2] ?? 1);
      return undefined;
    }
    if (removing > 0 && line.startsWith("-")) {
      removing -= 1;
      return "removed";
    }
    if (adding > 0 && line.startsWith("+")) {
      adding -= 1;
      return "added";
    }
    if (removing > 0 && adding > 0 && line.startsWith(" ")) {
      removing -= 1;
      adding -= 1;
    } else if (!line.startsWith("\\")) {
      removing = 0;
      adding = 0;
    }
    return undefined;
  });
}

export function classifyOutput(output: string, scheme: Scheme): Span[][] {
  const lines = output.split("\n");
  const roles = scheme === "meaning" ? diffRoles(lines) : [];
  return lines.map((line, at) => {
    const role = roles[at];
    return role ? [{ role, text: line }] : classifyLine(line, scheme);
  });
}

export function paintOutput(output: string, theme: OutputTheme, scheme: Scheme): string {
  return classifyOutput(output, scheme)
    .map((spans) => spans.map(({ role, text }) => theme.fg(ROLE_COLOR[role], text)).join(""))
    .join("\n");
}

const isPrintable = (code: number): boolean => (code > 0x1f || code === 0x09 || code === 0x0a) && (code < 0xfff9 || code > 0xfffb);

export function cleanOutput(text: string): string {
  let printable = "";
  for (const char of stripVTControlCharacters(text)) if (isPrintable(char.codePointAt(0) ?? 0)) printable += char;
  return printable.replace(/^(?:[^\S\n]*\n)+/, "").trimEnd();
}
