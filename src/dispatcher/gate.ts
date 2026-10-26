import { type ChildProcessByStdio, execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Readable } from "node:stream";
import { type Unreadable, checksOf, readConfig } from "./gate-config";
import type { Check, Gate, Outcome } from "./verdict";

export const CONFIG = ".no-mistakes.yaml";

// no-mistakes takes its commands from the default branch unless that copy sets allow_repo_commands.
const TRUSTED = "refs/remotes/origin/HEAD";

// no-mistakes init adds this remote, and a clone cannot carry it.
const SET_UP_REMOTE = "no-mistakes";

export const VERIFY_BUDGET_SECONDS = 120;

export const TAIL_CHARS = 3_000;

// Repo-root-relative paths, one per line.
export const CHANGED_FILES = "SKILLS_CHANGED_FILES";

// Past this the exec limit can refuse every check, so the variable is left unset and a lint that reads it walks its full set.
export const CHANGED_FILES_LIMIT_BYTES = 64 * 1024;

const because = (e: unknown): string => (e instanceof Error ? e.message : String(e));

function git(cwd: string, args: readonly string[]): string | undefined {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return undefined;
  }
}

function readLocal(root: string): string | undefined {
  try {
    return readFileSync(join(root, CONFIG), "utf8");
  } catch {
    return undefined;
  }
}

function declaredChecks(root: string): Check[] | Unreadable {
  const local = readLocal(root);
  if (git(root, ["rev-parse", "--verify", "--quiet", TRUSTED]) === undefined) {
    return local === undefined
      ? []
      : { unreadable: `${root} has a ${CONFIG} and no origin/HEAD, which is where no-mistakes reads the copy it trusts` };
  }
  const trusted = git(root, ["show", `${TRUSTED}:${CONFIG}`]);
  if (trusted === undefined) return [];
  const read = readConfig(trusted);
  if ("unreadable" in read) return { unreadable: `the ${CONFIG} on origin/HEAD in ${root} ${read.unreadable}` };
  if (!read.allowRepoCommands) return checksOf(read);
  if (local === undefined) return [];
  const mine = readConfig(local);
  if ("unreadable" in mine) return { unreadable: `${join(root, CONFIG)} ${mine.unreadable}` };
  return checksOf(mine);
}

// lstat, so a dangling symlink the settle added is still listed.
function isFileEntry(path: string): boolean {
  try {
    const entry = lstatSync(path);
    return entry.isFile() || entry.isSymbolicLink();
  } catch {
    return false;
  }
}

export function changedFiles(root: string, base?: string): string[] {
  const seen = new Set<string>();
  for (const args of [
    ["diff", "--name-only", "-z", base ?? "HEAD", "HEAD", "--"],
    ["diff", "--cached", "--name-only", "-z"],
    ["diff", "--name-only", "-z"],
    ["ls-files", "--others", "--exclude-standard", "-z"],
  ] as const) {
    for (const path of (git(root, [...args]) ?? "").split("\0")) {
      if (path !== "" && isFileEntry(join(root, path))) seen.add(path);
    }
  }
  return [...seen].sort();
}

export function fingerprint(root: string): string | undefined {
  const diff = ["--binary", "--no-ext-diff", "--no-textconv", "--no-color"];
  const head = git(root, ["rev-parse", "--verify", "--quiet", "HEAD"]) ?? "unborn";
  const staged = git(root, ["diff", "--cached", ...diff]);
  const unstaged = git(root, ["diff", ...diff]);
  const untracked = git(root, ["ls-files", "--others", "--exclude-standard", "-z"]);
  if (staged === undefined || unstaged === undefined || untracked === undefined) return undefined;
  const hash = createHash("sha256");
  for (const part of [root, head, staged, unstaged]) hash.update(part).update("\0");
  for (const path of untracked.split("\0").filter(Boolean).sort()) {
    hash.update(path).update("\0");
    try {
      const stat = statSync(join(root, path));
      hash.update(`${stat.size}:${stat.mtimeMs}`);
    } catch {
      hash.update("gone");
    }
    hash.update("\0");
  }
  return hash.digest("hex").slice(0, 12);
}

export type Sight = { gate: Gate } | Unreadable | undefined;

const VERDICT_GATE_KEY = "skills.verdictGate";

function verdictGateOff(root: string): boolean {
  return git(root, ["config", "--local", "--get", VERDICT_GATE_KEY])?.trim() === "off";
}

function primaryTree(root: string): boolean {
  const [gitDir, commonDir] = git(root, ["rev-parse", "--path-format=absolute", "--git-dir", "--git-common-dir"])?.trim().split("\n") ?? [];
  return gitDir !== undefined && gitDir === commonDir;
}

export function sight(cwd: string): Sight {
  const root = git(cwd, ["rev-parse", "--show-toplevel"])?.trim();
  if (!root) return undefined;
  // --local keeps a global off from silencing every checkout.
  if (verdictGateOff(root)) return undefined;
  if (!primaryTree(root) || !git(root, ["remote"])?.split("\n").includes(SET_UP_REMOTE)) return undefined;
  const checks = declaredChecks(root);
  if ("unreadable" in checks) return checks;
  if (checks.length === 0) return undefined;
  const tree = fingerprint(root);
  if (tree === undefined) return { unreadable: `git could not say what the tree in ${root} holds` };
  const head = git(root, ["rev-parse", "--verify", "--quiet", "HEAD"])?.trim() || undefined;
  return { gate: { root, tree, checks, ...(head === undefined ? {} : { head }) } };
}

