import { realpathSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { segments } from "./shell-words";

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

const flagTarget = (words: readonly string[], at: number, home: string): { dir: string; skip: number } | undefined => {
  const word = words[at] ?? "";
  if (word === "-C" || word === "--git-dir" || word === "--work-tree") {
    const value = words[at + 1];
    if (value === undefined) return undefined;
    return { dir: expandHome(value, home), skip: 1 };
  }
  if (word.startsWith("-C") && word.length > 2) return { dir: expandHome(word.slice(2), home), skip: 0 };
  if (word.startsWith("--git-dir=")) return { dir: expandHome(word.slice("--git-dir=".length), home), skip: 0 };
  if (word.startsWith("--work-tree=")) return { dir: expandHome(word.slice("--work-tree=".length), home), skip: 0 };
  return undefined;
};

const gitTarget = (words: readonly string[], git: number, commitAt: number, current: string, home: string): string => {
  let dir = current;
  const globals = words.slice(git + 1, commitAt);
  for (let at = 0; at < globals.length; at += 1) {
    const found = flagTarget(globals, at, home);
    if (found === undefined) continue;
    dir = resolve(dir, found.dir);
    at += found.skip;
  }
  return dir;
};

const commitDirs = (calls: readonly (readonly string[])[], cwd: string, home: string): string[] => {
  const targets: string[] = [];
  let current = cwd;
  for (const words of calls) {
    if (withoutEnv(words)[0] === "cd") {
      const target = cdTarget(words, home);
      if (target !== undefined) current = resolve(current, target);
      continue;
    }
    const git = words.indexOf("git");
    if (git === -1) continue;
    const commitAt = words.indexOf("commit", git + 1);
    if (commitAt === -1) continue;
    targets.push(gitTarget(words, git, commitAt, current, home));
  }
  return targets;
};

const setsIdentity = (words: readonly string[]): boolean => {
  for (let at = 0; at < words.length; at += 1) {
    const word = words[at] ?? "";
    if (word === "--author" || word.startsWith("--author=")) return true;
    if (word === "-c" || word === "--config") {
      const value = words[at + 1] ?? "";
      if (value.startsWith("user.name=") || value.startsWith("user.email=")) return true;
    } else if (/^(-c|--config=)user\.(name|email)=/.test(word)) return true;
  }
  return false;
};

const exportsIdentity = (words: readonly string[]): boolean => {
  for (let at = 0; at < words.length; at += 1) {
    if (!IDENTITY_VAR.test(words[at] ?? "")) continue;
    const before = words[at - 1];
    if (before === undefined || before === "export" || before === "env" || before.includes("=")) return true;
  }
  return false;
};

export const commitIdentity = (tool: string, input: Record<string, unknown>, cwd: string): string | undefined => {
  if (tool.toLowerCase() !== "bash") return undefined;
  const command = input["command"];
  if (typeof command !== "string") return undefined;
  const calls = segments(command).map((segment) => segment.map((word) => word.text));
  const commits = calls.some((words) => {
    const git = words.indexOf("git");
    return git !== -1 && words.slice(git + 1).includes("commit");
  });
  if (!commits) return undefined;
  if (!calls.some((words) => setsIdentity(words) || exportsIdentity(words))) return undefined;
  const targets = commitDirs(calls, cwd, homedir());
  if (targets.length > 0 && targets.every(underTemp)) return undefined;
  return COMMIT_IDENTITY_REFUSAL;
};
