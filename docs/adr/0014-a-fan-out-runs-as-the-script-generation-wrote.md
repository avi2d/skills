# 14. A fan-out runs as the script generation wrote

Date: 2026-09-14

## Status

Superseded by 0066, which deletes the fan-out and `src/subagentura.ts`.
Narrowed by 0021: a change to a fan-out is reviewable by generating the branch rather than under `generated/`.
What follows is left as it was written. Records the design `src/subagentura.ts` was built
to, and the rationale swept out of its comments by the comment-discipline pass.

## Context

A `parallel` node in a Workflow is a declaration: which branches there are,
what each is told, where they rejoin, and what a failure does. Something has
to turn that declaration into the thing pi-subagentura actually executes,
and there are two places that could happen: at generation, once, or at
runtime, every time a run reaches the node.

The runtime option means a second piece of code assembling branch prompts
from the same declaration the generator read - two implementations of one
meaning, kept in step by hope, with the second one running where no build
can stop it. This repository has refused that shape everywhere else: a
Rule's whole text rides in the index so injection has nothing to look up,
and the index exists at all so that no runtime hook parses frontmatter.

pi-subagentura's authoring contract is also narrow enough to want a single,
checked producer: raw JavaScript, no imports and no Node APIs, a top-level
`export const meta` that is a pure literal, `parallel()` over thunks, and a
failed agent arriving as `null`. A hand-maintained or runtime-assembled
script has many chances to drift off that contract; a generated one has one
producer to hold to it.

## Decision

**The script is written at generation and travels in the index with its
node.** `parallelScript` in `src/subagentura.ts` emits it;
`compiled` in `src/dispatch-index.ts` attaches it to the `parallel` node on
the way into `dispatch.json`. Everything the declaration settled is a
literal in the emitted script - branches, prompts, join, report fields - so
what a fan-out does is readable in the diff that changed it, and what runs
is the artifact that was generated and reviewed.

The declaration itself stays on the node, beside the script, so the log and
the transcript can say what was fanned out rather than only that something
was.

**The script decides nothing.** It runs the branches and reports which came
back, through a summary file at the path the Dispatcher handed it. Whether
a branch that did not come back stops the run is the Workflow's declared
`failure` policy, and the dispatch core applies it on the `rejoined` event -
so the policy is a line in the dispatch log beside every other decision,
rather than behaviour buried in a script nobody is watching. What
pi-subagentura provides - the isolated agents, the barrier, the phases, the
cancellation - is not reimplemented anywhere here.

**A fan-out that arrives without its script aborts.** An index whose
`parallel` node carries no `script` was written by an older generator. The
core says "regenerate the index" and stops, because running the branches
from the declaration right there would be exactly the second implementation
this decision refuses. For the same reason `script` is not a field an
author may write: `parseParallel` refuses it, and it exists only on the
compiled node.

**One name, spelled once.** The script is saved under
`fanName(workflow, join)` and asked for back by that name through the
`workflows` command pi-subagentura registers - a command, because that is
the only way an extension can hand that runner a script. The generator
writes the script and the Dispatcher asks for it back, so the name and the
command are exported from `src/subagentura.ts` and spelled nowhere else;
two spellings would be a fan-out invoked by a name nothing wrote.
pi-subagentura's `sanitizeWorkflowName` refuses a name it does not like at
save time - after the run has committed to fanning out - so `checkFanOuts`
holds every `fanName` to the runner's pattern at generation instead.

**The suite runs the emitted script.** "Conforms to the runner's contract"
is a thing a script does or does not do when executed, so the tests execute
the emitted bytes against stubbed globals rather than pattern-matching the
generator's output.

## What was considered and rejected

- **Assembling the branches at runtime from the declaration.** The second
  implementation, above.
- **Pointing at a script on disk instead of carrying it in the index.** A
  pointer can dangle, and the index already carries a Rule's whole text for
  the same reason: what was reviewed is what runs.
- **Letting the script apply the failure policy.** Puts a decision where no
  log line reports it, and makes `abort` versus `tolerate` two behaviours
  of a runtime rather than two lines in the dispatch log.

## Consequences

- A change to what a fan-out does is a diff under `generated/`, reviewable
  before it runs.
- The core's fan action carries the script to the adapter; the adapter
  writes it into `~/.pi-subagentura/workflows` and invokes it by name, and
  holds no opinion about its content.
- The emitted script keeps its own explanatory comments. They are string
  literals in `parallelScript` - part of the generated artifact, whose
  runtime copy under `~/.pi-subagentura` has no suite or ADR beside it - so
  the comment-discipline Rule reads them as the artifact's documentation,
  not this repository's comment load.
