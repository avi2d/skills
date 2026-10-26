# 10. A branch session is attributed to the run that spawned it

Date: 2026-09-14

## Status

Retired by 0041, which deletes `report-workflow-run` along with the reader this
record puts in `scripts/report.ts` and the suite that pinned both sides. The
attribution rule below is sound and nothing implements it. #54 is the failure it
closed.

## Context

`report-workflow-run` bills a fan-out's branches by finding the sessions that
spoke in the dispatch log during the barrier's window and wear the
`<workflow>:<label>` name the runner gives a branch. Both checks describe when
a session ran and what it was, and neither says whose it is: a concurrent run
of the same Workflow fills the same window with identically named branches.
PR #51's report absorbed PR #41's branches that way - 9 billed for a run that
fanned out 6, with one branch appearing twice at identical figures.

Two runs of `ship` at once is the ordinary case, not an edge: a second run in
another worktree is how two tickets move at the same time.

Nothing in the log ties a branch session to its run directly. What does exist
is what the run itself put into each branch at the moment it fanned out:

- the rejoin branch is told to write the barrier summary to
  `fans/<run-session>.json` - a path `src/pi-dispatcher.ts` derives from the
  run's own session file name, so the rejoin's prompt names its run outright.
- a worker's prompt carries the run's Facts in the given block
  `src/subagentura.ts` writes under `- standing in:`, and the log's `recorded`
  lines say per session which run held which values.

## Decision

A branch is claimed off its own opening prompt, not off the window it ran in.
The window and the name prefix still select the candidates; the prompt then
says whose each one is:

- a prompt naming a `fans/...json` path is the rejoin of exactly the run whose
  session that path spells.
- a worker is this run's when the facts in its given block equal the Facts
  this run had recorded before the barrier, and another run's when they
  differ.
- a worker that offers nothing to compare - no given block, or two runs that
  both carried no Facts - is **unattributable**: it is named in the report and
  not billed, because a spend that might be somebody else's carried into the
  total is the exact failure being closed, and dropping it silently would make
  an unattributable branch look like a missing one.

The reader lives in `skills/report-workflow-run/scripts/report.ts` and
duplicates the two conventions it reads (the `rejoinPath` substitution, the
given-block shape) rather than importing them: the script is a Body's asset
and ships whole into a Hub, where `src/` does not exist.

## What was considered and rejected

- **Tagging branches with the run's session at spawn time** (a run id in the
  `agent()` label or prompt). Cleaner going forward, but it cannot attribute
  any run already in the logs - including the one this was filed over - and it
  widens the change from one script to the generator, the emitted fan-out
  script, and the index. Worth doing if the prompt-reading ever proves
  fragile; not needed to fix the accounting.
- **Attributing by the subagentura job directory.** Each spawned agent gets
  its own job directory, so the tree groups nothing.
- **Tighter windows** (e.g. sessions starting within seconds of the `fan`
  line). Still the same category of evidence - coincidence in time - and the
  issue is precisely that time is not ownership.

## Consequences

- A report for a run that overlapped another names only its own branches, and
  a branch nobody can own is a named line, not a share of the total.
- The attribution reads conventions owned by `src/pi-dispatcher.ts`
  (`rejoinPath`) and `src/subagentura.ts` (the given block). Changing either
  shape means updating the report's reader; the suite pins both sides.
- A run that recorded no Facts before fanning out gets its workers reported as
  unattributable whenever another factless run overlaps it. That is honest:
  nothing on disk can tell those workers apart.
