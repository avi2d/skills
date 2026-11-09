import type { RunState } from "./run-state";
import { segments } from "./shell-words";

const SLOW_SECONDS = 60;

export const RERUN_REFUSAL =
  "This runs the same command again with nothing written since its last run, so only the filter on its output changes. Read that run's output instead. If you did not save it, run the command once more with its output sent to a file, then filter the file. After a change, run only the failing tests.";

const RERUN_REFUSED_WHY = "a rerun that changes only its output filter was refused";

type RerunRefused = { type: "rerun-refused"; why: string; text: string };

type ToolCall = { tool: string; input: Record<string, unknown>; writes?: readonly string[] };

export const stripped = (command: string): string => (segments(command)[0] ?? []).map((word) => word.text).join(" ");

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
  "stash",
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
  "config",
]);

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
    const sub = rest.find((word, at) => !word.startsWith("-") && rest[at - 1] !== "-c" && rest[at - 1] !== "--config");
    return sub !== undefined && GIT_WRITES.has(sub);
  }
  if (program === "sed" && rest.some((word) => word === "-i" || word === "--in-place")) return true;
  if (program === "perl" && rest.some((word) => word.startsWith("-") && word.slice(1).includes("i"))) return true;
  const writes = PACKAGE_WRITES.get(program);
  if (writes !== undefined && rest.some((word) => !word.startsWith("-") && writes.has(word))) return true;
  return TREE_WRITES.has(program);
};

const refusedRerun = (command: string, slow: string | undefined): RerunRefused | undefined => {
  if (slow === undefined || stripped(command) !== slow || command === slow) return undefined;
  if (outputGoesToFile(command)) return undefined;
  return { type: "rerun-refused", why: RERUN_REFUSED_WHY, text: RERUN_REFUSAL };
};

export const checkedRerun = (event: ToolCall, state: RunState): { refused?: RerunRefused; state: RunState } => {
  const command = event.tool.toLowerCase() === "bash" && typeof event.input["command"] === "string" ? event.input["command"] : undefined;
  if (command !== undefined) {
    const refused = refusedRerun(command, state.slow);
    if (refused !== undefined) return { refused, state };
  }
  const changed =
    command !== undefined ? stripped(command) !== state.slow && bashLooksMutating(command) : (event.writes?.length ?? 0) > 0;
  if (!changed) return { state };
  const { slow: _settled, ...rest } = state;
  return { state: { ...rest } };
};

export const slowResult = (
  event: { tool: string; command: string; seconds: number },
  state: RunState,
): { actions: []; state: RunState } => {
  if (event.tool.toLowerCase() !== "bash" || event.seconds < SLOW_SECONDS) return { actions: [], state };
  return { actions: [], state: { ...state, slow: stripped(event.command) } };
};

export const bashLooksMutating = (command: string): boolean => {
  if (outputGoesToFile(command)) return true;
  return segments(command).some((segment) => segmentWrites(segment.map((word) => word.text)));
};
