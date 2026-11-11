import { existsSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve, sep } from "node:path";
import { unquote, type SplitStage } from "./rerun";

const UNRESOLVED = "$";

export const expandVars = (word: string, vars: Record<string, string>): string =>
  word.replace(/\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))/g, (found, braced: string | undefined, bare: string | undefined) =>
    vars[braced ?? bare ?? ""] ?? found);

const MKTEMP_ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)=("?)(?:\$\(|`)\s*mktemp((?:[ \t]+(?:"[^"]*"|'[^']*'|[^\s)`"';|&]+))*)[ \t]*(?:\)|`)\2(?=[ \t]*(?:$|[;&|)\n])|[ \t]+#)/;

const MKTEMP_FLAGS = new Set(["-d", "--directory", "-q", "--quiet", "-u", "--dry-run", "-t"]);

const splitCluster = (arg: string): string[] =>
  /^-[dqtu]+$/.test(arg) ? arg.slice(1).split("").map((flag) => `-${flag}`) : [arg];

const mktempDir = (args: readonly string[]): string | undefined => {
  const expanded = args.flatMap(splitCluster);
  if (!expanded.some((arg) => arg === "-d" || arg === "--directory")) return undefined;
  if (expanded.some((arg) => arg === "-u" || arg === "--dry-run")) return undefined;
  const templates = expanded.filter((arg) => !MKTEMP_FLAGS.has(arg));
  if (templates.some((arg) => arg.startsWith("-"))) return undefined;
  const [template, ...rest] = templates;
  if (rest.length > 0) return undefined;
  if (template === undefined) return tmpdir();
  if (!template.includes("/")) return expanded.includes("-t") ? tmpdir() : undefined;
  if (expanded.includes("-t")) return undefined;
  return template.startsWith("/") ? dirname(template) : undefined;
};

const mktempAssignment = (command: string, stage: SplitStage): { name: string; dir: string } | undefined => {
  const rest = command.slice(stage.start);
  const found = MKTEMP_ASSIGNMENT.exec(rest);
  if (found === null) return undefined;
  const args = [...(found[3] ?? "").matchAll(/"[^"]*"|'[^']*'|\S+/g)].map((arg) => unquote(arg[0]));
  return { name: found[1] ?? "", dir: mktempDir(args) ?? UNRESOLVED };
};

const tempRoots = (): string[] => {
  const roots = new Set<string>();
  for (const candidate of [tmpdir(), "/tmp", "/private/tmp"]) {
    try {
      roots.add(realpathSync(candidate));
    } catch {
    }
  }
  return [...roots];
};

export const underTemp = (cwd: string): boolean => {
  if (cwd.includes("$") || cwd.includes("`")) return false;
  try {
    const roots = tempRoots();
    try {
      const dir = realpathSync(resolve(cwd));
      return roots.some((root) => dir === root || dir.startsWith(root + sep));
    } catch {
      let base = resolve(cwd);
      for (;;) {
        if (existsSync(base)) {
          const dir = realpathSync(base);
          return roots.some((root) => dir === root || dir.startsWith(root + sep));
        }
        const parent = dirname(base);
        if (parent === base) return false;
        base = parent;
      }
    }
  } catch {
    return false;
  }
};

export const LEADING_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=.*/;

export const withoutEnv = (words: readonly string[]): readonly string[] => {
  let at = 0;
  while (at < words.length && LEADING_ASSIGNMENT.test(words[at] ?? "")) at += 1;
  return words.slice(at);
};

const ASSIGN_WORD = /^([A-Za-z_][A-Za-z0-9_]*)=/;
const COMPOUND_WORDS = new Set(["if", "then", "else", "elif", "fi", "while", "until", "for", "select", "do", "done", "case", "esac", "function", "coproc", "time", "{", "}", "!", "source", "eval", "."]);

export const openGap = (gap: string, inside: readonly boolean[], base: number): string => {
  let seen = "";
  for (let o = 0; o < gap.length; o += 1) {
    if (inside[base + o] !== true) seen += gap[o];
  }
  return seen;
};

const flatCommand = (stages: readonly SplitStage[], command: string, inside: readonly boolean[]): boolean => {
  for (const stage of stages) {
    const head = withoutEnv(stage.words)[0];
    if (head !== undefined && COMPOUND_WORDS.has(head)) return false;
    const base = stage.start - stage.gap.length;
    for (let o = 0; o < stage.gap.length; o += 1) {
      const at = base + o;
      if (inside[at] === true) continue;
      if (stage.gap[o] === "(" && command[at - 1] !== "$") return false;
    }
    if (/[|&]/.test(openGap(stage.gap, inside, base).replace(/&&|&>|>&/g, ""))) return false;
  }
  return true;
};

const wordMentionsName = (word: string, name: string): boolean =>
  word === name || word.startsWith(name + "=") || word.startsWith(name + "+=") || word.startsWith(name + "[");


const LITERAL_TEMP_FORBIDDEN = /[$`*?[]/;

const literalTempDir = (first: SplitStage): { name: string; dir: string } | undefined => {
  if (first.words.length !== 1) return undefined;
  const found = ASSIGN_WORD.exec(first.words[0] ?? "");
  if (found === null) return undefined;
  const value = (first.words[0] ?? "").slice(found[0].length);
  if (!value.startsWith("/") || LITERAL_TEMP_FORBIDDEN.test(value)) return undefined;
  if (!underTemp(value)) return undefined;
  return { name: found[1] ?? "", dir: value };
};

const firstShapeAssignment = (stages: readonly SplitStage[], command: string): { name: string; dir: string } | undefined => {
  const first = stages[0];
  if (first === undefined) return undefined;
  const made = mktempAssignment(command, first);
  if (made !== undefined) {
    if (made.dir === UNRESOLVED) return undefined;
    return { name: made.name, dir: made.dir };
  }
  return literalTempDir(first);
};

const soleFirstAssignment = (stages: readonly SplitStage[], name: string): { stage: number; word: number } | undefined => {
  let seen = 0;
  let only = { stage: -1, word: -1 };
  for (let index = 0; index < stages.length; index += 1) {
    const words = stages[index]?.words ?? [];
    for (let at = 0; at < words.length; at += 1) {
      if (ASSIGN_WORD.exec(words[at] ?? "")?.[1] === name) {
        seen += 1;
        only = { stage: index, word: at };
      }
    }
  }
  if (seen !== 1 || only.stage !== 0) return undefined;
  return only;
};

const mentionsNameElsewhere = (stages: readonly SplitStage[], name: string, only: { stage: number; word: number }): boolean => {
  for (let s = 0; s < stages.length; s += 1) {
    const words = stages[s]?.words ?? [];
    for (let w = 0; w < words.length; w += 1) {
      if (s === only.stage && w === only.word) continue;
      if (wordMentionsName(words[w] ?? "", name)) return true;
    }
  }
  return false;
};

export const shapeVar = (stages: readonly SplitStage[], command: string, inside: readonly boolean[]): Record<string, string> => {
  if (!flatCommand(stages, command, inside)) return {};
  const resolved = firstShapeAssignment(stages, command);
  if (resolved === undefined) return {};
  const only = soleFirstAssignment(stages, resolved.name);
  if (only === undefined) return {};
  if (mentionsNameElsewhere(stages, resolved.name, only)) return {};
  return { [resolved.name]: resolved.dir };
};
export const andOnly = (gap: string, inside: readonly boolean[], base: number): boolean => {
  const seen = openGap(gap, inside, base);
  return seen.includes("&&") && !seen.includes(";") && !seen.includes("||") && !seen.includes("\n");
};
