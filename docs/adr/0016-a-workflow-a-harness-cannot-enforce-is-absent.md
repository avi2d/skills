# 16. A Workflow a harness cannot enforce is absent, not weakened

Date: 2026-09-14

## Status

Superseded by 0066, which deletes the Workflow Kind, `PROVIDES` and the
Enforcement levels. What follows is left as it was written. Records the design spread across
`src/workflow.ts`, `src/harness.ts`, `src/hub.ts` and `src/dispatch-index.ts`,
and the rationale swept out of their comments by the comment-discipline pass.

## Context

Composition between Bodies used to live inside their prose - "once done,
use code-review" - which is a suggestion the model can silently drop. A
Workflow is the same edge written where machinery can hold it: the order is
declared as a tree, the Dispatcher advances it, and a step is skipped only
if the declaration says it may be.

That guarantee is only as strong as the harness driving it. A Workflow
asks for an `enforcement` level (`driven`, `nagged`, `parallel`), and a
harness may or may not be able to provide it. The question this ADR
settles is what happens when it cannot.

## Decision

**Absence, never a weaker version of the same guarantee.** A Workflow that
quietly stopped enforcing looks exactly like one that is working - the
silent degradation this repository keeps refusing - so:

- `PROVIDES` in `src/harness.ts` is the one table of what each harness can
  hold a Workflow to. `indexFor` drops a Workflow whose level the harness
  does not provide; it never downgrades one. A harness with nothing listed
  has no Dispatcher yet and receives no Workflows at all.
- A claimed level must be real. pi lists `parallel` because
  pi-subagentura provides the isolated agents, the barrier and the
  cancellation, and pi's Dispatcher hands it the generated script.
  `nagged` - interrupting at the end and asking for a missing step - is a
  thing no Dispatcher here does yet, so nobody lists it; claiming it would
  be exactly what the table exists to prevent.
- **Workflows are in no Hub.** A Hub is what a harness offers by name, and
  a Workflow sitting there would be invocable by hand with none of its
  enforcement. It reaches pi through the dispatch index instead, as a
  `/workflow:` command. Its prose reaches nobody: a Workflow is a
  declaration, and what it declares - the tree - is already in the index.
- **Every step of an included Workflow must be runnable on that harness.**
  A step naming a Body the harness does not receive would be a run that
  stops partway with the work half done, so `indexFor` refuses it at
  generation. That the named Body exists at all is checked for the whole
  tree first, so a typo stops the build even in a Workflow no harness can
  currently enforce.

**The declared level must match what the tree uses.** A fan-out under any
level but `parallel` would reach a harness that never promised to run one;
`parallel` over a tree that fans nothing out keeps the Workflow away from
harnesses that could have driven it. `parseWorkflow` refuses both
directions.

## What was considered and rejected

- **Downgrading** (a `parallel` Workflow run as `driven` steps, a `driven`
  one offered as prose). Every downgrade is enforcement that stopped
  without saying so.
- **Workflows in the Hub alongside Skills.** Hand-invocable with no
  Dispatcher watching - the degradation above, one command away.

## Consequences

- Adding a harness means adding its honest row to `PROVIDES`; Workflows
  arrive only as their levels become true.
- A Workflow visible on one harness and absent on another is the design
  working, and `selection.toml` stays the answer to "why is this not
  firing" only for Bodies, not for enforcement levels.
- Sequencing that must survive a model's discretion belongs in a Workflow,
  not in a Skill's prose.
