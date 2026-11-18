import { resolve } from "node:path";

export { compileGlob, hasConfig, program, SCRIPT_RUNNERS, segments, stripped, texts } from "../common/shell-commands";

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
