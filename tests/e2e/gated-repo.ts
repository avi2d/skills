import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PROJECT_FILE } from "../../src/dispatcher/project";

const gitEnv = {
  ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_"))),
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
};

export const git = (cwd: string, ...args: string[]): string =>
  execFileSync("git", ["-c", "user.name=gate", "-c", "user.email=gate@example.com", ...args], {
    cwd,
    env: gitEnv,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

export type Scratch = { root: string; dir: string; counter: string; remove: () => void };

export function scratchRepo(config: string | undefined, options: { trusted?: boolean; setUp?: boolean } = {}): Scratch {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "skills-gate-")));
  const dir = join(root, "repo");
  git(root, "init", "-q", "-b", "main", dir);
  writeFileSync(join(dir, ".gitignore"), "ignored/\n");
  writeFileSync(join(dir, "a.txt"), "start\n");
  if (config !== undefined) writeFileSync(join(dir, ".no-mistakes.yaml"), config);
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "start");
  if (options.setUp !== false) git(dir, "remote", "add", "no-mistakes", join(root, "gate.git"));
  if (options.trusted !== false) {
    git(dir, "update-ref", "refs/remotes/origin/main", "HEAD");
    git(dir, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");
  }
  return { root, dir, counter: join(root, "runs"), remove: () => rmSync(root, { recursive: true, force: true }) };
}

export function declaringRepo(parent: string, project: string): string {
  const dir = join(realpathSync(parent), "declaring");
  git(parent, "init", "-q", dir);
  writeFileSync(join(dir, PROJECT_FILE), project);
  return dir;
}

export const counted = (counter: string, command: string): string => `echo run >> '${counter}'; ${command}`;
