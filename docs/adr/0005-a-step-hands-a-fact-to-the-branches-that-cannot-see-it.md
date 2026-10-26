# 5. A step hands a Fact to the branches that cannot see it

Date: 2026-08-28

## Status

Superseded by 0066, which deletes the Workflow Kind, the `records` field a
Skill declared its Fact in, and the fan-out that carried a Fact to its
branches. What follows is left as it was written. Answers #26.

## Context

`implement` opens by cutting a worktree and goes on to open a pull request, and
its review step fans two branches out at that pull request. Neither the path nor
the number ever reached the branches.

The generated script built each branch prompt as `"... in the repository at " +
cwd + ...`, where `cwd` is the runtime's parent working directory. Naming a
directory in a prompt does not put an agent in it, and pi-subagentura's
`agent()` takes no working directory of its own, so a branch runs where the
session was standing. Both review Bodies then opened with a bare

```sh
gh pr view --json number,baseRefOid
```

which resolves the pull request from the current branch. Run the way a run is
started - from the main checkout, on the default branch - that is a branch with
no pull request on it, and both branches died on their first command.

### The finding

Session `01a0471d-6f88-79a7-be26-d0facd35666c`. The pi session ran in
`~/Projects/skills` on `main` while the work for #22 lived in
`~/Projects/skills-22-probe-claude-bridge`. The branches reached
PR #23 only because they were hand-spawned with the worktree as their working
directory and the number written into the prompt. The generated script did
neither.

Underneath the two symptoms is one gap. Between `worktree` and the review, the
only thing holding that path was the conversation - which is to say the model's
memory of it. That is exactly the edge this design replaced everywhere else: an
ordering held by prose was replaced by a tree a Dispatcher walks, and a value
held by prose was left alone.

### The two answers

**Put the branch in the worktree.** The spawn sets each branch's working
directory, and the Bodies go on resolving the pull request from the branch they
find there. It leaves the inference in place and rests on a per-agent working
directory pi-subagentura does not offer.

**Hand the branch what it needs.** The steps that find these things out report
them, the run writes them down, and the fan-out passes them on. The review
Bodies stop inferring the pull request from anything.

## Decision

**A Skill declares the one Fact it reports, the run records what the step
reported, and a fan-out hands every Fact it holds to each of its branches.**

Five small pieces:

- A Skill's frontmatter carries `records: <one kebab-case word>`, and its text
  has to ask its reader for a `<word>:` line. Generation stops on a Body that
  declares a Fact its own words never mention, because a Fact nothing asks for
  is one every step naming it aborts on.
- The index carries what each Body records, keyed by Body name. Not hung off the
  step node: a fan-out's join is a step no tree spells out - it is built from the
  node's `join` when the run descends into it - so a Fact carried on a node is
  one the join could never carry.
- The core reads the line off the step's own reply when the session goes quiet,
  the same moment and the same way a conditional's answer is read, and writes it
  into the run beside the decisions. A step that reported none aborts the run.
- The `fan` action carries the Facts, the adapter puts them in the runner's
  arguments beside the barrier path, and the generated script writes them into
  every branch prompt.
- `worktree` and `open-pull-request` each end by reporting one line.
  `review-standards` and `review-spec` take the number from what they were given
  and stop rather than guess if they were given none.

### Why hand it over rather than move the branch

The second answer removes the inference; the first works around it. A branch put
in the right directory still resolves the pull request from whatever branch is
checked out there, which is right until the day it is not - a stale worktree, a
branch someone switched, a second pull request off the same head. A branch
handed the number reviews that pull request wherever it is standing.

It is also the only one available. pi-subagentura 3.3.1 declares its whole
`agent()` option set in `types/workflow.d.ts` as `WorkflowAgentOptions`:
`schema`, `label`, `phase`, `model`, `persona`, `isolation`, `agentType`,
`thinkingLevel`. There is no working directory among them, so putting a branch
somewhere means changing that runtime rather than this repository. And the
mechanism the second answer needs was needed either way: the ticket's own words,
"either way, a step that needs the worktree has to be able to get it".

