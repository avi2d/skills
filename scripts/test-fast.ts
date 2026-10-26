#!/usr/bin/env bun
import { Console, Effect, FileSystem, Path, Schema } from "effect";
import { changedPaths, defaultBranch, git, rangeEnds, type Change } from "../node_modules/@avi2dg/checks/src/core/git.ts";
import { runMain, Usage } from "../node_modules/@avi2dg/checks/src/core/main.ts";
import { environmentOf, runFiles } from "./test-run.ts";

const NAME = "test-fast";
const USAGE = "usage: test-fast, which runs the unit tier and the e2e test files the change touches, and it takes no arguments";

const UNIT_DIR = "./tests/unit";
const UNIT_PREFIX = "tests/unit/";
const E2E_PREFIX = "tests/e2e/";
const TEST_SUFFIXES = [".test.ts", ".test.tsx"] as const;

export function keptPaths(changes: readonly Change[]): readonly string[] {
  return changes.filter((change) => change.kind !== "deleted").map((change) => change.path);
}

export function touchedE2eFiles(paths: readonly string[]): readonly string[] {
  const picked = new Set<string>();
  for (const path of paths) {
    if (!path.startsWith(E2E_PREFIX)) continue;
    if (!TEST_SUFFIXES.some((suffix) => path.endsWith(suffix))) continue;
    picked.add(path);
  }
  return [...picked].sort();
}

class BaseUnresolved extends Schema.TaggedError<BaseUnresolved>()("BaseUnresolved", {
  message: Schema.String,
}) {}

const splitZero = (output: string): readonly string[] => output.split("\0").filter((line) => line !== "");

const touchedFiles = Effect.fn("touchedFiles")(function* (root: string) {
  const target = "origin/" + (yield* defaultBranch(root));
  const range = yield* rangeEnds(target, "HEAD", root).pipe(
    Effect.mapError((cause) => new BaseUnresolved({
      message: "cannot find where HEAD branched from " + target + ", so the e2e files the change touches are unknown; fetch " + target + " and run again: " + cause.message,
    })),
  );
  const committed = keptPaths(yield* changedPaths(range.base, range.head, [], root));
  const working = splitZero(yield* git(["diff", "--name-only", "-z", "HEAD", "--"], root));
  const untracked = splitZero(yield* git(["ls-files", "--others", "--exclude-standard", "-z"], root));
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  return yield* Effect.filter(touchedE2eFiles([...committed, ...working, ...untracked]), (file) =>
    fs.exists(path.join(root, file)), { concurrency: "unbounded" });
});

const fastEntry = Effect.gen(function* () {
  if (process.argv.slice(2).length > 0) return yield* new Usage({ message: USAGE });
  const root = (yield* git(["rev-parse", "--show-toplevel"])).trim();
  const files = yield* touchedFiles(root);
  const environment = yield* environmentOf;
  if (!(yield* runFiles(NAME, root, [UNIT_DIR], (file) => file.startsWith(UNIT_PREFIX), environment))) return false;
  if (files.length === 0) {
    yield* Console.log(NAME + ": the change touches no e2e test files, so only the unit tier ran");
    return true;
  }
  yield* Console.log(NAME + ": the change touches " + files.length + " e2e test file(s): " + files.join(" "));
  return yield* runFiles(NAME, root, files, (file) => files.includes(file), environment);
}).pipe(Effect.scoped);

if (import.meta.main) runMain(NAME, fastEntry);
