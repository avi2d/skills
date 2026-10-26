# 7. The herdr port lands on the fork, and the refactors are offered upstream

Date: 2026-08-28

## Status

Accepted. The decision #34 asks for, and the ground #35, #36 and #37 are built
on.

One consequence of it was open, and #53 settled it. This ADR put
`../../Projects/pi-subagentura` into `harness/pi/settings.json`, and
`bun run link` hands that file to pi, so a clone got a package path only this
machine had. #8 asked for a repository publishable on its own with no
machine-specific configuration in it, and `7ba2105` closes that gap by removing
the path from `harness/pi/settings.json`, not by publishing the fork: the
`packages` list now names only published npm specifiers.

0066 deletes the fan-out, which was the one part of this repository that handed
work to pi-subagentura.

## Context

0006 ends on a path it could not measure: "This machine has neither `tmux` nor
`zellij`, so pi-subagentura's process isolation falls back to in-process and
every branch above ran in this session's process." That is not a gap in the
measurement, it is the machine. Every terminal here is herdr, `TMUX` and
`ZELLIJ_SESSION_NAME` are both unset, and neither binary is installed, so
`getMux()` throws and `subagent_interactive` cannot spawn at all. The
observable, attachable half of the package is dead here, and a Workflow's
branches run where nobody can watch them.

Closing that means editing `pi-subagentura`, which pi loaded as
`npm:pi-subagentura@3.3.1` from `~/.pi/agent/npm`. The package is published by
`lmn451` and the tree is nobody's here.

What is known about upstream, measured on the clone:

- One maintainer. Every commit between `v3.3.0` and `v3.4.2` is theirs, and 407
  of the repository's commits are.
- Active: `v3.4.2` was tagged this month.
- The review queue is not fast. Five pull requests are open, the oldest from
  2026-08-07 and the next from 2026-08-09.
- `CONTRIBUTING.md` asks for focused changes carrying tests, and conventional
  commits.
- CI is `ubuntu-latest`. It installs tmux and zellij and runs `test:tmux` and
  `test:zellij` as separate steps on top of the unit suite.

That last one cuts both ways, and it is what the decision turns on. #35 and #36
change code both existing backends run, and upstream's per-backend integration
suites are exactly the coverage those changes want. Neither suite can run here.
#37 adds a third backend whose binary is `/opt/homebrew/bin/herdr` on this
machine, and whether it can be installed on `ubuntu-latest` at all is
unestablished, so on today's evidence it would land upstream as the only backend
whose integration suite never runs in CI.

## Decision

**The work lands on the fork, and pi runs the fork.**

`avi2d/pi-subagentura`, cloned to `~/Projects/pi-subagentura`, is where #35, #36
and #37 are built. pi reaches it through its own local-path package source:
`~/.pi/agent/settings.json` carries `../../Projects/pi-subagentura` in
`packages` where it carried `npm:pi-subagentura@3.3.1`. No ticket waits on a
review by someone who is not in this session.

#34 proposed `bun add pi-subagentura@file:<path>` into `~/.pi/agent/npm`
instead. That tree is derived state: pi builds it from `settings.packages`,
which is the list `pi list` reads and `pi install` writes. Linking inside the
derived tree while the source of truth still named `3.3.1` is two answers to one
question, and the documented answer costs one command.

**#43, #35 and #36 are offered upstream once they are green. #37 is not offered
until it has run here.**

#43 is the strongest of the three and was not known when this was written.
Moving pi onto `v3.4.2` broke every turn on `claude-bridge`, plain prompts
included, because `subagent_interactive` carries an `allOf` at the root of its
schema and Anthropic answers 400 to that. pi's own adapter projects the
composition away before sending, so the defect is invisible on one adapter and
total on another. It is a released regression in every `3.4.x`, and upstream
wants it whatever they think of the rest.

The two refactors are upstream's problem as much as ours: a string comparison
the compiler cannot see, and tmux knowledge living outside the tmux backend.
They are small, they carry tests, and they are the shape `CONTRIBUTING.md` asks
for. Sending them up buys the tmux and zellij integration runs this machine
cannot do, and stops the fork rebasing them over every release.

