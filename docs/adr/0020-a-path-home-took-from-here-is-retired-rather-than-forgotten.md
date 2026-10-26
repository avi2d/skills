# 20. A path $HOME took from here is retired, rather than forgotten

Date: 2026-09-14

## Status

Accepted. Records `RETIRED` in `src/link.ts` and the ownership check in
`tests/link.test.ts`. Amends docs/adr/0004, which said the linker owns
nothing it is not currently told about, and left no way to say "no longer".

## Context

`~/.claude/skills` and `~/.claude/agents` pointed at
`sets/mattpocock/skills` and `sets/mattpocock/agents`. Commit 2cea1c5
retired that directory on 30 August. Both links survived it, pointing at
nothing, and Claude Code loaded no skills at all for two weeks before
anybody noticed.

Nothing was broken, which is the interesting part. `src/link.ts` says the
map "is what $HOME takes from here NOW: the linker owns nothing it is not
currently told about, so a dropped entry keeps its last target until a
human removes it", and that is exactly what happened. The suite holds
every *declared* link to a target git has, so it had nothing to say about
a link that was no longer declared. The map could add and repoint. It had
no vocabulary for letting go.

A dead symlink is a bad failure because it is silent from both ends. The
repository looks tidy: no entry, no target, nothing to check. The harness
looks configured: a `skills` directory is right there in `~/.claude`.
Only something that reads it finds out, and a model that was handed no
skills does not report the absence of instructions it never knew about.

## Decision

**`RETIRED` lists the paths $HOME used to take from here, and `bun run
link` removes them when they are still ours.**

- Ours means: the path is a symlink, and its target is inside this
  repository. A real file or directory is left alone, and so is a symlink
  pointing somewhere else - the same judgment `refused` already makes for
  the install side, for the same reason. What another owner put there
  deserves a human, not a delete.
- The outcome is reported as `retired`, so `bun run link` prints what it
  let go of rather than doing it quietly.
- The suite holds a path to being in `LINKS` or in `RETIRED` and never
  both, so the linker is never told to install and remove the same path.

Retiring an entry is therefore a two-step edit, deliberately: drop it from
`LINKS`, add it to `RETIRED`. The second step is the one that reaches the
machines the first step was supposed to change.

`.claude/agents` is retired rather than repointed. Claude Code reads
subagent definitions from there, and this repository has never held one:
what is harness-specific here is a Dispatcher, which is generated and
linked at `.claude/skills-dispatch`. There is nothing to point it at, and
a link to nothing is what this ADR is about.

## Consequences

- `RETIRED` grows and is never pruned, because a machine that has not run
  `bun run link` since the entry was added still has the dead path. Each
  line costs one `lstat` per install, which is nothing.
- The related hole is closed in the same pass: the suite now resolves the
  file each Claude Code hook actually runs, not just the directory it sits
  under, so a hook pointing into a Hub at a file the repository does not
  have fails the build instead of failing silently at runtime.
- Nothing here detects a dead link the map was never told about. The
  guarantee is that a link this repository made and then dropped gets
  cleaned up, not that $HOME is audited.
