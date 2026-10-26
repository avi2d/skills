# 37. The suite workflow is where a clone-only claim gets checked

Date: 2026-09-15

## Status

Accepted. Numbered 28 when it was written, which another record already held;
nothing cited it under that number. Amended by 0070: `suite.yml` is replaced by
the `ci.yml` `checks-quality` generates, which runs on every pull request and
every push to main rather than on every push.

## Context

Half of what this repository's suite tests is a claim about what a clone gets:
which paths git tracks, which symlinks resolve, which files the map installs.
Before `.github/workflows/suite.yml` existed, every one of those claims was
only ever checked in a checkout that already existed, which is the one place
they cannot fail. #40 was exactly that: `tests/link.test.ts` passed on the one
machine that had run `bun run link` and failed in every fresh worktree,
because it reported where it ran rather than what the repository contained.
#46 named the general case: nothing ran the suite anywhere but a developer
machine, so "what a clone gets" was untested by construction.

## Decision

`suite.yml` runs on push and pull request, on a runner rather than a developer
machine, and the interesting part is what it does not carry over. `bun run
link` never runs, so `$HOME` holds no `.claude` and no `.pi`, and a test that
reads one has to pass or skip and say why. Nothing stages a file without
committing it, so a target that only exists in an index is a target this
checkout does not have.

`generated/` is the one thing a developer machine has that this run builds
instead of carrying over: it is in no clone (0021), so `bun run generate` runs
before `bun run typecheck` and `bun test`, and the run's own copy is what the
suite's byte-for-byte comparison proves moved with the commit. A stale emitted
tree is no longer something a commit can carry, so that comparison is now a
claim about the generator rather than about the commit: that a second run on a
clean clone agrees with the first, which is where a nondeterministic emitter
would show up.

## Consequences

- A test that reads `$HOME` has to pass on a machine that never ran `bun run
  link`, or skip and say why, the way the herdr-dependent checks already do.
- A target staged and never committed, named by a committed link, turns this
  run red for everybody rather than passing on the one machine that staged it.
- The generated-tree comparison changed what it proves: not "this commit
  carries a stale copy," which stopped being possible once `generated/` left
  the index, but "a second run on a clean clone agrees with the first."
