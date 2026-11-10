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

const gitSubcommandAt = (rest: readonly string[]): number =>
  rest.findIndex((word, index) => !word.startsWith("-") && rest[index - 1] !== "-c" && rest[index - 1] !== "--config");

const gitWrites = (rest: readonly string[]): boolean => {
  const at = gitSubcommandAt(rest);
  const sub = at === -1 ? undefined : rest[at];
  if (sub === "config") return gitConfigWrites(rest.slice(at + 1));
  if (sub === "stash") return gitStashWrites(rest.slice(at + 1));
  return sub !== undefined && GIT_WRITES.has(sub);
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

const packageWrites = (program: string, rest: readonly string[]): boolean => {
  const writes = PACKAGE_WRITES.get(program);
  return writes !== undefined && rest.some((word) => !word.startsWith("-") && writes.has(word));
};

export const segmentWrites = (words: readonly string[]): boolean => {
  const [program, ...rest] = words;
  if (program === undefined) return false;
  if (program === "git") return gitWrites(rest);
  if (program === "sed" && rest.some((word) => word === "-i" || word === "--in-place")) return true;
  if (program === "perl" && rest.some((word) => word.startsWith("-") && word.slice(1).includes("i"))) return true;
  if (packageWrites(program, rest)) return true;
  return TREE_WRITES.has(program);
};
