# 52. The dispatch log is read by a command, a session at a time

Date: 2026-09-24

## Status

Accepted. Amended by 0060: the report measures against the index without the
inactive Rules, and an inactive Rule that reached a session may be one a project
switched on.

## Context

Every Dispatcher appends what it decides to `dispatch.log` under
`$XDG_STATE_HOME/skills/`, or `~/.local/state/skills/` without it. On
2026-09-24 the log held 19,966 lines from 2,042 sessions, going back to
2026-08-24, and nothing read it. Each delivery figure in the metaprogramming
report came from a hand-written `awk` pipeline, which is why nobody knew them
until someone went looking.

Re-measuring those figures for this record found three things a one-off
pipeline gets wrong:

- **`dropped` undercounts lost Rules.** A Rule queued at compaction is
  `dropped` only if the harness reports the session ending. A pi session killed
  after a compaction, which is how a crew pane ends, never reports it. Of the 75
  Rules the whole log shows lost, 42 have no `dropped` line: the queue is the
  session's last line.
- **The log holds shapes no current build writes.** The fallback walk replaced
  `<cwd> is not a git repository, so repo-contains was not asked` with a note
  that the walk hit its cap. Both are in the log: 302 sessions carry the first
  and 2 the second. Lines from before 2026-08-28 write `inject <rule>` with no
  reason after it.
- **One line is not a line.** A Workflow invoked with arguments over several
  lines wrote them raw, so line 2613 starts with no timestamp and no session.

## Decision

**`bun run dispatch-report` reads the log the Dispatchers write,** at the path
they write it to, over the last seven days.
It answers three questions: which active Rules reached no session, which
sessions lost a Rule, and how many sessions hit the `repo-contains` hole and
what that cost them.

**The session is the unit.** A session is in the window when any of its lines
is, and it is then read whole. A window over lines instead would show a session
that started before the window as having received nothing.

**Active means what generation hands the Dispatchers.** The command builds each
harness's index from the Bodies and `selection.toml`, as `bun run generate`
does, and takes the union of their Rules. A Rule that reached a session and is
not in that set is listed separately with the last time it reached one, which
identifies sessions still running a build that carried it.

**A Rule is lost three ways:** `dropped` when the session ended; `broken`,
naming it; or queued with nothing re-injecting it by the session's last line.
The third cannot tell a killed session from a live one between a compaction and
its next prompt, and the report does not claim to. It says `still queued at the
session's last line`. A Rule is lost at most once in a session, by the first
way the session logged: a `tool-call` trigger naming the wrong argument logs
`broken` on every matching call, and counting lines would count calls.

**The hole's cost is counted Rule by Rule.** For each active Rule scoped by
`repo-contains`, the command counts the hole sessions that Rule never reached by
any trigger. A Rule that a write delivered through `file-matches` was not lost
to the hole.

**The reader knows every shape the log has been written in, and keeps a
retired one.** Tests feed it what the writers produce: `logLine` for each Rule
action and `cappedNote` for the walk. If a writer changes a line, those tests
fail until the reader knows the new shape. A line that parses as no shape is
reported by line number, not skipped silently. `logLine` also escapes line
breaks now, so one action is always one line.

**It is a report, not a gate.** Findings do not change the exit code. A
missing log fails naming the path it looked at. The log is state on one machine, and no CI run has it.

## What was considered and rejected

- **A structured log, one JSON object a line.** It would make reading trivial.
  It would also change three writers, and the lines already written would still
  need this reader.
- **Reading the active Rules from the generated index.** A fresh clone has
  none, and a tree that has not been regenerated is stale.
- **Counting losses from `dropped` lines alone.** That misses 42 of the 75.
- **Matching the hole note with a pattern built from `cappedNote` itself.** The
  reader and writer would always agree, and the reader would silently stop
  recognising what earlier builds wrote the first time the note changed.

## Consequences

- The report's numbers match hand-run `awk` on the same log: 2,042 sessions,
  1,921 reached by `prove-it-works`, 304 in the hole, and 75 Rules lost across
  28 sessions (42 still queued, 33 dropped, 0 broken).
- A new kind of log line is invisible to the report until the reader learns
  it. A changed hole note is not: the test that feeds `cappedNote`'s output
  fails first.
- `still queued at the session's last line` includes sessions still running.
  Run the report after they end to know whether the loss was real.
