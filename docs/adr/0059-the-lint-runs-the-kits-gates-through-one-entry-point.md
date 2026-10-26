# 59. The lint runs the kit's gates through one entry point

Date: 2026-09-24

## Status

Accepted. Amends 0051: each Dispatcher bundle ships the kit's
`scripts/comment-matchers.ts`, not its `scripts/comments.ts`. Corrects 0055,
which said `extends` replaces the language service's `plugins` block.
Narrowed by 0069, after which the effect-scope test asserts only the
diagnostics the kit alone raises to `error`.
Partly superseded by 0096, after which the title lint is a step of the ci
`checks` job.

## Context

`bun run lint` chained six of the kit's bins. Two of them took a range this
repository resolved by hand, `git merge-base HEAD origin/main` falling back to
`HEAD^`, and `checks-commit-identity` read `HEAD` alone. The comment gate, the
suppressions ratchet and commit identity ran again on every pull request from
a workflow each, and `ciWiring.gates` declared each one. `@avi2dg/checks`
0.8.0 ships `checks-lint`, which resolves the range once, locally and in a pull
request, and runs every kit lint gate over it.

0.8.0 also moved the kit's `scripts/comments.ts` onto Effect: it imports
`effect` at runtime and `refused` returns an `Effect`. A linked Dispatcher has
no `node_modules`, so `bun run generate` refused every bundle. 0.9.0 splits the
matchers into `scripts/comment-matchers.ts`, which imports nothing, and keeps
the Effect API in `scripts/comments.ts` for the kit's own bins.

`tsconfig.json` restated the kit's eleven language-service severities beside
its scope override, on 0055's word that `extends` replaces the block. It does
not: effect-tsgo merges the two. Without the restated copy, effect-tsgo 0.45.0
reports the same diagnostics on a probe. Without the kit's `extends` as well,
`anyUnknownInErrorContext` and `unsafeEffectTypeAssertion` are off and
`catchAllToMapError` is a message.

## Decision

**`lint` is `oxlint --type-aware && checks-lint && bun run lint:deps`.** Which
range the gates read, and which gates run, is the kit's to decide. On a pull
request the suite's `bun run lint` step runs them, from a checkout that fetches
the whole history the merge base needs. The three per-gate workflows and their
`ciWiring.gates` entries are deleted. ci-wiring counts a `bun run lint` step
for the `bun run lint` gate alone, so `tests/e2e/toolchain.test.ts` pins that
the script runs `checks-lint`.

**commitlint keeps its own workflow.** It reads the pull request's title, not
a range, and runs again when the title is edited.

**Each bundle ships `scripts/comment-matchers.ts` as `comments.ts`.**
`src/comments.ts` re-exports it and the suite reads it; the rest of 0051
stands.

**`tsconfig.json` declares the scope override and nothing the kit sets.**
`tests/e2e/effect-scope.test.ts` typechecks a probe in `tests/`, outside the
override, and fails unless each diagnostic the Effect Rule leans on is refused
at `error`.

## Consequences

The kit's suite covers the range: merge base against the origin default
branch, a pull request's head, a push to the default branch. The four tests
here that drove the hand-written range through a scratch repository are
deleted.

The suite does not run on `edited`, so a pull request retargeted at another
base branch meets the range gates on its next push rather than at the edit.

A gate the kit adds to `checks-lint` runs here without an edit.
