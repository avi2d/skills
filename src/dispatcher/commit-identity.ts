import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, sep } from "node:path";
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
  if (typeof command !== "string" || underTemp(cwd)) return undefined;
  const calls = segments(command).map((segment) => segment.map((word) => word.text));
  const commits = calls.some((words) => {
    const git = words.indexOf("git");
    return git !== -1 && words.slice(git + 1).includes("commit");
  });
  if (!commits) return undefined;
  if (calls.some((words) => setsIdentity(words) || exportsIdentity(words))) return COMMIT_IDENTITY_REFUSAL;
  return undefined;
};
