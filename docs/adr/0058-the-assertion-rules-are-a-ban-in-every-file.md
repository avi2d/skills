# 58. The assertion rules are a ban in every file

Date: 2026-09-24

## Status

Accepted. Supersedes 0056 on the scope: both rules hold for every TypeScript
file, not only `src/` and `harness/`.

## Context

The shared kit turns `typescript/no-unsafe-type-assertion` and
`typescript/no-non-null-assertion` on for every repository that extends it,
and its suppressions ratchet refuses a new baseline, so a
repository takes the kit version that carries them by having no site left.
Here the two trees 0056 covered were already at zero; `tests/` carried 184
sites, 123 non-null and 61 unsafe, in 21 files, and `evals/` carried none.

## Decision

**Both rules are `error` at the top level of `.oxlintrc.json`, and no override
sets either.** Every site in `tests/` is narrowed the way 0056 narrowed `src/`:

- A value a test needs to exist is asserted with the test framework, which
  fails with a message: `expect.unreachable` on the absent side of a lookup,
  or an optional chain into a matcher that already fails on `undefined`.
  `tests/lib/dispatch.ts` holds the lookups the dispatch tests repeat.
- Data read from a file, a process or a loaded bundle is decoded with a
  `Schema` shaped like what the test reads. Where the whole value is handed on,
  to pi's `SettingsManager` or back to disk, the test hands on the value as
  read and decodes only its own view of it.

`tests/e2e/assertion-baseline.test.ts` reads the top-level rules, refuses an
override that names either one, and probes every directory `git ls-files`
lists TypeScript in, so a directory added later is covered without an edit.

## Alternatives

A baseline for `tests/`, as 0050 held for `src/`. The kit's ratchet refuses a
count that appeared, and 0056 pins this repository's at zero, so a baseline
was never available.

## Consequences

Taking the kit version that turns the rules on changes nothing for these two
rules here.
