import { tmpdir } from "node:os";
import { dirname } from "node:path";
import { unquote, type SplitStage } from "./rerun";

export const UNRESOLVED = "$";

export const expandVars = (word: string, vars: Record<string, string>): string =>
  word.replace(/\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))/g, (found, braced: string | undefined, bare: string | undefined) =>
    vars[braced ?? bare ?? ""] ?? found);

const MKTEMP_ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)=("?)(?:\$\(|`)\s*mktemp((?:[ \t]+(?:"[^"]*"|'[^']*'|[^\s)`"';|&]+))*)[ \t]*(?:\)|`)\2(?=[ \t]*(?:$|[;&|)\n]))/;

const MKTEMP_FLAGS = new Set(["-d", "--directory", "-q", "--quiet", "-u", "--dry-run", "-t"]);

const mktempDir = (args: readonly string[]): string | undefined => {
  if (!args.some((arg) => arg === "-d" || arg === "--directory")) return undefined;
  if (args.some((arg) => arg === "-u" || arg === "--dry-run")) return undefined;
  const templates = args.filter((arg) => !MKTEMP_FLAGS.has(arg));
  if (templates.some((arg) => arg.startsWith("-"))) return undefined;
  const [template, ...rest] = templates;
  if (rest.length > 0) return undefined;
  if (template === undefined) return tmpdir();
  if (!template.includes("/")) return args.includes("-t") ? tmpdir() : undefined;
  if (args.includes("-t")) return undefined;
  return template.startsWith("/") ? dirname(template) : undefined;
};

export const mktempAssignment = (command: string, stage: SplitStage): { name: string; dir: string; piped: boolean } | undefined => {
  const rest = command.slice(stage.start);
  const found = MKTEMP_ASSIGNMENT.exec(rest);
  if (found === null) return undefined;
  const args = [...(found[3] ?? "").matchAll(/"[^"]*"|'[^']*'|\S+/g)].map((arg) => unquote(arg[0]));
  const piped = /^[ \t]*\|(?!\|)/.test(rest.slice(found[0].length));
  return { name: found[1] ?? "", dir: mktempDir(args) ?? UNRESOLVED, piped };
};
