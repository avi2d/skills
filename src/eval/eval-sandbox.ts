import { Duration, Effect, FileSystem, Option, type Scope } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import type { Change, Verification } from "./eval-judges";
import { FileFailure, fileFailure } from "../platform/failures";
import { attempt, outputOf, type Ran } from "../platform/files";
import { LINKS, MERGED } from "../generate/link";

const AGENT_CONFIG = [".claude", ".pi/agent", ".codex", ".config/opencode", ".agents"];

export const LIVE_ROOTS: readonly string[] = [...new Set([...AGENT_CONFIG, ...Object.keys(LINKS), ...Object.keys(MERGED)])]
  .filter((root, _, all) => !all.some((other) => root.startsWith(`${other}/`)))
  .toSorted();

export const liveRootHolding = (path: string, home: string): string | undefined =>
  LIVE_ROOTS.find((root) => path === `${home}/${root}` || path.startsWith(`${home}/${root}/`));

export type Env = Readonly<Record<string, string | undefined>>;

export type Sandbox = { root: string; home: string; agentDir: string; tmp: string; repo: string; carriage: string };

export const CARRIAGE_VARIABLE = "SKILLS_EVAL_CARRIAGE";

export function isolatedEnv(sandbox: Sandbox, caller: Env, credentials: readonly string[], liveHome: string): Record<string, string> {
  const path = (caller["PATH"] ?? "").split(":").filter((dir) => dir !== "" && liveRootHolding(dir.replace(/\/+$/, ""), liveHome) === undefined);
  const env: Record<string, string> = {
    HOME: sandbox.home,
    PI_CODING_AGENT_DIR: sandbox.agentDir,
    TMPDIR: sandbox.tmp,
    PATH: path.join(":"),
    LANG: "en_US.UTF-8",
    TERM: "dumb",
    GIT_CONFIG_NOSYSTEM: "1",
    [CARRIAGE_VARIABLE]: sandbox.carriage,
  };
  for (const name of credentials) {
    const value = caller[name];
    if (value !== undefined) env[name] = value;
  }
  return env;
}

const spawned = (
  repo: string,
  env: Record<string, string>,
  command: string,
  args: readonly string[],
): Effect.Effect<Ran, FileFailure, ChildProcessSpawner.ChildProcessSpawner> =>
  outputOf(ChildProcess.make(command, args, { cwd: repo, env, stdin: "ignore" })).pipe(
    Effect.mapError((error) => new FileFailure({ path: repo, message: `${command} ${args.join(" ")}: ${error.message}` })),
  );

const git = (repo: string, env: Record<string, string>, args: readonly string[]): Effect.Effect<string, FileFailure, ChildProcessSpawner.ChildProcessSpawner> =>
  spawned(repo, env, "git", args).pipe(
    Effect.flatMap((ran) =>
      ran.code === 0 ? Effect.succeed(ran.stdout) : Effect.fail(new FileFailure({ path: repo, message: `git ${args.join(" ")} exited ${ran.code}: ${ran.stderr.trim()}` })),
    ),
  );

const IDENTITY = { "user.name": "skills-eval", "user.email": "skills-eval@example.invalid", "commit.gpgsign": "false" };

export type Seeded = { sandbox: Sandbox; env: Record<string, string>; base: string };

const writtenInto = Effect.fnUntraced(function* (repo: string, files: Readonly<Record<string, string>>): Effect.fn.Return<void, FileFailure, FileSystem.FileSystem> {
  for (const [rel, text] of Object.entries(files)) {
    const path = `${repo}/${rel}`;
    yield* attempt(path, (fs) => fs.makeDirectory(path.slice(0, path.lastIndexOf("/")), { recursive: true }));
    yield* attempt(path, (fs) => fs.writeFileString(path, text));
  }
});