### Why the Fact is declared on the Body

What a step reports is a property of the step, not of the tree it sits in. A
Workflow that repeated it would be a second place for the two to disagree, and
`open-pull-request` reports its number whether or not the Workflow using it cares.
It also means a Workflow author writes nothing: the Facts travel because the
Bodies declare them.

The cost is that every Workflow using such a Body is held to it. That is the
intent. The Body ends by reporting that line, so a reply without one is a step
that did not finish the way it says it does.

### Why a missing Fact aborts

The alternative is a fan-out spawned with a gap in its prompt, which is the
failure this replaces wearing a different hat: two sub-agents sent out to work
out for themselves something the run was supposed to know. An abort is what a
failed step already produces, it names the step and the Fact, and the work is
where it was left - the worktree, the branch, the pull request - for a re-run to
pick up.

### Why the reply is read rather than a file

The value has to cross from a step to the run, and the run is a pure function of
events. Reading a declared line out of what the session said is the seam that
already exists: a conditional's answer crosses the same way, at the same moment,
and `review-standards` already ends with a `Findings:` line that `address-review`
reads. A file would add a filesystem seam and put the decision in the adapter,
where the dispatch log does not reach.

Read forgivingly, because a model asked for one line writes it as a bullet, in
bold, in backticks, or spells `pull-request` the way English does. The last
claim in a reply wins, on the grounds that a reply saying it twice corrected
itself.

The value itself is not checked, and it is worth being explicit about what that
does and does not promise. A conditional guarantees the decision point without
pretending to guarantee the decision; this guarantees the record point without
pretending to guarantee the value. A step replying `worktree: see above` records
`see above` and the run carries on with it. The shape of a Fact is the Body's,
the core has no type for one, and a check invented here would be arbitrary in
exactly the way `answerIn` is not - an answer is one of a declared set, and a
path is not. What the design does provide is that the value is in the dispatch
log and in the branch prompt, so a Fact that was nonsense is visible rather than
inferred from a branch that behaved oddly.

### Why only the branches are handed them

Every other step runs in the conversation, where the reply that reported the
Fact is still in front of the model, so handing it over again would be telling
the model something it just said. A branch is the one step in a run that has
none of that.

The limit is real rather than free: a compaction takes the conversation with it,
and a run long enough to compact between `open-pull-request` and
`address-review` leaves the join with the number nowhere but the run's own file.
Nothing reads that file into a step today. Closing it means putting the Facts
into the `/skill:` message every step is invoked with, which is a change to how
pi expands that command and wants measuring on a live session rather than
assuming here.

## Consequences

- `worktree` and `open-pull-request` now end with a line the run reads. Invoked
  by hand, they behave as before and the line is one more sentence of output.
  Invoked as a step, a reply without it stops the run.
- The review Bodies no longer resolve the pull request from the current branch,
  so `/skill:review-standards` by hand needs the number given to it. That is the
  point: the number came from somewhere rather than from wherever the session
  happened to be standing.
- The branches still run in the session's working directory. They are told where
  the worktree is and read the repository there; nothing puts them in it, and a
  branch that needs to write would still be writing in the wrong place. No branch
  of `implement` writes.
- The dispatch log gains a `recorded` line per Fact and says what each fan-out
  went out carrying, so a branch that reviewed the wrong pull request is a
  question the log answers.
- Ordinary steps are unchanged: they read what they need out of the conversation
  they are running in, as they always did. A compaction is the case that breaks,
  and it is left open above.
- An index generated before this reaches a Dispatcher that refuses it, naming
  what is missing, rather than one that drives `implement` to a fan-out and hands
  its branches a prompt with no pull request in it.
- #29 asks for an `implement` run whose review step fired with nobody driving it.
  This was the last of the three links; the run itself is still owed.
