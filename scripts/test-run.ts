import { Config, Console, Effect, FileSystem, Path } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import { parseReport, reporterArgs, ReportError } from "../node_modules/@avi2dg/checks/src/testing/test-report.ts";
import { judgeSkips, passes, report, SkipGateError, workerCount } from "../node_modules/@avi2dg/checks/src/testing/test.ts";
import { readSkipDeclarations, type Environment } from "../node_modules/@avi2dg/checks/src/testing/test-skips.ts";

export const environmentOf = Config.Boolean("CI").pipe(
  Config.withDefault(false),
  Config.map((ci): Environment => (ci ? "ci" : "local")),
  Effect.mapError((cause) => new SkipGateError({ message: "cannot tell a ci run from a local one: " + cause.message })),
);

export const runFiles = Effect.fn("runFiles")(function* (
  name: string,
  root: string,
  files: readonly string[],
  covers: (file: string) => boolean,
  environment: Environment,
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const outfile = path.join(yield* fs.makeTempDirectoryScoped({ prefix: "skills-test-" }), "junit.xml");
  const workers = workerCount(undefined);
  const suitePassed = (yield* spawner.exitCode(
    ChildProcess.make(process.execPath, ["test", "--randomize", "--parallel=" + workers, "--max-concurrency=" + workers, ...files, ...reporterArgs(outfile)], {
      stdin: "ignore",
      stdout: "inherit",
      stderr: "inherit",
      cwd: root,
      env: { CI: "true" },
      extendEnv: true,
    }),
  )) === ChildProcessSpawner.ExitCode(0);
  if (!(yield* fs.exists(outfile))) {
    if (!suitePassed) {
      yield* Console.error(name + ": bun test failed before it wrote a report, so no skip was judged");
      return false;
    }
    return yield* new ReportError({ message: name + ": bun test passed but wrote no report to " + outfile });
  }
  const { results, crashedFiles } = yield* parseReport(yield* fs.readFileString(outfile));
  for (const file of crashedFiles) yield* Console.error(name + ": the worker running " + file + " crashed, so its skips were not judged");
  const judged = (yield* readSkipDeclarations(root, undefined)).filter((declaration) =>
    covers(declaration.file) && !crashedFiles.includes(declaration.file));
  const verdict = judgeSkips(results, judged, environment);
  yield* passes(verdict) ? Console.log(report(verdict)) : Console.error(report(verdict));
  return suitePassed && crashedFiles.length === 0 && passes(verdict);
});
