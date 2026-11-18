import { segments, type Word } from "./shell-words";
export { segments };

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

const EVAL_CONFIG = /(^|\/)evals\/vitest\.config\.ts$/;

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

export function hasEvalConfig(args: readonly string[]): boolean {
  return hasConfig(args, [EVAL_CONFIG]);
}

export function pathPattern(glob: string): RegExp {
  const body = glob.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*");
  return new RegExp(`(^|/)${body}$`);
}

export const SCRIPT_RUNNERS = new Set(["bun", "node", "sh", "bash", "zsh", "dash"]);

export const BIN_TEST_RUN = /(^|\/)bin\/fm-test-run\.sh$/;

export const BIN_TEST_SCRIPT = /(^|\/)bin\/[^/]*\.test\.sh$/;

export const simpleCommands = (command: string): string[][] => segments(command).map((words) => unwrapped(texts(words)));
