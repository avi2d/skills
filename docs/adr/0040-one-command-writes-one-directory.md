# 40. One command writes one directory

Date: 2026-09-22

## Status

Accepted. Puts the Hub 0029 made a directory of links, and 0039 reduced to one,
inside the root 0021 untracked. Narrows 0029's last consequence: `generated/`
is no longer Dispatcher output only, since the Hub lives under it, and the
drift comparison 0021 describes skips the Hub. The bundles are still written
whole and the Hub is still reconciled; only the number of directories that
takes changes.

## Context

`bun run generate` produced two top-level directories and nothing said why from
the outside. `generated/` held the Dispatcher bundles. `hubs/` held the Hub.
Both were ignored, both were absent from a clone, both were written by the same
command, and a reader had to learn four facts to work here: two emitted trees,
two `.gitignore` stanzas, two write disciplines, and neither present until
something builds them. `README.md` spent two bullets on the split and
`AGENTS.md` a paragraph.

The second directory was never about where the bytes go. It was about how they
are written. `generated/` is wiped and rewritten whole, because everything in
it comes from the generator. A Hub cannot be, because the root a harness reads
is shared ground and another installer's Body sits in it - the reason 0029
gives, and the one `no-mistakes` demonstrated by installing into both roots.

That is a property of a subdirectory, not of a top-level name.

## Decision

The Hub is `generated/skills`, and `hubs/` is gone. One command, one
directory, one `.gitignore` stanza, one paragraph.

Two places had assumed the whole of `generated/` was the generator's, and both
are narrowed by one path rather than by a new concept:

- `write` wiped `generated/` before writing. It now removes each entry under it
  except the Hub. A stale `generated/<harness>/` from a Dispatcher that no
  longer exists is still taken, which is the property the wholesale wipe was
  really for.
- `drift` reported any file under `generated/` the generator did not write. It
  now skips the Hub subtree. Without that, the first foreign Body installed
  into the Hub turns the suite red for existing - which is 0022's rejected
  `~/.codex/skills` option arriving from the other side, and the one way this
  change could have made the repository worse.

Both are held by tests that were watched failing: wiping the whole root takes a
planted foreign Body, and letting `drift` read the Hub reports it as
ungenerated.

## What was considered and rejected

- **Keeping the two directories.** Nothing is wrong with either, and that is
  the point: the cost is a reader's, paid on every visit, for a distinction
  that is visible in the code that writes them.
- **`generated/hub` rather than `generated/skills`.** The directory is what
  `~/.agents/skills` and `~/.claude/skills` resolve to, and a harness reading
  it finds skills. `hub` is this repository's word for it; `skills` is the
  harness's.
- **Teaching `write` the list of roots it may wipe, from the bundle specs.**
  It reads better until a Dispatcher is deleted, at which point the directory
  it used to write is no longer in the list and stops being cleaned up. The
  exclusion is one path and covers that case by construction.
- **A marker file in the Hub that `drift` looks for.** A second thing to keep
  in step with the constant that already names the directory.

## Consequences

- **A machine that linked before this needs `bun run link` again.**
  `~/.agents/skills` and `~/.claude/skills` point at `hubs/`, which this change
  stops writing. The retirement 0039 added handles the previous move and not
  this one: `hubs/` is now outside the root the reconcile walks, so what is
  left there is left there. It holds links into this tree plus whatever another
  tool installed, and removing it is a manual `rm -rf hubs` after the relink,
  in that order.
- **`generated/` is no longer wholly the generator's**, and the two rules that
  assumed it was are now written down rather than implied. A third would have
  to be found by whoever adds it.
- **The emitted tree is one line in `.gitignore`** and the repository has two
  directories a clone does not carry rather than three.