export const unreadableNote = (found: Unreadable): string => `broken dispatcher: the verdict gate cannot read its checks: ${found.unreadable}`;

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[ -/]*[@-~]`, "g");

export function tailOf(output: string, chars: number = TAIL_CHARS): string {
  const clean = output.replace(ANSI, "").replace(/\r\n?/g, "\n").trimEnd();
  if (clean.length <= chars) return clean;
  const cut = clean.slice(-chars);
  const line = cut.indexOf("\n");
  return line === -1 ? cut : cut.slice(line + 1);
}

type Cut = { ended: "inconclusive" | "overran"; why: string };

type Ran = { ended: "ok" } | { ended: "failed"; status: string; tail: string } | Cut;

const NOT_INSTALLED = 127;

// A descendant that starts a group of its own outlives the group's kill, so the kill also ends every descendant still under the check.
// A job whose parent already exited is reparented away from the check and is out of reach.
function endTree(root: number): void {
  const pids = [-root];
  try {
    const children = new Map<number, number[]>();
    const rows = execFileSync("ps", ["-eo", "pid,ppid"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    for (const row of rows.split("\n")) {
      const [pid = NaN, ppid = NaN] = row.trim().split(/\s+/).map(Number);
      if (!Number.isNaN(pid) && !Number.isNaN(ppid)) children.set(ppid, [...(children.get(ppid) ?? []), pid]);
    }
    pids.push(...(children.get(root) ?? []));
    for (let at = 1; at < pids.length; at += 1) pids.push(...(children.get(pids[at] ?? 0) ?? []));
  } catch {
  }
  for (const pid of pids) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
    }
  }
}

function checkEnv(changed: string): NodeJS.ProcessEnv {
  const env = { ...process.env };
  if (Buffer.byteLength(changed) > CHANGED_FILES_LIMIT_BYTES) delete env[CHANGED_FILES];
  else env[CHANGED_FILES] = changed;
  return env;
}

const unstarted = (command: string, e: unknown): Cut => ({ ended: "inconclusive", why: `\`${command}\` could not be started: ${because(e)}` });

function run(root: string, command: string, within: number, budget: number, env: NodeJS.ProcessEnv): Promise<Ran> {
  if (within <= 0) return Promise.resolve({ ended: "overran", why: `the gate's ${budget}s ran out before \`${command}\` started` });
  let child: ChildProcessByStdio<null, Readable, Readable>;
  try {
    child = spawn("sh", ["-c", command], { cwd: root, detached: true, stdio: ["ignore", "pipe", "pipe"], env });
  } catch (e) {
    return Promise.resolve(unstarted(command, e));
  }
  return new Promise((resolve) => {
    let output = "";
    let cut: Cut | undefined;
    let done = false;
    const stop = (why: Cut): void => {
      cut ??= why;
      if (child.pid !== undefined) endTree(child.pid);
      finish(cut);
    };
    const timer = setTimeout(
      () => stop({ ended: "overran", why: `\`${command}\` was still running when the gate's ${budget}s ran out` }),
      within,
    );
    const finish = (ran: Ran): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(ran);
    };
    const keep = (chunk: Buffer): void => {
      output = (output + chunk.toString("utf8")).slice(-TAIL_CHARS * 4);
    };
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    child.on("error", (e) => finish(unstarted(command, e)));
    child.on("close", (code, killed) => {
      if (cut !== undefined) finish(cut);
      else if (code === 0) finish({ ended: "ok" });
      else if (code === NOT_INSTALLED) {
        finish({ ended: "inconclusive", why: `\`${command}\` exited ${NOT_INSTALLED}, so something it runs is not installed in this checkout` });
      } else finish({ ended: "failed", status: code === null ? `was killed by ${killed}` : `exited ${code}`, tail: tailOf(output) });
    });
  });
}

export type Verified = { seconds: number; verdict: Outcome };

export async function verify(
  root: string,
  checks: readonly Check[],
  budget: number = VERIFY_BUDGET_SECONDS,
  base?: string,
): Promise<Verified> {
  const started = Date.now();
  const deadline = started + budget * 1000;
  const env = checkEnv(changedFiles(root, base).join("\n"));
  const seconds = (): number => Math.round((Date.now() - started) / 1000);
  for (const check of checks) {
    const ran = await run(root, check.command, deadline - Date.now(), budget, env);
    if (ran.ended === "inconclusive" || ran.ended === "overran") return { seconds: seconds(), verdict: { outcome: ran.ended, why: ran.why } };
    if (ran.ended === "failed") {
      return { seconds: seconds(), verdict: { outcome: "failed", check, status: ran.status, tail: ran.tail } };
    }
  }
  return { seconds: seconds(), verdict: { outcome: "passed", checks: checks.map((check) => check.name) } };
}
