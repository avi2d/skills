import { Duration, Effect, Option, Stream, type FileSystem } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import type { Spend, Verdict } from "./ablation";
import { SKILL_FILE, bodyDir, proseIn } from "../bodies/bodies";
import { carriage } from "../dispatcher/dispatch";
import { verdictOf, wroteTest, type AgentRun, type ProgramJudge } from "./eval-judges";
import { changesIn, commitsIn, generatedBy, seeded, verifiedBy, type Env, type Generator, type Verifier } from "./eval-sandbox";
import { transcriptOf, type RequestUsage, type Transcript } from "./eval-transcript";
import { FileFailure, MalformedBody, UncomposableBodies } from "../platform/failures";
import { attempt, outputOf } from "../platform/files";

const carriageFrom = Effect.fnUntraced(function* (rule: string, dir: string, path: string, file: string): Effect.fn.Return<string, MalformedBody | UncomposableBodies> {
  const text = yield* proseIn(dir, file);
  if (text === "") return yield* new UncomposableBodies({ message: `${path} is frontmatter and nothing else, so there is nothing to inject` });
  const carried = carriage({ harness: "pi", rules: [{ name: rule, triggers: [], text }], profiles: [], hub: [] }, [rule]);
  return carried ?? (yield* new UncomposableBodies({ message: `${path} carried nothing` }));
});

export const carriageOf = Effect.fnUntraced(function* (
  repo: string,
  kind: "rule" | "reference",
  rule: string,
): Effect.fn.Return<string, FileFailure | MalformedBody | UncomposableBodies, FileSystem.FileSystem> {
  const dir = yield* bodyDir(repo, kind, rule);
  const path = `${repo}${dir}/${SKILL_FILE}`;
  return yield* carriageFrom(rule, dir, path, yield* attempt(path, (fs) => fs.readFileString(path)));
});

// The Rule sat at the commit where it sits now.
export const carriageAt = Effect.fnUntraced(function* (
  repo: string,
  rule: string,
  commit: string,
): Effect.fn.Return<string, FileFailure | MalformedBody | UncomposableBodies, FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner> {
  const dir = yield* bodyDir(repo, "rule", rule);
  const path = `${commit}:${dir}/${SKILL_FILE}`;
  const shown = yield* outputOf(ChildProcess.make("git", ["show", path], { cwd: repo, stdin: "ignore" })).pipe(
    Effect.mapError((error) => new FileFailure({ path, message: `git show ${path}: ${error.message}` })),
  );
  if (shown.code !== 0) return yield* new FileFailure({ path, message: `git show ${path} exited ${shown.code}: ${shown.stderr.trim()}` });
  return yield* carriageFrom(rule, dir, path, shown.stdout);
});

export const referenceOf = Effect.fnUntraced(function* (
  repo: string,
  name: string,
): Effect.fn.Return<string, FileFailure | MalformedBody, FileSystem.FileSystem> {
  const path = `${repo}${yield* bodyDir(repo, "reference", name)}/${SKILL_FILE}`;
  return yield* attempt(path, (fs) => fs.readFileString(path));
});

export type Agent = {
  pi: string;
  model: string;
  thinking: string;
  extensions: readonly string[];
  timeout: Duration.Duration;
};

export type CostEstimator = (model: string, requests: readonly RequestUsage[]) => number | undefined;

export type Task = { prompt: string; files: Readonly<Record<string, string>>; judge: ProgramJudge; generator?: Generator; verifier?: Verifier };

export type ArmRun = {
  verdict: Verdict;
  spend: Spend;
  wroteTest: boolean | undefined;
  lines: string[];
  stderr: string;
  transcript: Transcript;
  changes: AgentRun["changes"];
  commits: AgentRun["commits"];
};

