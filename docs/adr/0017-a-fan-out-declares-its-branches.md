# 17. A fan-out declares its branches

Date: 2026-09-14

## Status

Superseded by 0066, which deletes the fan-out whose branches this record kept
static. What follows is left as it was written. Closes #52.

## Context

`branches` on a `parallel` node in `src/workflow.ts` is typed
`Record<string, Branch>` - a fixed set of labelled step lists, settled when
`parseParallel` reads the frontmatter at generation. Five Bodies in the
collection fan out with a count the run works out for itself rather than
one the author can write down:

- `how` spawns two to four explorers, then a synthesizer.
- `why` spawns one investigator per evidence source the session can reach.
- `arena` spawns one candidate per model the session can reach, then a
  judge.
- `wayfinder` spawns one `research` sub-agent per decision ticket it just
  wrote.
- `codebase-design`'s design-it-twice spawns one sub-agent per way of
  drawing an interface.

A declared branch is a step naming a Body; a counted branch is a prompt a
parent composes at runtime, from a count no step reports today. Declaring
one of these as a `parallel` node today would mean authoring one Body per
branch and freezing a number the Body is supposed to decide - the opposite
of what makes `how`'s two-to-four or `why`'s one-per-source useful.

#52 laid out two arms: grow the node model with a fan-out whose branches
are counted at runtime, or accept that a fan-out declares its branches and
these five stay prose. Three facts make the second arm the one to take
now, not the first:

- `parallelScript` in `src/subagentura.ts`, the design ADR 0014 records,
  turns a `parallel` node's declaration into a script at generation
  specifically so nothing reassembles branches at runtime from the same
  declaration a second time. A counted branch is exactly that second
  implementation - N and its prompts read from a Fact no step writes,
  turned into branches by code no build reviews.
- `[kinds] workflows = false` in `selection.toml`: the Workflows kind is
  switched off entirely, so no `parallel` node runs today regardless of
  how its branches are typed. A node type built now would ship inert.
- The repository stopped loading pi-subagentura in 7ba2105, dropping the
  package pi's settings named as the runner `parallelScript` targets. The
  one harness a `parallel` node could reach has no runner behind it.

Building a runtime-counted branch type against a Dispatcher that is off
and a runner that is not loaded would freeze a shape decided by need
nobody can currently exercise, which is the premature-abstraction cost
`software-design` warns against paying before the feature has a floor to
stand on.

## Decision

**A fan-out declares its branches statically, and `how`, `why`, `arena`,
`wayfinder`, and `codebase-design`'s design-it-twice stay prose.** No node
type is added. `branches: Record<string, Branch>` in `src/workflow.ts`
keeps its shape: a `parallel` node names branches whose count and labels a
human wrote and `bun run generate` checked, not a number a run computes.

A Body whose branch count the run decides is a Skill or a Reference, which
already carries that discretion as a sentence the model reads and may act
on with judgement, the way `research` composes a sub-agent count in
`wayfinder` today. It does not become a Workflow.

## What was considered and rejected

- **A node type for runtime-counted branches.** #52's own accounting of
  what it would need - a Fact channel for N, a join that reads a variable
  number of branches from wherever they left work, a Workflow that names a
  prompt template rather than a Body - describes new machinery with no
  Dispatcher currently active to drive it and no runner currently loaded
  to run it. Building it now buys nothing runnable and freezes a shape
  chosen without the runtime pressure that would tell whether it is right.

## Consequences

- `how`, `why`, `arena`, `wayfinder`, and `codebase-design`'s
  design-it-twice remain Skills and References. A dropped branch in one of
  them stays invisible the way #52 described - the model can silently run
  three explorers instead of four, or skip an evidence source - with
  nothing in the dispatch log to say so.
- This accepts the limitation rather than removing it. If a runtime-counted
  branch is ever genuinely needed - a Dispatcher and a runner both back in
  place, and a Body whose dropped branches must be provable rather than
  trusted - the node-type arm of #52 remains open as new work, not
  reopened as a reversal of this one.
- `docs/harvest.md`'s Workflows table already lists these five as "prose"
  and cites #52 for the choice; this ADR is the decision that row was
  waiting on, and the table needs no further edit to keep saying prose.
