# 66. The Workflow Kind goes, and its machinery with it

Date: 2026-09-25

## Status

Accepted.
Supersedes 0005, 0006, 0011, 0014, 0016 and 0017, whose decisions are about the machinery this record deletes.
Supersedes the part of 0041 that kept the Workflow Kind in the tree with no member.
Amends 0007, 0019, 0022, 0048 and 0060, each of which records a part of that machinery beside a decision that stands.
Amends 0013: `subagentura.ts` leaves `PI_BUNDLE` with the module, and `harness.ts` leaves it too, because its only runtime export there was `PROVIDES`.
Amends 0039: no Workflow is left to share a name with a Skill, so the `NAMED` exemption in `src/hub.ts` goes.

## Context

0041 deleted both Workflows on 2026-09-22 and kept the Kind.
It held that the grammar, the fan-out compiler and the Enforcement filter would earn their keep the day a Workflow was worth writing, and it kept them tested against a Workflow the suite declared.

Three days later the Kind still had no member, and `selection.toml` switched it off.
The last real Workflow step in the dispatch log is on 2026-09-04.
firstmate with no-mistakes now does the orchestration the `ship` Workflow did.
pi-subagentura, the runner a fan-out was handed to, left pi's packages on 2026-09-14, so no fan-out could have run on this machine since then.

The machinery still cost what 0041 says an off Body costs, and more.
`src/workflow.ts` and `src/subagentura.ts` came to 448 lines, and `src/subagentura.ts` shipped in every pi bundle.
`src/dispatch.ts` was 1,035 lines against the 400 line budget in `quality.json`, and just over half of it was the Workflow run.
Every Dispatcher parsed `/workflow:` prompts, answered `invoke` and `ask`, and read the last reply at every stop for an answer no run was waiting on.
159 of the suite's 989 tests held it.

## What was considered and rejected

**Keep it dormant, as 0041 chose.**
0041 already answered this for a Body: an off Body still sits in the tree, still needs a line in `selection.toml` and still turns up in a search.
Machinery that is switched off costs the same, and it also ships in a bundle and has to keep working through every change to the core.

**Write one real Workflow.**
Nothing in this repository needs one, because the orchestration a Workflow would hold is done outside it.

## Decision

The Workflow Kind is deleted, and so is everything that exists only to carry a Workflow.

- `KINDS` in `src/bodies.ts` is Rule, Skill and Reference, and `workflows/` is gone.
- `selection.toml` has no `workflows` switch and no `[bodies.workflows]` table.
- `src/workflow.ts`, which held the grammar, and `src/subagentura.ts`, which compiled a fan-out, are deleted.
- `PROVIDES` and the Enforcement levels leave `src/harness.ts`, and `src/harness.ts` leaves the pi bundle, since nothing in the bundle imports it at runtime.
- The dispatch index carries Rules and Profiles, with no `workflows` and no `records`.
- A Skill's `records` field is deleted, because a Workflow step was its only reader.
- `src/dispatch.ts` loses the run, the `workflow-start` and `rejoined` events, the reply a settle carried, and the `invoke`, `ask`, `decided`, `recorded`, `fan`, `rejoined`, `finished` and `abort` actions.
  A settle is the verdict gate's alone.
- The pi Dispatcher registers no `/workflow:` command, and writes nothing under `~/.local/state/skills/runs/`, `~/.local/state/skills/fans/` or `~/.pi-subagentura/workflows/`.
- The Claude Code and Codex Dispatchers parse no `/workflow:` prompt, and their Stop hook reads no reply, because only a Workflow's answer was read from it.
- `.no-mistakes.yaml` gives no review instructions for `workflows/**`, and `docs/workflows.md` is deleted.

## Consequences

A `workflows` switch in `selection.toml` stops generation as a Kind that does not exist, and a `records` field on a Skill stops it as a field the schema does not hold.

A dispatch index built before this change still loads, because each Dispatcher reads only the fields it knows.
A Claude Code or Codex session state saved during a run keeps its `run` until the session ends, and nothing reads it.
On a machine that ran a Workflow, `~/.local/state/skills/runs/`, `~/.local/state/skills/fans/` and `~/.pi-subagentura/workflows/` stay where they are, and nothing reads them.

The deletion leaves `src/dispatch.ts` at 514 lines and the Claude Code Dispatcher at 444, both still over the 400 line budget.
So the verdict gate's judgment moves to `src/verdict.ts`, and the log line of each action to `src/dispatch-log.ts`, which every Dispatcher bundles beside the core.
The code the Claude Code and Codex Dispatchers held in two identical copies is `src/hook-harness.ts`, which both bundle.
The dispatch index check that the pi Dispatcher and `src/hook-harness.ts` each held is `src/read-index.ts`, which all three Dispatchers bundle.
The pi Dispatcher's handlers leave its entry function, which was 197 lines against the budget of 100 for a function.
`src/dispatch.ts` ends at 389 lines, and the pi, Claude Code and Codex Dispatchers at 303, 325 and 282.

The records this one supersedes keep their text.
Bringing a Workflow back starts from them and from git history, and it means accepting them again rather than finding the code still in place.
0041 declined that cost, and this record accepts it.

0010 is already retired by 0041.
`docs/probes/0001-review-fan-out-against-planted-findings.md` records a probe that ran, so it is left as it is.

acorn leaves the dev dependencies, because the tests of the fan-out script were its only user.
