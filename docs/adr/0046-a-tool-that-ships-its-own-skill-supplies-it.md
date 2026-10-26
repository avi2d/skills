# 46. A tool that ships its own skill supplies it

Date: 2026-09-23

## Status

Accepted. Supersedes the paragraph of 0041 that carried `no-mistakes` as a
managed Body pinned to an upstream commit. The tree holds no Skill again, and
`skills/.gitkeep` is back.

## Context

`no-mistakes` embeds its own skill and installs it: `internal/skill` renders
the single `SKILL.md`, and `init` writes that rendering into the user-level
skill roots, `~/.agents/skills` and `~/.claude/skills`.

Carrying a copy pinned to an upstream commit meant re-pinning by hand on every
release, and the copy drifted from the binary on the machine: the tree
described 1.81.0 while the machine ran 1.79.0. A skill that disagrees with the
binary it documents is worse than no skill, because the text is read as
instructions for the tool standing next to it.

On a linked machine those two roots are not somewhere else. `bun run link`
points both at `generated/skills/`, the Hub, so `init` writes a real
`no-mistakes/` directory through the links into the Hub itself. 0029 recorded
that happening, 0039 kept the Hub ignored because of it, and 0040 kept the Hub
out of the wipe for the same reason. `reconcile` already reports such an entry
as `left` and touches nothing in it.

## Decision

The repository carries no copy of the skill and does nothing to supply one.
The binary's own `init` installs it through the linked roots into the Hub, and
generation leaves that directory where it is: the wipe spares the Hub, `drift`
does not read it, and `reconcile` leaves an entry it did not link. The suite
holds that path, from a write through a linked root to a second generate that
reports the entry as `left` with its text intact.

Copying the installed file into the Hub during generation was tried and
refused. On a linked machine the source and the destination are the same
file, so the copy did nothing but add a way for generation to fail over a file
another tool wrote.

Running the installer during generation was refused as well: `init` against a
temporary home registers a launchd daemon for that home, takes twelve seconds
on a cold data directory, and leaves the daemon behind pointing at a deleted
path.

## Consequences

- The skill is whatever the installed binary last wrote, so it is as current
  as the user's last `init`. This repository neither refreshes it nor notices
  when it is stale.
- The first `bun run link` or `bun run generate` after this change unlinks the
  old `no-mistakes` entry, which was a link to the deleted Body. Until
  `no-mistakes init` runs again, neither harness is offered the skill.
- A clone or worktree whose Hub no harness reads has no `no-mistakes` entry,
  and needs none.
- Nothing here names the upstream, so `NOTICE.md` carries no entry for it.
