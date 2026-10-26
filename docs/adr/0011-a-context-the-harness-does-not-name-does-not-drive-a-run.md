# 11. A Context the harness does not name does not drive a run

Date: 2026-09-14

## Status

Superseded by 0066, which deletes the Workflow run an unnamed Context was
refused. What follows is left as it was written. #20 is the orphan this closed; #16 is the naming
it builds on.

## Context

A Context pi gives no session file for gets a minted `unnamed-<hex>` name
(#16), so two concurrent sub-agents can be told apart in the dispatch log.
The mint is new on every extension load, and `runPath()` and `rejoinPath()`
in `src/pi-dispatcher.ts` both derive from the session name. A Workflow run
started in such a Context therefore persisted its position to
`runs/unnamed-<hex>.json` - a file under a name that never recurs, which
nothing can ever read back and nothing cleans up. Before #16 the same code
wrote `runs/ephemeral.json` for every unnamed Context, so two concurrent
sub-agents could resume each other's runs. Neither behaviour was chosen.

What a run's persistence is for: crash recovery (`restore()` finds the file
under the same name next load) and audit (`report-workflow-run` finds the
session's file and log lines by that same name). An unnamed Context has
neither: no name that recurs, and no session file at all.

## Decision

A Context the harness does not name may not drive a Workflow run. The
Workflow machinery's whole offer is enforcement that survives interruption
and a run that can be accounted afterwards; a Context with no durable
identity can be held to neither, and absence is preferred to silent
degradation (CONTEXT.md, Enforcement).

The refusal is a dispatch decision, so it lives in the core: `workflow-start`
carries `unnamed` when the harness gave the Context no name it will use
again, and `onWorkflowStart` aborts at the start, saying why. The pi Adapter
only reports the fact - it sets `unnamed` when `getSessionFile()` gave it
nothing - and holds no judgment of its own.

With no run ever started in an unnamed Context, no `runs/*.json` is written
under a minted name: the orphan stops existing rather than getting cleaned
up.

## What was considered and rejected

- **Drive the run, persist nothing.** Keeps the command working in
  sub-agents and removes the orphan, but leaves a run whose interruption is
  silent loss - the exact abandonment `persist()` exists to prevent - and
  whose cost no report can attribute. A degraded run that looks like a
  working one is the failure mode this repo's Enforcement section names.
- **Persist under a stable shared name** (the old `ephemeral.json`). Two
  concurrent unnamed Contexts then share one position and can resume each
  other's runs, which is where #16 came in.
- **Refuse in the adapter** (skip registering, or drop the event). Cheaper,
  but whether a run may start is a judgment, and judgments live in
  `src/dispatch.ts` where a second harness inherits them and the suite can
  reach them without a harness.

## Consequences

- `/workflow:<name>` typed into a Context pi runs as an in-process sub-agent
  aborts at the start with the reason in the transcript and the log, instead
  of starting a run that dies with the process.
- A harness that names every Context never sets `unnamed` and sees no change.
- Fan-out branches are unaffected: they run as named pi-subagentura sessions
  and never held a cursor to begin with (CONTEXT.md, Fan-out).
