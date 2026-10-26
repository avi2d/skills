# 9. A claim about what a clone gets is checked on one

Date: 2026-08-29

## Status

Accepted. Closes the window 0008 left open, and narrows the third option 0008
rejected. Amended by 0070: the suite runs in the `ci.yml` `checks-quality`
generates, on every pull request and every push to main rather than on every
push.

## Context

Much of what the suite asserts is a claim about a clone: which paths git tracks
(0008), which symlinks resolve there (#45), which files the map installs
(0004). Every one of them was only ever run in a checkout that already existed,
which is the one place such a claim cannot fail.

#40 was that failure once already: a test that reported where it was run rather
than what the repository contained, green on the machine that wrote it and red
on every other. 0008 fixed it by asking git instead of the disk, traded `HEAD`
for the index on purpose, and named what the trade left behind: a target staged
and never committed is listed by `git ls-files`, is in no clone, and reads as
green.

Two more of the same shape were sitting in the tree, and neither was known
until the suite ran somewhere that was not this machine:

- `bun run typecheck` runs `tsc`, which was in no dependency here. It resolved
  off a global install, so the script had never been run anywhere it could
  fail.
- the herdr test reads files under `$HOME` and skipped on whether `herdr` was
  on `PATH`. A checkout with the tool and without the links failed on files it
  was never going to have.

## Decision

`.github/workflows/suite.yml` runs `bun install --frozen-lockfile`,
`bun run typecheck` and `bun test` on `ubuntu-latest`, on every push and every
pull request.

Nothing in the workflow is configured to be clean. A runner already is: it has
no `~/.claude` and no `~/.pi`, `bun run link` never runs, and its index holds
what the commit holds and nothing more. That is the whole value, and it is why
the file is eight lines of steps and twelve of comment.

Two rules follow from what the first run found, and both are properties of the
repository rather than of the workflow:

- **A script's tools are dependencies.** If `package.json` runs it, the
  lockfile installs it.
- **A test that reads `$HOME` guards on `$HOME`.** Not on `PATH`, not on the
  presence of a tool elsewhere on the machine. It passes against a `$HOME`
  nothing was installed into, or it skips and says why.

## What was considered and rejected

- **Ask `git ls-tree -r HEAD` instead of the index.** 0008's third rejected
  option, and rejected again for the same reason: it turns the suite red for
  the length of any uncommitted change that adds a target. The clone answers
  the same question without charging the edit-test-commit cycle for it.
- **Run on pull request only.** Halves the runs and narrows the claim. The
  window is a property of a commit rather than of a proposal, so a push that
  carries one should be red where it landed.
- **Run `bun run link` first, so the `$HOME` tests have something to read.**
  This would make the runner into a developer machine, which is the one machine
  those tests already had.

## Consequences

- **A commit on a branch with an open pull request is run twice.** `push` and
  `pull_request` both fire on it. The alternative is narrowing what "every
  push" means, which costs more than the duplicate does.
- **bun is pinned to 1.3.13 and typescript to 7.0.2.** A suite that changes
  when nothing in the repository changed is reporting on a toolchain rather
  than on a commit. Both move by a commit that says so.
- **The runner is Linux and this repository is written on macOS.** Path case
  and symlink handling now differ between where a change is written and where
  it is judged. That is a class of failure the run can catch, and a class of
  disagreement it can invent.
- **0008's trade stands, and only its residual is gone.** `trackedPaths` still
  asks the index, so a target staged and never committed is still green in the
  checkout that staged it. It goes red on the push instead of never.