export const piArgs = (agent: Agent, prompt: string, skills: readonly string[] = []): string[] => [
  "--mode",
  "json",
  "--print",
  "--no-session",
  "--no-extensions",
  ...agent.extensions.flatMap((path) => ["--extension", path]),
  "--no-skills",
  ...skills.flatMap((path) => ["--skill", path]),
  "--no-prompt-templates",
  "--no-themes",
  "--no-context-files",
  "--offline",
  "--model",
  agent.model,
  "--thinking",
  agent.thinking,
  "--",
  prompt,
];

const TAIL = 2000;

const verdictBefore = (exit: Option.Option<number>, stderr: string, timeout: Duration.Duration, lines: readonly string[]): string | undefined => {
  if (Option.isNone(exit)) return `pi ran past ${Duration.format(timeout)} and was stopped`;
  if (exit.value !== 0) return `pi exited ${exit.value}: ${stderr.slice(-TAIL).trim()}`;
  const transcript = transcriptOf(lines);
  if (transcript.providerError !== undefined) return `the provider failed: ${transcript.providerError}`;
  if (transcript.unreadable > 0) return `${transcript.unreadable} line(s) of pi's stream did not decode`;
  return undefined;
};

export const armRun = Effect.fnUntraced(function* (
  agent: Agent,
  task: Task,
  carried: string,
  caller: Env,
  credentials: readonly string[],
  references: Readonly<Record<string, string>> = {},
  estimate?: CostEstimator,
): Effect.fn.Return<ArmRun, FileFailure, FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner> {
  const started = Date.now();
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const seed = yield* seeded(task.files, carried, caller, credentials, references);
      const lines: string[] = [];
      const stderr: string[] = [];
      const exit = yield* Effect.scoped(
        Effect.gen(function* () {
          const handle = yield* (yield* ChildProcessSpawner.ChildProcessSpawner).spawn(
            ChildProcess.make(agent.pi, piArgs(agent, task.prompt, Object.keys(references).map((name) => `${seed.sandbox.agentDir}/skills/${name}/SKILL.md`)), {
              cwd: seed.sandbox.repo, env: seed.env, stdin: "ignore", forceKillAfter: "5 seconds",
            }),
          );
          const [, , code] = yield* Effect.all(
            [
              Stream.runForEach(Stream.splitLines(Stream.decodeText(handle.stdout)), (line) => Effect.sync(() => lines.push(line))),
              Stream.runForEach(Stream.decodeText(handle.stderr), (text) => Effect.sync(() => stderr.push(text))),
              handle.exitCode,
            ],
            { concurrency: "unbounded" },
          );
          return code;
        }),
      ).pipe(
        Effect.timeoutOption(agent.timeout),
        Effect.mapError((error) => new FileFailure({ path: agent.pi, message: `running pi: ${error.message}` })),
      );
      const transcript = transcriptOf(lines);
      const estimated = estimate?.(agent.model, transcript.requests);
      const spend: Spend = {
        seconds: Math.round((Date.now() - started) / 1000),
        turns: transcript.requests.length,
        input: transcript.input,
        output: transcript.output,
        cacheRead: transcript.cacheRead,
        cacheWrite: transcript.cacheWrite,
        cacheWrite1h: transcript.cacheWrite1h,
        cost: transcript.cost + (estimated ?? 0),
        costEstimated: estimated !== undefined,
      };
      const said = stderr.join("");
      const why = verdictBefore(exit, said, agent.timeout, lines);
      if (why !== undefined) {
        const unjudged: Verdict = { outcome: "unjudged", why };
        return { verdict: unjudged, spend, wroteTest: undefined, lines, stderr: said, transcript, changes: [], commits: [] };
      }
      const changes = yield* changesIn(seed, task.files);
      const commits = yield* commitsIn(seed);
      const generated = task.generator === undefined ? {} : yield* generatedBy(seed, task.generator, task.files);
      const verified = task.verifier === undefined ? {} : { verified: yield* verifiedBy(seed, task.verifier) };
      const run: AgentRun = { transcript, changes, commits, generated, ...verified };
      return { verdict: verdictOf(task.judge, run), spend, wroteTest: wroteTest(run), lines, stderr: said, transcript, changes: run.changes, commits };
    }),
  );
});
