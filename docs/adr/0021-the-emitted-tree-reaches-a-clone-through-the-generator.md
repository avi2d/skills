# 21. The emitted tree reaches a clone through the generator

Date: 2026-09-14

## Status

Accepted, and narrowed by 0029: a Hub is no longer emitted, so what this record
says about `generated/` now covers the Dispatcher bundles and the dispatch
index; 0040 then moved the Hub inside that root, where the drift comparison
skips it. The ordering rule it sets, write before linking, is unchanged and
applies to the Hubs as well. 0035 decides the other way on one consequence
below: `bun test` now generates the tree itself before the first test, so a
fresh clone no longer needs `bun run generate` first. Amends 0004, which made
the working tree the installed version, and narrows one consequence of 0014.

## Context

`generated/` has been in the index since the tree was laid out, for a stated
reason: a change to what a harness sees is a diff. The cost is that every
change to the source lands twice. The comment sweep that prompted this touched
17 files under `src/` and `rules/` and 10 under `generated/`, and the second
ten are the first seventeen again, reformatted by a program.

The emitted copy carries nothing the Bodies do not. `bun run generate --check`
already proves that byte for byte, which is the same as saying the second copy
in the index is a cache. A reviewer reading it is reading the generator's
output rather than anybody's decision, and a reviewer skimming past it is doing
what the file deserves while the diff is still charged for it.

What the checked-in copy did buy is a clone that has a Hub without running
anything. That is load-bearing here rather than a nicety: four of the paths
`src/link.ts` installs into `$HOME` point into `generated/`, and 0004 made the
working tree the artifact. `bun run link` has never run the generator, so a
clone that linked before generating would point `~/.claude/skills`,
`~/.agents/skills` and both Dispatchers at directories that do not exist. That
is #9 exactly: the links were right, what they pointed at was not there, and
Claude Code ran for two weeks with no Skills because nothing said so.

## Decision

`generated/` is ignored and out of the index. History keeps it: the commits
that carried it are what they were, nothing reads an emitted file out of an old
commit, and a rewrite would cost every clone a reset to buy a smaller pack file.

The clone gap is closed at the one command that could open it. `bun run link`
writes the tree and then installs the map, in that order, and the ordering is
the point: either order ends with the same `$HOME` when generation succeeds,
and they differ on the run that stops on a bad Body. Linking first would leave
`$HOME` pointing into a tree that was never written, which is #9 arriving by a
new road.

`.github/workflows/suite.yml` runs `bun run generate` before the typecheck and
the suite, because the clone it runs on is now a clone without a Hub.

## What was considered and rejected

- **Keeping it in the index and living with the noise.** The noise is paid by
  a human on every pull request, in the currency that decides whether the real
  half of a diff gets read.
- **Untracking it and having `link` refuse when the tree is absent**, naming
  `bun run generate`. It reports a failure the linker is holding everything it
  needs to prevent: generation is deterministic, wholesale and takes about a
  tenth of a second. An instruction to run the command the program could have
  run is a step that exists to be forgotten, and the thing it would be
  forgotten into is #9.
- **Rewriting history.** Asked about and declined: the working tree is what
  needs to change, not the record of what was committed.
- **A CI job that generates and commits the result back.** Gives the branch a
  second writer, to restore a copy that has just been established as one the
  repository does not need.

## Consequences

- **A pull that lands this deletes `generated/` from a working tree that had
  it**, and every symlink installed from that checkout dangles until
  `bun run generate` or `bun run link` runs there. Once per machine, and it is
  the one moment this change can reproduce the outage it is guarding against.
- **`bun test` on a fresh clone needs `bun run generate` first.** `README.md`
  says so and the workflow does it. Skipping it goes red on a test whose
  message names the command.
- **A change to what a harness sees is no longer a diff.** 0014's consequence
  that a change to a fan-out is reviewable under `generated/` now means
  reviewable by generating the branch. What a review reads is the Body and the
  generator, which is where the decision was in either case.
- **The byte-for-byte comparison changed what it proves.** It was "this commit
  carries a stale copy", a failure that no longer exists, and it is now "a
  second run agrees with the first", which is where a nondeterministic emitter
  shows up. The suite reads bytes rather than `git status` to say it, since git
  reports nothing about an ignored path however much is written to it.
- **A test asking what a clone gets asks git and the generator**, through
  `tests/lib/clone.ts`. Asking only git reports all four Hub and Dispatcher
  links as links to nothing.
