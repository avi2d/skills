import { createHash } from "node:crypto";
import { SLOW_KEEP, type RunState } from "./run-state";
import { segments } from "./shell-words";

export const digestCommand = (command: string): string => createHash("sha256").update(command, "utf8").digest("hex");

export type SplitStage = { words: string[]; start: number; gap: string; spanEnd: number };

export const splitStages = (command: string): SplitStage[] => {
  const found = segments(command);
  return found.map((segment, at) => {
    const start = segment[0]?.from ?? command.length;
    const previous = at === 0 ? 0 : (found[at - 1]?.at(-1)?.to ?? 0);
    return {
      words: segment.map((word) => word.text),
      start,
      gap: command.slice(previous, start),
      spanEnd: found[at + 1]?.[0]?.from ?? command.length,
    };
  });
};

export const isPipeGap = (gap: string): boolean => /(^|[^|])\|(?![|])/.test(gap);

const SLOW_SECONDS = 60;

export const RERUN_REFUSAL =
  "This runs the same command again with nothing written since its last run, so only the filter on its output changes. Read that run's output instead. If you did not save it, run the command once more with its output sent to a file, then filter the file. After a change, run only the failing tests.";

const RERUN_REFUSAL_WHY = "a rerun that changes only its output filter was refused";

type RerunRefused = { type: "rerun-refused"; why: string; text: string };

type ToolCall = { tool: string; input: Record<string, unknown>; writes?: readonly string[] };

const SHELL_SAFE = /^[A-Za-z0-9_@%+=:,./-]+$/;

const quoteWord = (word: string): string => (SHELL_SAFE.test(word) ? word : JSON.stringify(word));

const chainJoin = (gap: string): string => {
  if (gap.includes(";")) return ";";
  if (gap.includes("||")) return "||";
  if (gap.includes("&&")) return "&&";
  return "&";
};

const OUTPUT_FILTERS = new Set([
  "awk", "cat", "col", "cut", "egrep", "fgrep", "fold", "fmt", "gawk", "grep", "head", "jq",
  "less", "mawk", "more", "most", "nl", "od", "pr", "rg", "sed", "sort", "tac", "tail", "tee",
  "tr", "uniq", "wc", "zgrep",
]);

const programOf = (word: string | undefined): string => word?.split("/").pop() ?? "";

type AnalyzedStage = SplitStage & { kept: boolean };

const analyze = (command: string): AnalyzedStage[] => {
  const stages = splitStages(command);
  let continuing = false;
  return stages.map((stage, at) => {
    const downstream = at > 0 && isPipeGap(stage.gap);
    if (!downstream) continuing = false;
    const kept = !continuing || !OUTPUT_FILTERS.has(programOf(stage.words[0]));
    continuing = true;
    return { ...stage, kept };
  });
};

const previousSignificant = (text: string, at: number): string => {
  let back = at - 1;
  while (back >= 0 && (text[back] === " " || text[back] === "\t")) back -= 1;
  return back >= 0 ? (text[back] ?? "") : "";
};

const unquote = (target: string): string =>
  target.length >= 2 &&
  ((target.startsWith('"') && target.endsWith('"')) || (target.startsWith("'") && target.endsWith("'")))
    ? target.slice(1, -1)
    : target;

const extendedSpan = (command: string, stage: SplitStage): { text: string; base: number } => {
  const cut = Math.max(
    stage.gap.lastIndexOf(";"),
    stage.gap.lastIndexOf("&"),
    stage.gap.lastIndexOf("|"),
    stage.gap.lastIndexOf("("),
    stage.gap.lastIndexOf(")"),
    stage.gap.lastIndexOf("\n"),
  );
  const leading = stage.gap.slice(cut + 1);
  return { text: `${leading}${command.slice(stage.start, stage.spanEnd)}`, base: stage.start - leading.length };
};

const INPUT_AFTER = new Set(["<", ">", "&", "|", ";", "("]);

