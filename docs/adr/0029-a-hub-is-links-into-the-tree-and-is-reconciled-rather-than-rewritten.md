# 29. A Hub is links into the tree, and is reconciled rather than rewritten

Date: 2026-09-15

## Status

Accepted. Narrows 0021, which made the emitted tree the generator's to write
whole, and keeps its ordering rule. 0039 has since taken one exception to the
firebreak below: when the reconcile retires a per-harness root this repository
wrote, a Body another tool installed there is moved into the one Hub rather
than left in a directory that is being removed. 0040 narrows the last
consequence below: the Hub now lives inside `generated/`, so that root is no
longer Dispatcher output only, and the drift comparison over it skips the Hub.

## Context

A Hub was a copy. `bun run generate` read every Body and wrote its bytes a
second time under `generated/<harness>/skills`, then `$HOME` pointed at that.
Comparing the two trees on the day this was written: 150 files each, 34
identical and 0 different for pi, 35 identical and 0 different for Claude Code.
Every byte in a Hub was a byte in the tree already.

What the copy bought was the filter. `selection.toml` decides which Bodies are
active and the `harnesses` field decides which harness receives one, so a Hub
is a smaller set than the tree rather than the whole of it. That is real work
and it survives here. The copying was not: it bought a second version of every
Body, and a second version needs a freshness check, which needs a suite that
runs it, which is the machinery this repository has been carrying to detect a
problem it could have refused to have.

The copy also had a second failure the check could not see. Both roots a Hub
installs into, `~/.agents/skills` and `~/.claude/skills`, are the standard
places any tool installs a skill. One did: `no-mistakes` wrote its own Body
into both, which meant physically into this repository, which meant the next
`bun run generate` would delete it, because the generator's write is a wipe and
a rewrite. The directory dates said it plainly - every other entry written at
13:44 by the last generate run, that one at 15:04 by somebody else, and the
only entry with no source behind it. A Body another tool installed is not this
repository's to adopt and not its to destroy.

## Decision

A Hub is a directory of symlinks. `hubs/<harness>/<name>` points at the
directory the Body is written in, `rules/unslop` or `skills/tdd`. No Body's
bytes are copied anywhere.

A copy can drift and needs detecting. A link cannot, so the drift a check used
to look for is now a state the design cannot reach. Two of the three harnesses were read rather than assumed: pi's loader calls
`statSync` on a symlinked entry and follows it, and Claude Code lists a Body
reached through two symlinks, a home link to the Hub and a Hub entry to the
Body. Codex was not, because no Codex is installed on the machine this was
built on. It shares pi's Hub at `~/.agents/skills` (0022), so a Codex that
skips a symlinked directory loses every Body it reaches by name, and that is an
open question rather than a verified claim.

The Hub is reconciled, not rewritten. An entry that is a symlink into this
repository is one this step made, and it is removed when its Body leaves the
Hub and repointed when the Body moves. Everything else in the directory is left
exactly as found and reported as left alone: a real directory another installer
wrote, or a link into somebody else's tree.

`bun run generate` writes `generated/` and reconciles `hubs/`, so one command
still produces everything a clone does not carry, and `bun run link` runs it
before it points `$HOME` anywhere. That is 0021's ordering rule unchanged.

## What was considered and rejected

- **A better freshness check over the copies.** It was the obvious answer and
  it is the weaker one. A check reports drift after it happens and only where
  somebody runs the check. Links make drift unrepresentable, which is the
  standing preference for a program over a rule, taken one step further.
- **Adopting the foreign Body into the tree.** Refused at the source: that Body
  belongs to the tool that installs it, and a repository that adopts what lands
  in its output directory is a repository with an unowned dependency in it.
- **Pointing pi at `rules/`, `skills/` and `references/` through its settings,
  and skipping a Hub for pi entirely.** pi does document a `skills` array of
  files or directories, and it would have meant one fewer directory. It offers
  the whole tree: pi would receive the fifteen Skills `selection.toml` switches
  off, and `git-guardrails-claude-code`, which means nothing there. Codex reads
  `~/.agents/skills` natively and has no settings array at all, so it would
  have lost its Hub with nothing to replace it. The filter is the one thing
  generation was really doing, and this would have thrown it away to save a
  directory of links.
- **Committing the links.** A symlink is committable, and these resolve to an
  absolute path that is right on one machine. Relative links would commit
  instead, and then membership is in the index again: the same change lands
  twice, which is what 0021 removed.

## Consequences

- **A Hub cannot hold a stale Body**, because it holds no Body. The suite has
  no copy left to compare bytes against, only membership: every active Body has
  its link, and the link points at its Body. Adding, removing or reselecting a
  Body still needs `bun run generate`, and so does editing a Rule's prose, a
  Skill's `records` or a Workflow's nodes, because the dispatch index carries
  those and a Dispatcher reads them from the index rather than from the tree.
- **A machine that linked before this needs `bun run link` again.**
  `~/.agents/skills` and `~/.claude/skills` point at `generated/pi/skills` and
  `generated/claude-code/skills`, which this change stops writing. Any Body
  another tool installed into those directories is in the old tree and has to
  be installed again by whatever put it there.
- **The Hub check changed what it proves.** It was "these bytes match the
  Bodies". It is now "every active Body has its link and the link points at its
  Body", which is a question about membership, the only thing left that can be
  wrong.
- **`generated/` is Dispatcher output only**, and the drift comparison over it
  is the one 0021 describes. It still holds a Rule's own prose, so a Body edit
  can still put that tree out of date and the suite still says so. What left is
  every Body whose bytes nothing but a Hub was carrying.
