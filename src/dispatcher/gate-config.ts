import type { Check } from "./verdict";

const CHECKS: ReadonlyArray<Check["name"]> = ["test", "lint"];

type Declared = { allowRepoCommands: boolean; commands: Partial<Record<Check["name"], string>> };

export type Unreadable = { unreadable: string };

const ENTRY = /^([A-Za-z_][\w-]*)[ \t]*:(?:[ \t]+(.*))?$/;

const BLOCK = /^([|>])([-+]?)[ \t]*(#.*)?$/;

const indentOf = (line: string): number => line.length - line.trimStart().length;

const blank = (line: string): boolean => /^\s*(#.*)?$/.test(line);

type Scalar = { value: string | undefined; next: number } | Unreadable;

const ESCAPES: Readonly<Record<string, string>> = { "\\": "\\", '"': '"', "/": "/", n: "\n", t: "\t" };

function singleQuoted(rest: string): string | Unreadable {
  const closed = /^'((?:[^']|'')*)'[ \t]*(#.*)?$/.exec(rest);
  return closed ? (closed[1] ?? "").replace(/''/g, "'") : { unreadable: "holds a single-quoted value that does not close on its line" };
}

function doubleQuoted(rest: string): string | Unreadable {
  const closed = /^"((?:[^"\\]|\\.)*)"[ \t]*(#.*)?$/.exec(rest);
  if (!closed) return { unreadable: "holds a double-quoted value that does not close on its line" };
  const body = closed[1] ?? "";
  let out = "";
  for (let at = 0; at < body.length; at += 1) {
    const char = body.charAt(at);
    if (char !== "\\") {
      out += char;
      continue;
    }
    const escaped = ESCAPES[body[at + 1] ?? ""];
    if (escaped === undefined) return { unreadable: `holds an escape, \\${body[at + 1] ?? ""}, this reader does not decode` };
    out += escaped;
    at += 1;
  }
  return out;
}