The herdr backend is ours until it has earned an argument. Offering a third
backend to a single maintainer, sight unseen, with no CI that can exercise it,
asks them to carry it on trust. Once it has run here it arrives with evidence,
and that is a different conversation.

Opening either pull request is an outward action and waits on the human. This
ADR settles where the work goes, not when a stranger's repository hears about
it.

## What was considered and rejected

- **Upstream first, all of it, before using any of it.** Four tickets blocked
  behind a queue whose oldest entry has been open three weeks. The port exists
  to make this machine's sub-agents attachable, and a plan that starts by
  waiting has the priority backwards.
- **Fork only, never offered.** #35 and #36 then rebase over every upstream
  release forever, and the two integration suites that would exercise them never
  run anywhere.
- **Vendoring the package into this repository.** `CONTEXT.md` gives **Vendor**
  one meaning, Bodies copied verbatim, and 0004 already refused to vendor files
  that have another writer. A package we edit and pi executes is neither.
- **Patching the published tarball.** A patch file against a tarball is a diff
  with no history, no test run and no branch to review. The fork is the same
  edit with all three.

## Consequences

- **pi's behaviour now tracks a working tree.** A broken edit in
  `~/Projects/pi-subagentura` breaks every pi session on this machine, not one
  test run. The check is cheap, and it is the one #34 asked for: `pi -p` with
  `-t subagent_interactive` in a herdr terminal prints the resolver's own error
  text, so a marker put into `NoMultiplexerAvailableError` comes back out of a
  real pi.
- **Going back is a `pi remove` of the path and a `pi install` of
  `npm:pi-subagentura@3.3.1`.**
- **The Contract named a path outside every repository involved, and #53
  settled it.** pi wrote `../../Projects/pi-subagentura` into
  `harness/pi/settings.json`, resolved against the settings file, so on a fresh
  machine the fork had to be cloned to that exact place before pi would start
  with sub-agents. 0004 made this file a live symlink so a harness's own writes
  land as a reviewable diff, and this was one, but the suite held the map
  complete only for links pointing into this repository, and nothing checked
  that this one resolved. `7ba2105` closed the hole by removing the path from
  `packages` rather than by publishing the fork: `harness/pi/settings.json` now
  names only published npm specifiers, and `bun run link` hands a clone a pi
  that starts without the local checkout.
- **The clone installs with `npm ci`.** Upstream tracks `package-lock.json` and
  its CI runs `npm ci`; `bun install` resolves from the ranges instead and
  writes a `bun.lock` upstream does not track. The green baseline, 71 files and
  1677 tests with `tsc --noEmit` clean, was taken on the npm tree, so a later
  red belongs to us and not to a resolution difference. `bun run test` still
  runs the suite; only the install changed.
- **The fork is `v3.4.2` and pi was pinned to `3.3.1`.** The line numbers #35
  and #36 cite are 3.4.1's, and every one of them lands within two lines of the
  current tree, so they still navigate. What moved under pi is two minor
  versions nobody here has reviewed.
- **The fork was needed before it was wanted.** #34 set out to give the herdr
  port a tree to land on, and the first thing the tree was used for was
  repairing the version it landed on. The upstream-or-fork question was
  answered by the first hour of running it: on `3.4.2` this machine could not
  complete a single turn, so staying on the published package was never the
  safe option it looked like.
- **A green suite proved nothing about the thing that was broken.** Upstream's
  test asserted the model-visible schema against a hand-written copy of pi
  0.80.6's adapter, so it agreed with the defect instead of catching it. The
  replacement asserts on the schemas as registered, which is the artifact both
  adapters actually receive. Read this before writing a test against another
  package's internals in #35, #36 or #37.
- **Three suites stay unrun on this machine.** `test:tmux`, `test:zellij` and
  the terminal E2E each need a binary that is not installed. #36 already
  anticipates this and asks for a unit assertion on the argv the tmux backend
  builds. Every ticket in this chain has to carry its tmux and zellij evidence
  the same way, or go upstream to be run.
