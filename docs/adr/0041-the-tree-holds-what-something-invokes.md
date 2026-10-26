# 41. The tree holds what something invokes

Date: 2026-09-22

## Status

Accepted. Removes 39 of the tree's 52 Bodies, including every Skill and both
Workflows, which leaves two Kinds with no members and the machinery 0005, 0014,
0016 and 0017 describe exercised by fixtures rather than by a Body. Retires the
implementation and the suite 0010 names, so that record stands with nothing
behind it. 0033's conclusion about `typescript-best-practices` becomes
reachable, because the Rule is back on.
Amends 0023 and 0025 by deleting the `no-comments` Skill and the
`comment-sicko` definition they record.
The Skill Kind has a member again: `no-mistakes`, taken from
`kunchenguid/no-mistakes` at the commit its `source` names, so `skills/.gitkeep`
is gone and a step can name a Skill as well as `effect-patterns`.
0046 removes that member again: the installed binary supplies its own skill, so
`skills/.gitkeep` is back and `effect-patterns` is once more the one Body a
step can name.
0066 deletes the Workflow Kind the Consequences below kept with no member,
and with it the machinery 0005, 0014, 0016 and 0017
describe, and the `records` field, so no step names anything any more.

## Context

The tree grew by harvesting. `docs/harvest.md` records what earned a place and
under which Kind, and the judgment there was about whether a Body was written
well enough to keep. It was not about whether anything would ever invoke it,
because at harvest time nothing had had the chance.

A year of transcripts has now answered that second question, and the answer is
mostly no:

- No Skill in this tree has been invoked by any harness since 2026-09-14.
- Of the 31 transcripts that ever invoked one, 17 were sessions working on this
  repository. The tooling's largest user was the tooling's author.
- pi, which holds the Hub, has no skill-load tool at all. 41,969 records carry
  no `/skill:` invocation.
- The `ship` Workflow ran 77 times through `implement` and 18 through `ship`
  itself, `grill-with-docs` 4 times, and all of it before 2026-09-19, the day
  `ship` was switched off because firstmate and `no-mistakes` had taken the job
  over.

Meanwhile every Body in the tree costs something whether or not it runs. A Rule
costs tokens in every session it fires in. A Skill or Reference costs a Hub
entry and a line in `selection.toml`, and costs a reader the question of whether
this is the thing they want. Thirty-nine Bodies of unexercised prose is a
maintenance surface that returns nothing, and it makes the thirteen that do
matter harder to find.

Switching a Body off rather than deleting it does not recover any of that. An
off Body still sits in the tree, still needs a `selection.toml` row, and still
turns up in a search. It only stops costing tokens.

## Decision

Delete every Body nothing invokes. That is all 32 Skills, both Workflows, four
of the five References, and one of the thirteen Rules - 39 Bodies. Thirteen
remain: twelve Rules and one Reference, `typescript-best-practices` among them
because it is switched back on.

A Body is deleted rather than switched off. The tree holds what something
invokes.

`setup-agent-docs` is deleted with the Skills it configured rather than kept as
an unmarked survivor. Its own description is that it writes the configuration
"the tracker-facing Skills read", and every Skill that read it is in this
change: `triage`, `wayfinder`, `prototype`, `research`, `to-spec`. It ships
label strings for a `triage` skill that no longer exists.

`software-design` is the one Rule deleted, and the evidence above does not reach
it. A Rule is never invoked - it is in force or it is not - so no invocation
count can distinguish it from the twelve that stay. Its basis is different and
narrower: it was already switched off, and every Body that gave it a subject to
be about is deleted here. Its clauses were about architecture and code smells,
and they pointed at the `codebase-design` and `code-smells` References,
`improve-codebase-architecture` and `blast-radius`. A Rule whose subject matter
has left the tree is not a Rule held in reserve; it is prose about Bodies nobody
can read any more. The twelve that stay are about how code and prose get
written, which is work this repository still does.

## Consequences

Two Kinds have no members: Workflow and Skill. `workflows/.gitkeep` and
`skills/.gitkeep` keep both directories in a clone, because git tracks no empty
directory and `every Kind has a directory of its own` reads the filesystem.
`selection.toml` keeps an empty table for each. For Workflows, the grammar,
the fan-out compiler and the Enforcement filter are all still there and still
tested - but only against a Workflow the suite declares. The cost is that no
checked-in Body demonstrates the machinery end to end, so a change to it can
typecheck, pass, and still be wrong about something only a real Workflow would
show. This is a deliberate trade: the machinery earns its keep the day a
Workflow is worth writing, and until then the alternative was keeping nine
Bodies alive to serve as a test fixture.

Twenty-three tests used `ship` as their only fixture for that machinery:
thirteen in `tests/generator.test.ts`, nine in `tests/dispatch.test.ts` and one
in `tests/pi-dispatcher.test.ts`. The ones whose subject was `ship` are gone with
it. The ones whose subject is the machinery now build a declared Workflow, so
deleting prose did not quietly uncover `src/workflow.ts` and
`src/subagentura.ts`.

The Skill Kind going empty costs the same kind of fixture. `records` is a
Skill-only field, and a Hub entry under `skills/` needs a Skill to point at, so
those tests declare one too. A step can name only `effect-patterns` now, since a
step takes a Skill or a Reference and the tree has one Reference and no Skills.

0010 decided how a workflow run is reported and put the reader in
`skills/report-workflow-run/scripts/report.ts`, with the suite pinning both
sides. This change deletes that Body, its script and `tests/report.test.ts`, so
0010 is left describing a shape nothing produces and nothing checks. It is
retired by this record rather than silently emptied.

0023 and 0025 open by recording the `no-comments` Skill, and 0023 the
`comment-sicko` sub-agent definition it ships. Both are deleted here. Neither
record is retired, because what they mostly decide is `rules/comment-discipline`
and that Rule stays; each is amended in its own Status instead, so a reader is
not sent looking for a Body the tree no longer holds.

No Body ships a script any more, so the `comment-discipline` trigger's proof
that it covers one reads a harness extension instead.

The worst case a session can reach goes from 2889 tokens to 3456 against the
ceiling of 3500 that 0038 set, all of the rise from `typescript-best-practices`.
A session still opens at 944, because that Rule's trigger is `repo-contains`
rather than `always`. Forty-four tokens of headroom is not much, and the next
Rule switched on will need the ceiling raised deliberately, which is what the
ceiling is for.

Examples in `README.md` and `CONTEXT.md` named deleted Bodies, and now name
surviving ones. Nothing checks that they do: the pointer check in the suite
reads Bodies, not the repository's own documentation, so this class of rot is
still caught by a reader rather than by a program.

`docs/harvest.md` and `docs/probes/` are records of what happened and are left
alone. A record of a harvest that mentions a Body deleted afterwards is not
wrong.

`NOTICE.md` is unchanged, and the check that holds it to the tree is what says
so. Both upstreams it covers still have a Body naming them as a `source`:
`mattpocock/skills` through `writing-for-agents` alone, now that
`domain-modeling` and `grilling` are gone, and `cursor/plugins` through five
Rules.
