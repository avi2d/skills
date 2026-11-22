import { Config, Duration, Effect, Option } from "effect";
import { ChildProcess, type ChildProcessSpawner } from "effect/process";
import { outputOf, type Ran } from "../platform/files";

export const git = (repo: string, args: readonly string[]): Effect.Effect<Option.Option<Ran>, never, ChildProcessSpawner.ChildProcessSpawner> =>
  Effect.option(outputOf(ChildProcess.make("git", args, { cwd: repo }))).pipe(Effect.map(Option.filter((ran) => ran.code === 0)));

const shellQuoted = (program: string): string => `'${program.replaceAll("'", "'\\''")}'`;

const sshCommandIn = Effect.fnUntraced(function* (repo: string) {
  const configuredSsh = yield* git(repo, ["config", "--get", "core.sshCommand"]);
  const environmentSsh = yield* Config.String("GIT_SSH_COMMAND").pipe(Config.withDefault(""), Effect.orElseSucceed(() => ""));
  const legacySsh = yield* Config.String("GIT_SSH").pipe(Config.withDefault(""), Effect.orElseSucceed(() => ""));
  const configured = Option.getOrElse(Option.map(configuredSsh, (ran) => ran.stdout.trimEnd()), () => "");
  const legacy = legacySsh.trim() ? shellQuoted(legacySsh.trim()) : "";
  return environmentSsh || configured || legacy || "ssh";
});

const remoteMainIn = Effect.fnUntraced(function* (repo: string, ssh: string) {
  return yield* Effect.option(
    outputOf(
      ChildProcess.make("git", ["ls-remote", "origin", "refs/heads/main"], {
        cwd: repo,
        env: { GIT_TERMINAL_PROMPT: "0", GIT_SSH_COMMAND: `${ssh} -o BatchMode=yes` },
        extendEnv: true,
      }),
    ),
  ).pipe(
    Effect.timeoutOption(Duration.seconds(10)),
    Effect.map(Option.flatten),
    Effect.map(Option.filter((ran) => ran.code === 0)),
  );
});

export const originWarnings = Effect.fnUntraced(function* (repo: string) {
  const head = yield* git(repo, ["rev-parse", "HEAD"]);
  const remote = yield* remoteMainIn(repo, yield* sshCommandIn(repo));
  if (Option.isNone(head) || Option.isNone(remote)) return ["cannot check origin/main for updates; fetch origin before linking to check for updates"];
  const remoteSha = remote.value.stdout.trim().split(/\s+/)[0] ?? "";
  if (!remoteSha) return ["cannot check origin/main for updates; fetch origin before linking to check for updates"];
  if (Option.isNone(yield* git(repo, ["merge-base", "--is-ancestor", remoteSha, "HEAD"]))) return ["checkout differs from origin/main; pull origin/main to check for updates"];
  return [];
});
