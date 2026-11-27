#!/usr/bin/env bun
import { Console, Effect, Schema } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

export class StepFailed extends Schema.TaggedError<StepFailed>()("StepFailed", {
  command: Schema.String,
  code: Schema.Int,
  message: Schema.String,
}) {}

export type Step = { readonly command: string; readonly args: readonly string[] };

const runStep = Effect.fnUntraced(function* (
  step: Step,
): Effect.fn.Return<void, StepFailed, ChildProcessSpawner.ChildProcessSpawner> {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const code = yield* Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* spawner.spawn(
        ChildProcess.make(step.command, step.args, { stdin: "inherit", stdout: "inherit", stderr: "inherit" }),
      );
      return yield* handle.exitCode;
    }),
  ).pipe(
    Effect.mapError((cause) =>
      // A shell reports 127 when the command itself cannot start.
      new StepFailed({ command: step.command, code: 127, message: step.command + " failed to start: " + String(cause) })
    ),
  );
  if (code !== 0) return yield* new StepFailed({ command: step.command, code, message: step.command + " exited with code " + String(code) });
});

export const runSteps = Effect.fnUntraced(function* (
  name: string,
  steps: readonly Step[],
): Effect.fn.Return<number, never, ChildProcessSpawner.ChildProcessSpawner> {
  for (const step of steps) {
    const code = yield* runStep(step).pipe(
      Effect.as(0),
      Effect.catchTag("StepFailed", (failure) =>
        Console.error(name + ": " + failure.message).pipe(Effect.as(failure.code))
      ),
    );
    if (code !== 0) return code;
  }
  return 0;
});
