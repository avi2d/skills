# 105. The mutation config is the kit's preset and the unit test files

Date: 2026-11-07

## Status

Accepted.
Supersedes the decision of 0047 that Stryker mutates a sandbox copy, and the parts of 0049 and 0070 on `ignorePatterns`.

## Context

One shared advisory mutation workflow, separate from `ci.yml`, replaces each repository's own mutation setup.
Each repository's setup is removed before that workflow is built.
Here that setup was the `mutate` and `mutate:incremental` scripts, `scripts/clean-tree.sh`, which only `mutate` called, and the keys `stryker.conf.mjs` set beyond the kit's preset: `bun.testFiles`, `inPlace`, `ignorePatterns` and `disableTypeChecks`.

## Decision

The scripts and `scripts/clean-tree.sh` go, and `stryker.conf.mjs` spreads the kit's `stryker.preset.js` and sets only `bun.testFiles` to the preset's `unitTestFiles()`.

`bun.testFiles` stays because `stryker run` cannot finish without it.
Without it the runner runs every test, the out-of-process ones under `tests/e2e/` included, and the initial test run passes the preset's 60-second timeout and fails the run.
With it, `stryker run --mutate src/dispatcher/glob.ts` scored 94.51, the same score the removed config gave.

## Consequences

- Stryker mutates the working tree in place, as the preset sets, and restores the files it mutated from its backup when the run ends.
- A mutant can write into the `generated/` tree the harnesses load, and Stryker does not restore that tree, so `bun run generate` rebuilds it after a run.
- `disableTypeChecks` is Stryker's default, so every file under `src/` carries `// @ts-nocheck` while the run lasts.
- Leave `src/` untouched until the run ends, since the restore overwrites an edit made during the run and a commit made during the run records mutated files.
