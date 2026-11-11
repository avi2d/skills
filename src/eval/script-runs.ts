import { segments } from "../dispatcher/shell-words";

const SHELLS = new Set(["ash", "bash", "dash", "ksh", "sh", "zsh"]);

type ShellStep = { done: string | undefined } | { next: number; noexec: boolean };

const dashCO = (words: readonly string[], at: number, word: string, noexec: boolean): ShellStep | undefined => {
  if (word !== "-c" && word !== "-o") return undefined;
  if (word === "-o" && words[at + 1] === "noexec") return { next: at + 1, noexec: true };
  return { next: at + 1, noexec };
};

const shellStep = (words: readonly string[], at: number, noexec: boolean): ShellStep => {
  const word = words[at] ?? "";
  if (word === "--") return { done: noexec ? undefined : words[at + 1] };
  const dashed = dashCO(words, at, word, noexec);
  if (dashed !== undefined) return dashed;
  if (word.startsWith("--")) return { next: at, noexec: word === "--noexec" ? true : noexec };
  if (word.startsWith("-") && word !== "-") return { next: at, noexec: word.slice(1).includes("n") ? true : noexec };
  return { done: noexec ? undefined : word };
};

const scriptOperand = (words: readonly string[], slow: RegExp): string | undefined => {
  const program = words[0] ?? "";
  if (slow.test(program)) return program;
  if (!SHELLS.has(program.split("/").pop() ?? "")) return undefined;
  let noexec = false;
  for (let at = 1; at < words.length; at += 1) {
    const step = shellStep(words, at, noexec);
    if ("done" in step) return step.done;
    noexec = step.noexec;
    at = step.next;
  }
  return undefined;
};

export const runsScript = (words: readonly string[], slow: RegExp): boolean => {
  const operand = scriptOperand(words, slow);
  return operand !== undefined && slow.test(operand);
};

export const slowExecutions = (command: string, slow: RegExp): number =>
  segments(command).filter((segment) => runsScript(segment.map((word) => word.text), slow)).length;
