# 8. The set directory takes the name the root symlink held

Date: 2026-08-28

## Status

Accepted, and its subject is gone. #8 deleted `vendor/`, `sets/` and `shared/`,
so the three map entries that named a Set went with them, the test that walked
the symlinks went with the symlinks, and Set is no longer a term `CONTEXT.md`
defines.

What survives is the part that was never about Sets: the map is the whole
account of what $HOME takes from here, and every entry in it is held to being a
path git has and this checkout resolves.

Narrowed by 0009, which closes the window this record left open between a clone and the checkout the suite runs in.

Amended by 0079: `~/.pi/agent/settings.json` left the map for `MERGED`, and the two together are the whole account of what $HOME takes from here.

What follows is left as it was written, so two of its consequences now describe
a tree nobody has. The third is half true: the promise still stops at the path
the map names, and `tests/link.test.ts` is where that is asserted now, but the
walk it describes one level below that went with the symlinks only a Set had.
It names `tests/symlinks.test.ts`, which is not in the tree; the walk is in the
history of #8 and the reasoning for it is in #45. The fourth has no subject at
all, there being no Set to select.

Written as the decision #40 asked for, and an amendment to 0004's account of
what the suite holds the linker's map to.

## Context

Before the Kind model, two symlinks at the repo root named whichever Set was
active: `skills -> sets/<name>/skills` and `agents -> sets/<name>/agents`.
`4f0b53a` untracked both and ignored them, because a symlink that says which
Set is active is a local choice rather than a fact about the repository.

The Kind model then took `skills` back. It is the Skill Kind's directory now,
tracked, and the `.gitignore` line that covered it went with it. `agents` was
left as it was, still pointing at `sets/mattpocock/agents`, still ignored.

0004 put the linker's map in `src/link.ts` and had the suite hold it complete:
"every declared link resolves into the repo". The map named `agents`, so the
check asked the disk whether `agents` was there. In the checkout the symlink had
been made in, it was. In a clone, a worktree, or anywhere else, it was not, so
`bun test` was red for everybody except the one machine that wrote it (#40).
Every `workflows/implement` run starts by cutting a worktree, which is where a
suite that is red on arrival costs the most.

The disagreement was never about the sub-agent definitions. `.gitignore` said
the repository did not own `agents`; `src/link.ts` said $HOME should point at
it. Both were describing the same tracked directory under two names.

## Decision

The root `agents` name is retired, and both links name the Set directory
directly:

```ts
".claude/agents": "sets/mattpocock/agents",
".agents/agents": "sets/mattpocock/agents",
```

which is what `~/.claude/skills` already did for `sets/mattpocock/skills`. The
`/agents` ignore rule goes with the symlink it was written for.

The suite asks git what the repository tracks rather than asking the disk what
is present. A target that is in no clone now fails in every checkout, including
the one that happens to hold it, which is the property #40 asked for and the
one the old check could not give.

## What was considered and rejected

- **Track the root `agents` symlink and drop the ignore rule.** #40's first
  route, and the end state is the same, minus a second name for one directory.
  Two names is what let the linker and `.gitignore` disagree in the first
  place.
- **Drop the two links, on the reading that the harvest retires the
  directory.** #40's second route. The harvest is carrying Bodies out of
  `vendor/`, `sets/` and `shared/`, and it has not reached the sub-agent
  definitions. Dropping the links would take `comment-sicko` away from both
  harnesses to fix a test.
- **Ask `git ls-tree -r HEAD` instead of the index.** Strictly the question a
  clone answers, and it turns the suite red for the length of any uncommitted
  change that adds a target. The index keeps the edit-test-commit cycle green
  and leaves one narrow window, a target staged and never committed, which the
  next commit closes.

## Consequences

- **A checkout that predates this keeps an untracked `agents` symlink.** It
  used to be ignored and is now visible in `git status`. Removing it is manual,
  and the order matters: `bun run link` first, so $HOME stops pointing through
  the old path, then delete it. Doing it the other way leaves both sub-agent
  directories resolving to nothing until the relink runs. `src/link.ts` carries
  the general form of that ordering beside the home-manager one.
- **0004's third bullet is narrowed.** "Every declared link resolves into the
  repo" is now "every declared link has a target git has and this checkout
  resolves". The two questions fail apart: a target present and untracked is in
  no clone, and a target tracked and deleted is one `link()` would point $HOME
  at right now.
- **The promise stops at the path the map names.** What a linked directory
  holds was walked by nothing. Every entry under `sets/*/` is a symlink back out
  of itself into `vendor/` or `shared/`, and their far ends were tracked by luck
  rather than by assertion. #45 was that walk, and `tests/symlinks.test.ts` is
  where it landed.
- **Selecting a different Set is now an edit to the map** rather than a
  repointing of an untracked symlink. That is more visible and less
  convenient, and the visibility is the point: which Set is active becomes a
  diff.
