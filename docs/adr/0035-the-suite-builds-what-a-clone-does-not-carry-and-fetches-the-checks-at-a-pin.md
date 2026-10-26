# 35. The suite builds what a clone does not carry, and the checks arrive at a pin

Date: 2026-09-22

## Status

Accepted. Superseded by 0044 on how the checks are consumed: they come from
npmjs as `@avi2dg/checks` by range, not from `github:avi2d/checks` at a commit.
Superseded by 0047 on where the suite writes: each test process generates into
a `generated-<pid>/` of its own, writes none of the `generated/` tree the
harnesses load, and uses `generated/` only to stage the removal of a dead
process's root.
Decides the other way on one consequence of 0021, which left
`bun test` red on a fresh clone until somebody ran `bun run generate`. The
ordering rule 0021 set for `bun run link`, write before pointing `$HOME`
anywhere, is unchanged and is now the argument for this.

## Context

`bun test` was red in three different ways at once, and none of them was a
failing assertion about this repository's behaviour.

**Red in a clone.** 7 of 520 tests fail on a checkout nobody has generated in:
the three link tests, the Hub membership test, and the three generated-tree
tests. Every message names `bun run generate`, which is 0021 working as
designed - it closed the clone gap inside `bun run link` and left `bun test`
to say so. The cost has been paid ever since by everything that reads a green
suite as a starting condition.

**Red in a worktree.** `"@avi2d/checks": "file:../checks"` resolves beside the
checkout. It is there in `~/Projects/skills` and in nothing else, so
`bun install` reported `Failed to install 1 package` and the six
`tests/effect-channel.test.ts` tests went red on a missing plugin. Two of them
are the ones that expect no findings, so they did not go red; they passed
because oxlint had no rule loaded. `.github/workflows/suite.yml` carried a
second `actions/checkout` to paper over this in CI, which is the shape of a
layout requirement no clone can satisfy. `workflows/implement` starts by
cutting a worktree, which is where a suite that is red on arrival costs the
most - the same failure 0008 recorded, arriving by a new road.

**Red on the run order.** `describe("the Dispatcher bundle")` held a
`const emitted = new Map()` that one test filled and four others read. Under
`bun test --randomize` the readers can run first: seeds 1 and 2 give one extra
failure, seed 3 gives two. The quiet half is worse than the loud half. `nothing
in it reaches for bun` iterates that map, so running it first scanned nothing
and passed - a check that could not fail, guarding the one property a linked
directory cannot recover from.

## Decision

**The suite generates what it reads.** `bunfig.toml` preloads
`tests/lib/emitted.ts`, which runs the same `checkout(REPO)` that
`bun run generate` runs. This is 0021's own argument applied to the second
command: "An instruction to run the command the program could have run is a
step that exists to be forgotten." `bun run generate` stays in the workflow,
because `bun run lint` and `bun run typecheck` run before `bun test` and read
the emitted tree.

**`@avi2d/checks` is fetched from its repository at a commit**,
`github:avi2d/checks#2ee16e9`. `dist/index.js` is tracked there and CI holds it
to the source with `git diff --exit-code dist/`, so a git dependency needs no
build step at install. The sibling checkout leaves `.github/workflows/suite.yml`
with it. `tests/toolchain.test.ts` refuses a `file:` or `link:` dependency and
refuses a repository dependency that names anything but a 40-character commit.

**The bundle is a memoised value rather than a shared map.** Each test awaits
`emittedBundle()`, and the scan for `Bun.` asserts it had modules to read before
it reads them. `bun test --randomize` is what the workflow runs, so an order
dependency fails the run rather than waiting for a seed nobody passes. A
randomized run prints `--seed=<n>` in its summary, so a red CI reproduces
locally with one flag.

## What was considered and rejected

- **Publishing `@avi2d/checks` to a registry.** This was the captain's answer to
  the question as it was put to him, and the question left out two facts.
  npmjs needs credentials and a second factor this worktree does not have.
  GitHub Packages needs every consumer to hold a token in `.npmrc`, including a
  fresh clone and CI, which re-creates the failure being fixed - a checkout that
  cannot install. A pinned git dependency reaches a clone, a worktree and CI
  with nothing configured, and it pins the way `repos/<name>.toml` pins a
  library (0027). Publishing stays available and is a smaller change from here
  than it was from `file:`.
- **Keeping the sibling `actions/checkout` and fixing only the worktree.** It
  would leave CI green and every local worktree red, which is the arrangement
  0008 was written about.
- **Having the suite refuse when the emitted tree is absent, naming the
  command.** That is what it does today. 0021 rejected the same move for
  `bun run link` and the reasoning transfers whole.
- **Committing `generated/` and `hubs/` so no build is needed.** 0021's
  argument stands: the same change lands twice in every diff, and `hubs/` would
  put another installer's Body into this repository's index (0029).
- **`beforeAll` for the bundle.** Simpler, and it moves "the real bundle emits
  without throwing" out of the test that is named for it. The memoised call
  keeps every test's own message.
- **`--randomize` in the `test` script rather than the workflow.** A local run
  that varies is harder to bisect against, and the property is one CI is for.

## Consequences

- **`bun test` writes to the working tree.** It rewrites `generated/` and
  reconciles `hubs/` before the first test, which is what `bun run generate`
  already did to the same paths. A Hub entry another tool installed is left
  alone, because the reconciler is the one doing the writing.
- **The seven messages naming `bun run generate` are unreachable** from a
  fresh clone. They still fire for a tree the generator would write differently,
  which is the failure they were really for.
- **Re-pinning the checks is an edit to one line and a `bun install`.** Nothing
  reads the sibling checkout any more, so a stale `~/Projects/checks` no longer
  changes what the suite proves.
- **A red CI names a seed.** Reproducing an order failure is
  `bun test --randomize --seed=<n>`.