function flowScalar(rest: string): string | undefined | Unreadable {
  if (rest === "" || rest.startsWith("#")) return undefined;
  if (rest.startsWith("'")) return singleQuoted(rest);
  if (rest.startsWith('"')) return doubleQuoted(rest);
  if (/^[[{&*!%@`|>]/.test(rest)) return { unreadable: `holds a value, ${JSON.stringify(rest)}, in a form this reader does not decode` };
  return rest.replace(/[ \t]+#.*$/, "").trim();
}

function blockLines(lines: readonly string[], folded: boolean): string[] | Unreadable {
  const content: string[] = [];
  let depth: number | undefined;
  for (const line of lines) {
    if (line.trim() === "") {
      content.push("");
      continue;
    }
    const indent = indentOf(line);
    depth ??= indent;
    if (indent < depth) return { unreadable: "holds a block value indented less than its first line" };
    if (folded && indent > depth) return { unreadable: "holds a folded value with a more-indented line" };
    content.push(line.slice(depth));
  }
  while (content.length > 0 && content[content.length - 1] === "") content.pop();
  return content;
}

const fold = (content: readonly string[]): string =>
  content.reduce((folded, line) => (line === "" ? `${folded}\n` : folded === "" || folded.endsWith("\n") ? folded + line : `${folded} ${line}`), "");

function blockScalar(lines: readonly string[], at: number, parent: number, literal: boolean): Scalar {
  const end = lines.findIndex((line, index) => index > at && line.trim() !== "" && indentOf(line) <= parent);
  const next = end === -1 ? lines.length : end;
  const content = blockLines(lines.slice(at + 1, next), !literal);
  if (!Array.isArray(content)) return content;
  return { value: literal ? content.join("\n") : fold(content), next };
}

function scalarAt(lines: readonly string[], at: number, rest: string, parent: number): Scalar {
  const block = BLOCK.exec(rest);
  if (block) return blockScalar(lines, at, parent, block[1] === "|");
  const value = flowScalar(rest);
  if (typeof value === "object") return value;
  const following = lines.slice(at + 1).find((line) => !blank(line));
  if (following !== undefined && indentOf(following) > parent) {
    return { unreadable: "holds a value that runs onto the next line, which this reader does not decode" };
  }
  return { value, next: at + 1 };
}

function allowRepoCommandsOf(rest: string): boolean | Unreadable {
  const value = flowScalar(rest);
  if (typeof value === "object") return { unreadable: `allow_repo_commands ${value.unreadable}` };
  if (value !== undefined && !/^(true|True|TRUE|false|False|FALSE)$/.test(value)) {
    return { unreadable: `sets allow_repo_commands to ${JSON.stringify(value)}, which is neither true nor false` };
  }
  return value?.toLowerCase() === "true";
}

function topLevel(line: string): { key: string | undefined; allowRepoCommands?: boolean } | Unreadable {
  const entry = ENTRY.exec(line);
  if (!entry) return { unreadable: `has a top-level line, ${JSON.stringify(line)}, this reader does not decode` };
  const [, key, rest = ""] = entry;
  if (key === "commands" && flowScalar(rest) !== undefined) return { unreadable: "declares commands in a form other than a block mapping" };
  if (key !== "allow_repo_commands") return { key };
  const allowRepoCommands = allowRepoCommandsOf(rest);
  return typeof allowRepoCommands === "boolean" ? { key, allowRepoCommands } : allowRepoCommands;
}

type Command = { name: Check["name"]; value: string | undefined; next: number };

function commandAt(lines: readonly string[], at: number, line: string, child: number): Command | Unreadable | undefined {
  if (indentOf(line) < child) return { unreadable: "indents the entries under commands inconsistently" };
  const entry = ENTRY.exec(line.trimStart());
  if (!entry) return { unreadable: `has a line under commands, ${JSON.stringify(line.trim())}, this reader does not decode` };
  const [, key = "", rest = ""] = entry;
  const name = CHECKS.find((check) => check === key);
  if (name === undefined) return undefined;
  const scalar = scalarAt(lines, at, rest, child);
  if ("unreadable" in scalar) return { unreadable: `commands.${name} ${scalar.unreadable}` };
  return { name, ...scalar };
}

const skipped = (line: string): boolean => blank(line) || line === "---" || line === "...";

function commandsUnder(lines: readonly string[], from: number): Command[] | Unreadable {
  const read: Command[] = [];
  let child: number | undefined;
  let resume = from + 1;
  for (const [at, line] of lines.entries()) {
    if (at < resume || skipped(line)) continue;
    const indent = indentOf(line);
    if (indent === 0) break;
    if (child !== undefined && indent > child) continue;
    child ??= indent;
    const command = commandAt(lines, at, line, child);
    if (command === undefined) continue;
    if ("unreadable" in command) return command;
    read.push(command);
    resume = command.next;
  }
  return read;
}

function withCommands(commands: Declared["commands"], read: readonly Command[]): Declared["commands"] {
  const out = { ...commands };
  for (const { name, value } of read) {
    if (value === undefined) delete out[name];
    else out[name] = value;
  }
  return out;
}

export function readConfig(text: string): Declared | Unreadable {
  const lines = text.split(/\r?\n/);
  let commands: Declared["commands"] = {};
  let allowRepoCommands = false;
  for (const [at, line] of lines.entries()) {
    if (skipped(line) || indentOf(line) > 0) continue;
    const top = topLevel(line);
    if ("unreadable" in top) return top;
    allowRepoCommands = top.allowRepoCommands ?? allowRepoCommands;
    if (top.key !== "commands") continue;
    const under = commandsUnder(lines, at);
    if (!Array.isArray(under)) return under;
    commands = withCommands(commands, under);
  }
  return { allowRepoCommands, commands };
}

export const checksOf = (declared: Declared): Check[] =>
  CHECKS.flatMap((name) => {
    const command = declared.commands[name]?.trim();
    return command ? [{ name, command }] : [];
  });
