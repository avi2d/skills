#!/usr/bin/env bun
import { Effect } from "effect";
import { git } from "../node_modules/@avi2dg/checks/src/core/git.ts";
import { runMain, Usage } from "../node_modules/@avi2dg/checks/src/core/main.ts";
import { environmentOf, runFiles } from "./test-run.ts";

const NAME = "test-local";
const USAGE = "usage: test-local, which runs the whole unit and e2e tiers, and it takes no arguments";

const localEntry = Effect.gen(function* () {
  if (process.argv.slice(2).length > 0) return yield* new Usage({ message: USAGE });
  const root = (yield* git(["rev-parse", "--show-toplevel"])).trim();
  const environment = yield* environmentOf;
  if (!(yield* runFiles(NAME, root, ["./tests/unit"], (file) => file.startsWith("tests/unit/"), environment))) return false;
  return yield* runFiles(NAME, root, ["./tests/e2e"], (file) => file.startsWith("tests/e2e/"), environment);
}).pipe(Effect.scoped);

if (import.meta.main) runMain(NAME, localEntry);