const inputAttachments = (text: string, inside: readonly boolean[], base: number, ownStart: number): string[] => {
  const attached: string[] = [];
  for (const match of text.matchAll(/<(?![<>|&])\s*("[^"]*"|'[^']*'|[^\s|&;()<>]+)/g)) {
    const offset = match.index ?? 0;
    if (inside[base + offset]) continue;
    if (offset >= ownStart && INPUT_AFTER.has(previousSignificant(text, offset))) continue;
    attached.push(`< ${quoteWord(unquote(match[1] ?? ""))}`);
  }
  for (const match of text.matchAll(/<<-?\s*("[^"]*"|'[^']*'|[^\s|&;()<>]+)/g)) {
    const offset = match.index ?? 0;
    if (inside[base + offset]) continue;
    if (offset >= ownStart && INPUT_AFTER.has(previousSignificant(text, offset))) continue;
    attached.push(`${match[0].startsWith("<<-") ? "<<-" : "<<"} ${quoteWord(unquote(match[1] ?? ""))}`);
  }
  return attached;
};

export const stripped = (command: string): string => {
  const stages = analyze(command);
  if (stages.length === 0) return "";
  const inside = quoted(command);
  const bodies: string[] = [];
  const joints: string[] = [];
  let current: string[] = [];
  for (const stage of stages) {
    if (current.length > 0 && !isPipeGap(stage.gap)) {
      bodies.push(current.join(" | "));
      joints.push(chainJoin(stage.gap));
      current = [];
    }
    if (stage.kept) {
      const span = extendedSpan(command, stage);
      const attached = inputAttachments(span.text, inside, span.base, stage.start - span.base);
      current.push([...stage.words.map(quoteWord), ...attached].join(" "));
    }
  }
  bodies.push(current.join(" | "));
  return bodies
    .map((body, at) => (at === 0 ? body : `${joints[at - 1] ?? ""} ${body}`))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
};

export const quoted = (command: string): boolean[] => {
  const inside = new Array<boolean>(command.length).fill(false);
  let quote = "";
  for (let at = 0; at < command.length; at += 1) {
    const char = command.charAt(at);
    if (quote !== "") {
      inside[at] = true;
      if (char === quote) quote = "";
    } else if (char === "'" || char === '"') {
      inside[at] = true;
      quote = char;
    } else if (char === "\\") {
      inside[at] = true;
      if (at + 1 < command.length) inside[at + 1] = true;
      at += 1;
    }
  }
  return inside;
};

export const outputGoesToFile = (command: string): boolean => {
  const inside = quoted(command);
  const redirect = />{1,2}\s*("[^"]*"|'[^']*'|\S+)/g;
  for (const match of command.matchAll(redirect)) {
    if (inside[match.index]) continue;
    if (!match[0].startsWith(">>") && /^>\s*&/.test(match[0])) continue;
    let target = match[1] ?? "";
    if ((target.startsWith('"') && target.endsWith('"')) || (target.startsWith("'") && target.endsWith("'"))) {
      target = target.slice(1, -1);
    }
    if (target !== "" && target !== "/dev/null") return true;
  }
  return segments(command)
    .slice(1)
    .some((segment) => {
      const words = segment.map((word) => word.text);
      return words[0] === "tee" && words.slice(1).some((word) => !word.startsWith("-") && word !== "/dev/null");
    });
};

const stdoutToFile = (text: string, inside: readonly boolean[], base: number, ownStart: number): string | undefined => {
  let file: string | undefined;
  for (const match of text.matchAll(/([0-9]+)?(>>?\|?|>&)[ \t]*("[^"]*"|'[^']*'|[^\s|&;()<>]+)?/g)) {
    const offset = match.index ?? 0;
    if (inside[base + offset]) continue;
    const prev = previousSignificant(text, offset);
    if (offset >= ownStart && ("<>|;".includes(prev) || (prev === "&" && text[offset - 1] !== "&"))) continue;
    const digit = match[1] ?? "";
    const detached = offset === 0 || /[\s;|&()<>]/.test(text[offset - 1] ?? "");
    const fd = digit !== "" && detached ? digit : "";
    if (fd !== "" && fd !== "1") continue;
    const operator = match[2] ?? "";
    const afterOperator = operator === ">" ? text.slice(offset + match[0].length) : "";
    const bothName = /^&([^0-9\s|&;()<>-][^\s|&;()<>]*)/.exec(afterOperator)?.[1];
    const target = unquote(bothName ?? match[3] ?? "");
    if ((text[offset - 1] ?? "") === "&") {
      file = target === "" || target === "/dev/null" ? undefined : target;
      continue;
    }
    if (operator === ">&") {
      if (target === "2" || target === "-") {
        file = undefined;
        continue;
      }
      if (/^\d+$/.test(target)) continue;
      file = target === "" || target === "/dev/null" ? undefined : target;
      continue;
    }
    if (target === "" || target === "/dev/null") {
      file = undefined;
      continue;
    }
    file = target;
  }
  return file;
};

const teeFile = (words: readonly string[]): string | undefined => {
  if (programOf(words[0]) !== "tee") return undefined;
  const args = words.slice(1);
  let at = 0;
  while (at < args.length && args[at] !== "--" && (args[at] ?? "").startsWith("-") && args[at] !== "-") at += 1;
  if (args[at] === "--") at += 1;
  const file = args[at];
  return file === undefined || file === "/dev/null" ? undefined : file;
};

const PASSTHROUGH = new Set(["cat", "tee"]);

const stageSaves = (words: readonly string[], text: string, inside: readonly boolean[], base: number, ownStart: number): boolean =>
  stdoutToFile(text, inside, base, ownStart) !== undefined || teeFile(words) !== undefined;

export const savesStdout = (command: string): boolean => {
  const stages = analyze(command);
  if (stages.length === 0) return false;
  const inside = quoted(command);
  const kept = stages.filter((stage) => stage.kept);
  const last = kept.at(-1);
  if (last !== undefined) {
    const span = extendedSpan(command, last);
    if (stageSaves(last.words, span.text, inside, span.base, last.start - span.base)) return true;
  }
  const after = last === undefined ? [] : stages.slice(stages.indexOf(last) + 1);
  return after.some((stage) => {
    if (!PASSTHROUGH.has(programOf(stage.words[0]))) return false;
    const span = extendedSpan(command, stage);
    return stageSaves(stage.words, span.text, inside, span.base, stage.start - span.base);
  });
};

const GIT_WRITES = new Set([
  "add",
  "mv",
  "rm",
  "commit",
  "checkout",
  "switch",
  "restore",
  "reset",
  "clean",
  "apply",
  "am",
  "rebase",
  "merge",
  "cherry-pick",
  "revert",
  "pull",
  "fetch",
  "push",
  "clone",
  "init",
]);

const GIT_CONFIG_WRITES = new Set(["--add", "--replace-all", "--unset", "--remove-section", "--rename-section"]);

const GIT_CONFIG_READS = new Set([
  "--get",
  "--get-all",
  "--get-regexp",
  "--get-urlmatch",
  "--list",
  "-l",
  "--show-origin",
  "--show-scope",
  "--name-only",
  "--get-color",
  "--get-colorbool",
]);

const GIT_STASH_READS = new Set(["list", "show"]);

const gitConfigWrites = (after: readonly string[]): boolean => {
  if (after.some((word) => GIT_CONFIG_WRITES.has(word))) return true;
  if (after.some((word) => GIT_CONFIG_READS.has(word))) return false;
  return after.filter((word) => !word.startsWith("-")).length >= 2;
};

const gitStashWrites = (after: readonly string[]): boolean => {
  if (after.some((word) => word === "-h" || word === "--help")) return false;
  const action = after.find((word) => !word.startsWith("-"));
  if (action === undefined) return true;
  return !GIT_STASH_READS.has(action);
};

const TREE_WRITES = new Set([
  "mkdir",
  "touch",
  "rm",
  "mv",
  "cp",
  "ln",
  "install",
  "chmod",
  "chown",
  "truncate",
]);

const PACKAGE_WRITES = new Map<string, ReadonlySet<string>>([
  ["bun", new Set(["add", "install", "remove", "update"])],
  ["npm", new Set(["add", "install", "remove", "uninstall", "update"])],
  ["pnpm", new Set(["add", "install", "remove", "uninstall", "update"])],
  ["yarn", new Set(["add", "install", "remove", "upgrade"])],
]);

const segmentWrites = (words: readonly string[]): boolean => {
  const [program, ...rest] = words;
  if (program === undefined) return false;
  if (program === "git") {
    const at = rest.findIndex((word, index) => !word.startsWith("-") && rest[index - 1] !== "-c" && rest[index - 1] !== "--config");
    const sub = at === -1 ? undefined : rest[at];
    if (sub === "config") return gitConfigWrites(rest.slice(at + 1));
    if (sub === "stash") return gitStashWrites(rest.slice(at + 1));
    return sub !== undefined && GIT_WRITES.has(sub);
  }
  if (program === "sed" && rest.some((word) => word === "-i" || word === "--in-place")) return true;
  if (program === "perl" && rest.some((word) => word.startsWith("-") && word.slice(1).includes("i"))) return true;
  const writes = PACKAGE_WRITES.get(program);
  if (writes !== undefined && rest.some((word) => !word.startsWith("-") && writes.has(word))) return true;
  return TREE_WRITES.has(program);
};

export const checkedRerun = (event: ToolCall, state: RunState): { refused?: RerunRefused; state: RunState } => {
  const command = event.tool.toLowerCase() === "bash" && typeof event.input["command"] === "string" ? event.input["command"] : undefined;
  const entries = state.slow;
  if (command === undefined || entries === undefined || entries.length === 0) return { state };
  for (const entry of entries) {
    if (digestCommand(command) === entry.full) return { state };
  }
  for (const entry of entries) {
    if (digestCommand(stripped(command)) !== entry.canon) continue;
    if (savesStdout(command) && entry.recovered !== true) {
      return { state: { ...state, slow: entries.map((other) => (other === entry ? { ...other, recovered: true } : other)) } };
    }
    return { refused: { type: "rerun-refused", why: RERUN_REFUSAL_WHY, text: RERUN_REFUSAL }, state };
  }
  return { state };
};

export const clearedSlow = (state: RunState): RunState => {
  if (state.slow === undefined) return state;
  const { slow: _dropped, ...rest } = state;
  return { ...rest };
};

export type SlowResult = {
  tool: string;
  command: string;
  seconds: number;
  failed?: boolean;
  full?: string;
  canon?: string;
  mutating?: boolean;
  saved?: boolean;
};

export const slowResult = (event: SlowResult, state: RunState): { actions: []; state: RunState } => {
  if (event.tool.toLowerCase() !== "bash") return { actions: [], state };
  const full = event.full ?? digestCommand(event.command);
  const canon = event.canon ?? digestCommand(stripped(event.command));
  const entries = state.slow ?? [];
  const saved = event.saved ?? savesStdout(event.command);
  if (entries.some((entry) => entry.canon === canon)) {
    const slow = entries.map((entry) => (entry.canon === canon && saved ? { ...entry, recovered: true } : entry));
    return { actions: [], state: { ...state, slow } };
  }
  const failed = event.failed === true;
  const mutating = event.mutating ?? bashLooksMutating(event.command);
  if (event.seconds < SLOW_SECONDS) {
    if (!mutating || failed) return { actions: [], state };
    return { actions: [], state: clearedSlow(state) };
  }
  const base = mutating && !failed ? [] : entries;
  const slow = [...base, { full, canon, ...(saved ? { recovered: true } : {}) }].slice(-SLOW_KEEP);
  return { actions: [], state: { ...state, slow } };
};

export const bashLooksMutating = (command: string): boolean => {
  if (outputGoesToFile(command)) return true;
  return segments(command).some((segment) => segmentWrites(segment.map((word) => word.text)));
};
