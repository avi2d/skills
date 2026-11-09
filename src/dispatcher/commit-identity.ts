import { existsSync, readFileSync, realpathSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { isPipeGap, quoted, splitStages, type SplitStage } from "./rerun";

export const COMMIT_IDENTITY_REFUSAL =
  "This commit sets its own author or committer. Commit as the identity the repository already resolves to, which git config user.name and git config user.email print. Set an identity only inside a throwaway repository a test creates under the temp directory.";

export const COMMIT_IDENTITY_LINE = "commit-identity: refused a commit that sets its own author or committer";

const underTemp = (cwd: string): boolean => {
  try {
    const root = realpathSync(tmpdir());
    const dir = realpathSync(resolve(cwd));
    return dir === root || dir.startsWith(root + sep);
  } catch {
    return false;
  }
};

const IDENTITY_VAR = /^GIT_(AUTHOR|COMMITTER)_[A-Z][A-Z_]*=/;

const LEADING_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=.*/;

const withoutEnv = (words: readonly string[]): readonly string[] => {
  let at = 0;
  while (at < words.length && LEADING_ASSIGNMENT.test(words[at] ?? "")) at += 1;
  return words.slice(at);
};

const expandHome = (dir: string, home: string): string =>
  dir === "~" || dir.startsWith("~/") ? join(home, dir.slice(1)) : dir;

const cdTarget = (words: readonly string[], home: string): string | undefined => {
  const target = withoutEnv(words).slice(1).find((word) => !word.startsWith("-"));
  if (target === undefined) return home;
  if (target === "-") return undefined;
  return expandHome(target, home);
};

const functionBodies = (command: string): Array<{ from: number; to: number }> => {
  const inside = quoted(command);
  const bodies: Array<{ from: number; to: number }> = [];
  const header = /(^|[;&|()\s])(function\s+[A-Za-z_][A-Za-z0-9_]*|[A-Za-z_][A-Za-z0-9_]*\(\s*\))(\s*\(\s*\))?\s*\{/g;
  for (const match of command.matchAll(header)) {
    const open = (match.index ?? 0) + match[0].lastIndexOf("{");
    if (inside[open]) continue;
    let depth = 0;
    let at = open;
    for (; at < command.length; at += 1) {
      if (inside[at]) continue;
      if (command.charAt(at) === "{") depth += 1;
      else if (command.charAt(at) === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    if (depth !== 0) continue;
    bodies.push({ from: match.index ?? 0, to: at + 1 });
  }
  return bodies;
};

const readPointer = (dot: string): string | undefined => {
  let text: string;
  try {
    text = readFileSync(dot, "utf8");
  } catch {
    return undefined;
  }
  const prefix = "gitdir:";
  const first = text.split("\n", 1)[0] ?? "";
  if (!first.startsWith(prefix)) return dot;
  return resolve(dirname(dot), first.slice(prefix.length).trim());
};

const discoverGitDir = (base: string): string => {
  let dir: string;
  try {
    dir = realpathSync(base);
  } catch {
    return base;
  }
  for (;;) {
    const dot = join(dir, ".git");
    if (existsSync(dot)) return readPointer(dot) ?? dot;
    const parent = dirname(dir);
    if (parent === dir) return base;
    dir = parent;
  }
};

const gitDirOf = (
  words: readonly string[],
  bare: readonly string[],
  git: number,
  commitAt: number,
  current: string,
  vars: Record<string, string>,
  home: string,
): string => {
  let dir = current;
  let explicit: string | undefined;
  const globals = bare.slice(git + 1, commitAt);
  for (let at = 0; at < globals.length; at += 1) {
    const flag = globals[at] ?? "";
    if (flag === "-C" || flag === "--git-dir") {
      const value = globals[at + 1];
      if (value === undefined) continue;
      if (flag === "-C") dir = resolve(dir, expandHome(value, home));
      else explicit = expandHome(value, home);
      at += 1;
    } else if (flag.startsWith("-C") && flag.length > 2) {
      dir = resolve(dir, expandHome(flag.slice(2), home));
    } else if (flag.startsWith("--git-dir=")) {
      explicit = expandHome(flag.slice("--git-dir=".length), home);
    }
  }
  const local = words.slice(0, words.length - bare.length).reverse().find((word) => word.startsWith("GIT_DIR="));
  const envDir = (local === undefined ? vars.GIT_DIR : local.slice("GIT_DIR=".length)) ?? "";
  const fromEnv = envDir === "" ? undefined : expandHome(envDir, home);
  return explicit ?? fromEnv ?? discoverGitDir(dir);
};

const commitDirs = (stages: readonly SplitStage[], command: string, cwd: string, home: string): string[] => {
  const inside = quoted(command);
  const bodies = functionBodies(command);
  const insideBody = (at: number): boolean => bodies.some(({ from, to }) => at >= from && at < to);
  const targets: string[] = [];
  let current = cwd;
  let vars: Record<string, string> = {};
  const dirStack: string[] = [];
  const varStack: Array<Record<string, string>> = [];
  for (let index = 0; index < stages.length; index += 1) {
    const stage = stages[index];
    if (stage === undefined) continue;
    if (insideBody(stage.start)) continue;
    const base = stage.start - stage.gap.length;
    for (let offset = 0; offset < stage.gap.length; offset += 1) {
      const at = base + offset;
      if (inside[at] || insideBody(at)) continue;
      if (stage.gap[offset] === "(") {
        dirStack.push(current);
        varStack.push(vars);
        vars = { ...vars };
      } else if (stage.gap[offset] === ")") {
        current = dirStack.pop() ?? current;
        vars = varStack.pop() ?? vars;
      }
    }
    const words = stage.words;
    const bare = withoutEnv(words);
    const next = stages[index + 1];
    const piped = isPipeGap(stage.gap) || (next !== undefined && isPipeGap(next.gap));
    if (bare[0] === "cd") {
      if (!piped) {
        const target = cdTarget(words, home);
        if (target !== undefined) current = resolve(current, target);
      }
      continue;
    }
    if (bare[0] === "export") {
      if (!piped) {
        for (const word of bare.slice(1)) {
          const cut = word.indexOf("=");
          if (cut > 0) vars[word.slice(0, cut)] = word.slice(cut + 1);
        }
      }
    } else if (words.length > 0 && words.every((word) => LEADING_ASSIGNMENT.test(word))) {
      if (!piped) {
        for (const word of words) {
          const cut = word.indexOf("=");
          vars[word.slice(0, cut)] = word.slice(cut + 1);
        }
      }
      continue;
    }
    const git = bare.indexOf("git");
    if (git === -1) continue;
    const commitAt = bare.indexOf("commit", git + 1);
    if (commitAt === -1) continue;
    targets.push(gitDirOf(words, bare, git, commitAt, current, vars, home));
  }
  return targets;
};

const IDENTITY_KEYS = ["author.email=", "author.name=", "committer.email=", "committer.name=", "user.email=", "user.name="];

const hasIdentityKey = (value: string): boolean => IDENTITY_KEYS.some((key) => value.startsWith(key));

const setsIdentity = (words: readonly string[]): boolean => {
  for (let at = 0; at < words.length; at += 1) {
    const word = words[at] ?? "";
    if (word === "--author" || word.startsWith("--author=")) return true;
    if (word === "-c" || word === "--config" || word === "--config-env") {
      if (hasIdentityKey(words[at + 1] ?? "")) return true;
    } else if (word.startsWith("--config=") || word.startsWith("--config-env=")) {
      if (hasIdentityKey(word.slice(word.indexOf("=") + 1))) return true;
    } else if (word.startsWith("-c") && word.length > 2) {
      if (hasIdentityKey(word.slice(2))) return true;
    }
  }
  return false;
};

const SUDO_IDENTITY = new Set(["sudo", "doas"]);

const skipSudoFlags = (words: readonly string[], at: number): number => {
  let next = at;
  for (;;) {
    const flag = words[next] ?? "";
    if (flag === "-u" || flag === "--user" || flag === "-g" || flag === "--group") next += 2;
    else if (flag.startsWith("-") && flag !== "-") next += 1;
    else return next;
  }
};

const skipEnvFlags = (words: readonly string[], at: number): number => {
  let next = at;
  for (;;) {
    const flag = words[next] ?? "";
    if (flag === "-u" || flag === "--unset") next += 2;
    else if (flag.startsWith("--unset=")) next += 1;
    else if (flag.startsWith("-u") && flag.length > 2) next += 1;
    else if (flag.startsWith("-") && flag !== "-") next += 1;
    else return next;
  }
};

const exportsIdentity = (words: readonly string[]): boolean => {
  let at = 0;
  while (at < words.length && LEADING_ASSIGNMENT.test(words[at] ?? "")) at += 1;
  if (SUDO_IDENTITY.has(words[at] ?? "")) {
    at = skipSudoFlags(words, at + 1);
    while (at < words.length && LEADING_ASSIGNMENT.test(words[at] ?? "")) at += 1;
  }
  if (words.slice(0, at).some((word) => IDENTITY_VAR.test(word))) return true;
  if (words[at] === "export") return words.slice(at + 1).some((word) => IDENTITY_VAR.test(word));
  if (words[at] === "env") return words.slice(skipEnvFlags(words, at + 1)).some((word) => IDENTITY_VAR.test(word));
  const rest = words.slice(at);
  return rest.some((word, index) => IDENTITY_VAR.test(word) && (index === 0 || (rest[index - 1] ?? "").includes("=")));
};

export const commitIdentity = (tool: string, input: Record<string, unknown>, cwd: string): string | undefined => {
  if (tool.toLowerCase() !== "bash") return undefined;
  const command = input["command"];
  if (typeof command !== "string") return undefined;
  const stages = splitStages(command);
  const calls = stages.map((stage) => stage.words);
  const commits = calls.some((words) => {
    const git = words.indexOf("git");
    return git !== -1 && words.slice(git + 1).includes("commit");
  });
  if (!commits) return undefined;
  if (!calls.some((words) => setsIdentity(words) || exportsIdentity(words))) return undefined;
  const targets = commitDirs(stages, command, cwd, homedir());
  if (targets.length > 0 && targets.every(underTemp)) return undefined;
  return COMMIT_IDENTITY_REFUSAL;
};