export const seeded = Effect.fnUntraced(function* (
  files: Readonly<Record<string, string>>,
  carriage: string,
  caller: Env,
  credentials: readonly string[],
  references: Readonly<Record<string, string>> = {},
): Effect.fn.Return<Seeded, FileFailure, FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner | Scope.Scope> {
  const liveHome = caller["HOME"];
  if (liveHome === undefined) return yield* new FileFailure({ path: "$HOME", message: "no $HOME, so there is no way to tell a live agent config from a sandbox" });
  const made = yield* (yield* FileSystem.FileSystem)
    .makeTempDirectoryScoped({ prefix: "skills-eval-" })
    .pipe(Effect.mapError((error) => fileFailure("$TMPDIR", error.cause ?? error)));
  const root = yield* attempt(made, (fs) => fs.realPath(made));
  const live = liveRootHolding(root, liveHome);
  if (live !== undefined) {
    return yield* new FileFailure({ path: root, message: `the sandbox would sit inside the live ~/${live}; point $TMPDIR outside it` });
  }
  const sandbox: Sandbox = {
    root,
    home: `${root}/home`,
    agentDir: `${root}/home/.pi/agent`,
    tmp: `${root}/tmp`,
    repo: `${root}/repo`,
    carriage: `${root}/carriage.md`,
  };
  for (const dir of [sandbox.agentDir, sandbox.tmp, sandbox.repo]) yield* attempt(dir, (fs) => fs.makeDirectory(dir, { recursive: true }));
  yield* attempt(sandbox.carriage, (fs) => fs.writeFileString(sandbox.carriage, carriage));
  yield* writtenInto(sandbox.repo, files);
  for (const [name, text] of Object.entries(references)) {
    const path = `${sandbox.agentDir}/skills/${name}/SKILL.md`;
    yield* attempt(path, (fs) => fs.makeDirectory(`${sandbox.agentDir}/skills/${name}`, { recursive: true }));
    yield* attempt(path, (fs) => fs.writeFileString(path, text));
  }
  const env = isolatedEnv(sandbox, caller, credentials, liveHome);
  yield* git(sandbox.repo, env, ["init", "-q", "-b", "main"]);
  for (const [key, value] of Object.entries(IDENTITY)) yield* git(sandbox.repo, env, ["config", key, value]);
  yield* git(sandbox.repo, env, ["add", "-A"]);
  yield* git(sandbox.repo, env, ["commit", "-q", "-m", "seed"]);
  const base = (yield* git(sandbox.repo, env, ["rev-parse", "HEAD"])).trim();
  return { sandbox, env, base };
});

const LARGEST_JUDGED_FILE = 512 * 1024;

export const changesIn = Effect.fnUntraced(function* (
  { sandbox, env, base }: Seeded,
  seed: Readonly<Record<string, string>>,
): Effect.fn.Return<Change[], FileFailure, FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner> {
  yield* git(sandbox.repo, env, ["add", "-A"]);
  const listed = yield* git(sandbox.repo, env, ["diff", "--cached", "--name-only", "--no-renames", "-z", base]);
  const changes: Change[] = [];
  for (const rel of listed.split("\0").filter((path) => path !== "")) {
    const path = `${sandbox.repo}/${rel}`;
    if (!(yield* attempt(path, (fs) => fs.exists(path)))) continue;
    const { size } = yield* attempt(path, (fs) => fs.stat(path));
    if (Number(size) > LARGEST_JUDGED_FILE) continue;
    const after = yield* attempt(path, (fs) => fs.readFileString(path));
    if (after.includes("\0")) continue;
    changes.push({ path: rel, before: seed[rel], after });
  }
  return changes;
});

export const commitsIn = ({ sandbox, env, base }: Seeded): Effect.Effect<string[], FileFailure, ChildProcessSpawner.ChildProcessSpawner> =>
  git(sandbox.repo, env, ["log", "-z", "--format=%B", "HEAD", "--branches", "--not", base]).pipe(
    Effect.map((log) => log.split("\0").filter((message) => message.trim() !== "")),
  );

// Release-please writes its file only when it cuts a release, so until then the file is what was seeded.
export type Generator = { owns: string; runs: "at-release" | readonly [string, ...string[]] };

const GENERATOR_BUDGET = Duration.seconds(30);

export type Verifier = { files: Readonly<Record<string, string>>; runs: readonly [string, ...string[]] };

const VERIFIER_BUDGET = Duration.seconds(60);

// Call after the run's changes are read, or the verifier's files count as the agent's.
export const verifiedBy = Effect.fnUntraced(function* (
  { sandbox, env }: Seeded,
  { files, runs }: Verifier,
  budget: Duration.Duration = VERIFIER_BUDGET,
): Effect.fn.Return<Verification, FileFailure, FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner> {
  yield* writtenInto(sandbox.repo, files);
  const [command, ...args] = runs;
  const exited = yield* spawned(sandbox.repo, { ...env, NO_COLOR: "1" }, command, args).pipe(Effect.timeoutOption(budget));
  if (Option.isNone(exited)) return { exit: "timed out", output: "" };
  return { exit: exited.value.code, output: `${exited.value.stdout}${exited.value.stderr}` };
});

export const generatedBy = Effect.fnUntraced(function* (
  { sandbox, env }: Seeded,
  { owns, runs }: Generator,
  seed: Readonly<Record<string, string>>,
  budget: Duration.Duration = GENERATOR_BUDGET,
): Effect.fn.Return<Record<string, string>, FileFailure, FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner> {
  if (runs === "at-release") {
    const held = seed[owns];
    return held === undefined ? {} : { [owns]: held };
  }
  const [command, ...args] = runs;
  const exited = yield* spawned(sandbox.repo, env, command, args).pipe(Effect.timeoutOption(budget));
  if (Option.isNone(exited) || exited.value.code !== 0) return {};
  const path = `${sandbox.repo}/${owns}`;
  if (!(yield* attempt(path, (fs) => fs.exists(path)))) return {};
  return { [owns]: yield* attempt(path, (fs) => fs.readFileString(path)) };
});
