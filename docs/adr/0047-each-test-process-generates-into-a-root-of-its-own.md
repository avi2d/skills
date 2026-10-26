# 47. Each test process generates into a root of its own

Date: 2026-09-24

## Status

Accepted. Supersedes the consequence of 0035 that `bun test` rewrites the
`generated/` tree the harnesses load. The suite still generates what it reads,
as 0035 decided; it writes it somewhere no other process reads, and uses
`generated/` only to stage the removal of a dead process's root. Amended by
0075 on how the source reads the root: through `Config` in each Effect that
touches the tree, not into a `GENERATED_ROOT` constant as `src/bundle.ts` loads.
Superseded in part by 0089: `concurrency` is the `@avi2dg/checks` preset's half
of the cores, not 10.

## Context

`bun run mutate` ran Stryker in place at concurrency 8, and sweeps failed at
random. Every runner's test process preloads `tests/lib/emitted.ts`, which
regenerated the one `generated/` tree through that runner's active mutant, so
one runner rewrote files another was reading. On `src/fields.ts`, 42 mutants,
three landed as RuntimeError at concurrency 8 that concurrency 1 had killed or
let survive, with `EINVAL` opening `generated/claude-code/dispatcher/dispatch.ts`
and `ENOENT` scanning a link-test probe under `generated/skills/`. Concurrency 1
was stable and projected a full sweep at 12 to 15 hours.

The first repair moved Stryker to a sandbox and serialized every access to
`generated/` behind a file lock. Repeated sweeps agreed mutant by mutant, at
50.61 total over 4,149 mutants, and the agreement was the flaw: the lock
ordered the writes and left the content shared, so a test read the tree
whichever runner had written last, through that runner's mutant.
`const quoted` in `src/subagentura.ts`, mutated to `() => undefined`, was
killed in every full sweep after one test. A sweep scoped to that file lets it
survive, under the lock and without it, and the whole in-process suite run by
hand with that mutant active passes all 287 tests. Across the sweep, 419 static mutants went from Killed to Survived and
195 from Killed to RuntimeError once the sharing was removed, while the
non-static counts barely moved. A lock also cannot be made airtight: taking
over from a dead holder races, and one hung holder stalls every runner.

## Decision

**Nothing a test process writes is shared.** The preload sets
`SKILLS_GENERATED_ROOT` to `generated-<pid>` before any source module loads,
and `GENERATED_ROOT` in `src/bundle.ts` resolves every path through it, so the
bundles, the dispatch index, the Hub and the drift check all name the one root.
`bun test` never runs a preload's exit hooks, so each process leaves its
directory behind; the next one claims each dead pid's directory with an atomic
rename into `generated/` and removes it, so of several processes racing for
one, exactly one takes it.

**Stryker mutates a sandbox copy** in `../.stryker-tmp`, with `inPlace` false.
`ignorePatterns` leaves out `tsconfig.json`, whose preprocessor calls a
TypeScript API version 7 removed, and every `generated` directory: the preload
rebuilds them, and Stryker's copy fails with `ENOTSUP` on the Hub's links to
directories.

**`link()` refuses a home outside the temporary directory while
`SKILLS_UNDER_TEST` is set.** A mutant that forces `src/link.ts`'s main block
runs `install(REPO, $HOME)` in every test process, and before the refusal it
repointed the live links at the sandbox.

**`concurrency` is 10.** The machine it was measured on, an M1 Pro, has 8
performance cores, 2 efficiency cores and 16 GB. A full sweep at 10 matched one
at 8 mutant by mutant, in 19m41s against 24m23s, with about half the memory
free throughout, and a second sweep at 10 matched both. Under the tree lock, 10
flaked one mutant in 977 on a Hub scan racing another process's probe, which
private roots remove. Above 10 no core is left for another runner to take, so
more runners only queue.

## What was considered and rejected

- **Retries or longer timeouts.** Either turns a race into a slower race, and
  a retry that passes says nothing about the kill it replaced.
- **The tree lock.** It stops files tearing and leaves content shared, which
  is what inflated the score it measured.
- **Concurrency 1.** Correct, and 12 to 15 hours a sweep, two sweeps a
  baseline.

## Consequences

- **`bun test` writes none of the tree the harnesses load.** It uses
  `generated/` only to stage the removal of a dead process's root. The tree the
  harnesses load is refreshed by `bun run generate` or `bun run link` and by
  nothing else, and a green suite says nothing about whether it is current.
- **Every `bun test` leaves one `generated-<pid>/` directory** until the next
  run reaps it. Git ignores it, so the dirty-tree guard in `scripts/mutate.sh`
  does not see it; `ignorePatterns` is what keeps it out of a sweep.
- **A mutant that breaks generation lands as RuntimeError**, outside the score:
  it throws in the preload, before any test, and the runner reports an
  unhandled error rather than a failed test. All but one of the 382
  RuntimeErrors in the baseline sweeps are these.
- **The tree-lock baseline, 50.61 and 84.29, is void.** The baseline in
  `AGENTS.md` is the first measured without shared output.
