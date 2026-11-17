import { segments, type Word } from "./shell-words";

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

function unwrapOnce(words: readonly string[]): string[] | undefined {
  const [head = "", ...rest] = words;
  if (ASSIGNMENT.test(head)) return rest;
  const named = [program(head), ...rest];
  const wrapper = WRAPPERS.find(({ runs }) => startsWith(named, runs));
  return wrapper === undefined ? undefined : pastWrapper(words, wrapper);
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

export const simpleCommands = (command: string): string[][] => segments(command).map((words) => unwrapped(texts(words)));
