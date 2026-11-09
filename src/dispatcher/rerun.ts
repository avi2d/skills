import { createHash } from "node:crypto";
import type { RunState, SlowGuard } from "./run-state";
import { segments } from "./shell-words";

export const digestCommand = (command: string): string => createHash("sha256").update(command, "utf8").digest("hex");

const SLOW_SECONDS = 60;

export const RERUN_REFUSAL =
  "This runs the same command again with nothing written since its last run, so only the filter on its output changes. Read that run's output instead. If you did not save it, run the command once more with its output sent to a file, then filter the file. After a change, run only the failing tests.";

const RERUN_REFUSED_WHY = "a rerun that changes only its output filter was refused";

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

export const stripped = (command: string): string => {
  const found = segments(command);
  if (found.length === 0) return "";
  const parts: string[] = [];
  for (let at = 0; at < found.length; at += 1) {
    const words = (found[at] ?? []).map((word) => word.text);
    if (at > 0) {
      const gap = command.slice(found[at - 1]?.at(-1)?.to ?? 0, found[at]?.[0]?.from ?? 0);
      if (/(^|[^|])\|(?![|])/.test(gap)) continue;
      parts.push(chainJoin(gap));
    }
    parts.push(words.map(quoteWord).join(" "));
  }
  const inside = quoted(command);
  const inputs: string[] = [];
  for (const match of command.matchAll(/<(?![<>|&])\s*("[^"]*"|'[^']*'|[^\s|&;()<>]+)/g)) {
    if (inside[match.index] === true) continue;
    if (/[<|>][ \t]*$/.test(command.slice(0, match.index))) continue;
    const target = match[1] ?? "";
    if (target !== "") inputs.push(target);
  }
  const core = parts.join(" ").replace(/\s+/g, " ").trim();
  return inputs.length === 0 ? core : `${core} ${inputs.map((target) => `< ${target}`).join(" ")}`;
};

const quoted = (command: string): boolean[] => {
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

const refusedRerun = (command: string, slow: SlowGuard): RerunRefused | "recover" | undefined => {
  if (digestCommand(command) === slow.full) return undefined;
  if (digestCommand(stripped(command)) !== slow.canon) return undefined;
  if (!outputGoesToFile(command) || slow.recovered === true) {
    return { type: "rerun-refused", why: RERUN_REFUSED_WHY, text: RERUN_REFUSAL };
  }
  return "recover";
};

export const checkedRerun = (event: ToolCall, state: RunState): { refused?: RerunRefused; state: RunState } => {
  const command = event.tool.toLowerCase() === "bash" && typeof event.input["command"] === "string" ? event.input["command"] : undefined;
  const slow = state.slow;
  if (command !== undefined && slow !== undefined) {
    const decision = refusedRerun(command, slow);
    if (decision === "recover") return { state: { ...state, slow: { ...slow, recovered: true } } };
    if (decision !== undefined) return { refused: decision, state };
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
  if (event.tool.toLowerCase() !== "bash" || event.failed === true) return { actions: [], state };
  const mutating = event.mutating ?? bashLooksMutating(event.command);
  const base = mutating ? clearedSlow(state) : state;
  if (event.seconds < SLOW_SECONDS) return { actions: [], state: base };
  const full = event.full ?? digestCommand(event.command);
  const canon = event.canon ?? digestCommand(stripped(event.command));
  const saved = event.saved ?? outputGoesToFile(event.command);
  return {
    actions: [],
    state: { ...base, slow: { full, canon, ...(saved ? { recovered: true } : {}) } },
  };
};

export const bashLooksMutating = (command: string): boolean => {
  if (outputGoesToFile(command)) return true;
  return segments(command).some((segment) => segmentWrites(segment.map((word) => word.text)));
};
