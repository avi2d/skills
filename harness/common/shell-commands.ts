import { resolve } from "node:path";
import { segments, type Word } from "./shell-words";
export { segments };
export { compileGlob } from "./glob";

type Wrapper = { runs: readonly string[]; values: readonly string[]; operands: number };

const WRAPPERS: readonly Wrapper[] = [
  { runs: ["env"], values: ["-u", "--unset", "-C", "--chdir"], operands: 0 },
  { runs: ["time"], values: ["-f", "--format", "-o", "--output"], operands: 0 },
  { runs: ["nice"], values: ["-n", "--adjustment"], operands: 0 },
  { runs: ["nohup"], values: [], operands: 0 },
  { runs: ["timeout"], values: ["-s", "--signal", "-k", "--kill-after"], operands: 1 },
  { runs: ["bunx"], values: ["-p", "--package"], operands: 0 },
  { runs: ["npx"], values: ["-p", "--package"], operands: 0 },
  { runs: ["bun", "x"], values: ["-p", "--package"], operands: 0 },
  { runs: ["pnpm", "exec"], values: ["-C", "--dir", "-F", "--filter", "--resume-from"], operands: 0 },
  { runs: ["npm", "exec"], values: ["-p", "--package"], operands: 0 },
  { runs: ["pnpm", "dlx"], values: ["--package", "--allow-build"], operands: 0 },
];

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

export const startsWith = (words: readonly string[], prefix: readonly string[]): boolean => prefix.every((word, at) => words[at] === word);

export const program = (word: string): string => word.slice(word.lastIndexOf("/") + 1);

function pastWrapper(words: readonly string[], { runs, values, operands }: Wrapper): string[] {
  let left = operands;
  for (let at = runs.length; at < words.length; at += 1) {
    const word = words[at] ?? "";
    if (word === "--") return words.slice(at + 1 + left);
    if (word.startsWith("-") && word.length > 1) {
      if (values.includes(word)) at += 1;
    } else if (left === 0) return words.slice(at);
    else left -= 1;
  }
  return [];
}

export const RESERVED_WORDS = new Set([
  "if", "then", "else", "elif", "fi", "while", "until", "for", "select", "do", "done",
  "case", "esac", "function", "coproc", "{", "}", "!",
]);

function unwrapOnce(words: readonly string[]): string[] | undefined {
  const [head = "", ...rest] = words;
  if (ASSIGNMENT.test(head)) return rest;
  const named = [program(head), ...rest];
  const wrapper = WRAPPERS.find(({ runs }) => startsWith(named, runs));
  if (wrapper !== undefined) return pastWrapper(words, wrapper);
  if (RESERVED_WORDS.has(head)) return rest;
  return undefined;
}

export function stripped(words: readonly string[]): string[] {
  let rest = [...words];
  for (let inner = unwrapOnce(rest); inner !== undefined; inner = unwrapOnce(rest)) rest = inner;
  return rest;
}

function unwrapped(words: readonly string[]): string[] {
  return stripped(words).map((word, at) => (at === 0 ? program(word) : word));
}

export const texts = (words: readonly Word[]): string[] => words.map(({ text }) => text);

export function hasConfig(args: readonly string[], configs: readonly RegExp[]): boolean {
  for (let at = 0; at < args.length; at += 1) {
    const arg = args[at] ?? "";
    const [name = "", value] = arg.split(/=(.*)/s);
    if (name !== "-c" && name !== "--config") continue;
    const path = value ?? args[at + 1] ?? "";
    if (configs.some((config) => config.test(path))) return true;
  }
  return false;
}

export const SCRIPT_RUNNERS = new Set(["bun", "node", "sh", "bash", "zsh", "dash"]);

export const simpleCommands = (command: string): string[][] => segments(command).map((words) => unwrapped(texts(words)));

const TAKES_VALUE = new Set(["-C", "--dir", "--cwd", "--prefix", "-F", "--filter", "--resume-from", "--project", "--directory", "--group", "-p", "--package", "--workspace", "--with"]);

function takesValue(tool: string, word: string): boolean {
  if (word === "-w") return tool === "npm";
  return TAKES_VALUE.has(word);
}

export function skipFlags(words: readonly string[], at: number, tool: string = words[0] ?? ""): number {
  let next = at;
  for (;;) {
    const word = words[next] ?? "";
    if (word === "--") return next + 1;
    if (!word.startsWith("-") || word === "-") return next;
    next += 1;
    if (!word.includes("=") && takesValue(tool, word) && next < words.length && !(words[next] ?? "").startsWith("-")) next += 1;
  }
}

const DIR_FLAGS = new Set(["-C", "--dir", "--cwd", "--prefix", "--chdir", "--directory"]);

export function expandHome(path: string): string {
  const home = process.env.HOME;
  if (home === undefined || home === "") return path;
  if (path === "~") return home;
  return path.startsWith("~/") ? home + path.slice(1) : path;
}

function inlineDir(name: string, inline: string | undefined, here: string): string {
  if (inline === undefined || !DIR_FLAGS.has(name)) return here;
  return resolve(here, expandHome(inline));
}
function separateDir(word: string, next: string | undefined, here: string): string {
  if (next === undefined || next.startsWith("-") || !DIR_FLAGS.has(word)) return here;
  return resolve(here, expandHome(next));
}
function consumesNext(word: string, inline: string | undefined, next: string | undefined, tool: string): boolean {
  if (inline !== undefined || next === undefined || next.startsWith("-")) return false;
  return DIR_FLAGS.has(word) || takesValue(tool, word);
}
export function flagDir(words: readonly string[], dir: string, tool = "", prefix = false): string {
  let here = dir;
  let at = prefix ? 0 : 1;
  while (at < words.length) {
    const word = words[at] ?? "";
    if (word === "--") break;
    if (!word.startsWith("-") || word === "-") {
      if (!prefix) break;
      at += 1;
      continue;
    }
    const [name = "", inline] = word.split(/=(.*)/s);
    const next = words[at + 1];
    here = inline === undefined ? separateDir(word, next, here) : inlineDir(name, inline, here);
    at += consumesNext(word, inline, next, tool) ? 2 : 1;
  }
  return here;
}
