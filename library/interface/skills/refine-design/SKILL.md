---
name: refine-design
description: "Run one named, scoped refinement pass on an interface whose design direction is already chosen: critique, polish, clarify, adapt, harden, bolder or quieter, touching only the named target and keeping the identity. Use when a person asks to critique, polish, tighten, harden, adapt, quieten or make bolder an existing page, screen or component."
kind: skill
source: https://github.com/pbakaus/impeccable@e103efe779e2dd01274dabae83531fef00bf2563
consults:
  - visitor-job
  - typography
  - interface-copy
  - motion
  - mobile-web
  - stress-test-content
---
# Refine a design

Refinement preserves and redesign replaces.
A refinement keeps the incumbent identity, behaviour, copy and everything outside its scope.
Building a new direction is the design builder's job, such as the frontend-design skill a website vendors, and the person chooses a direction before a refinement starts.
When the concept itself is wrong, say so and recommend a redesign, rather than polishing a look the person should discard or quietly designing another direction.

## 1. Name the pass and the scope

Pick one pass from the table, and ask once when two fit.

| Pass | Job | Pull |
| --- | --- | --- |
| critique | Evidence-backed findings and their priority, with no edits | the `visitor-job` reference |
| polish | Finish what exists to one quality bar across the whole path | the `typography` reference and the `motion` reference for those defects |
| clarify | Make the interface text say what happened and what to do next | the `interface-copy` reference |
| adapt | Make the target work at another size or input | the `mobile-web` reference |
| harden | Make it survive real content, languages, errors and networks | the `stress-test-content` skill |
| bolder | Raise one flat section to the conviction its neighbours have | the system the page already owns |
| quieter | Lower the intensity of a loud target without losing character | the system the page already owns |

Write down the pass, the target, the files the pass may change, and what must stay untouched.
Before the first edit, run `git status --porcelain` and record every path it lists as the person's own work, which the pass preserves through any move.
Through the pass, log every file it creates, edits, moves or renames, because only that log identifies a change as the pass's own.
Step 4 reverses only a change outside the allowed paths that the log shows as the pass's own, and asks the person whenever ownership or the reversal is uncertain.
Ask before changing a factual claim or adding one.

**Done when** the pass, the target, the allowed paths and the starting record are written in the answer.

## 2. Read the incumbent

Read the tokens, the shared components, the copy and the neighbouring flows the target belongs to.
Name the surface's job from the `visitor-job` reference.
Render the target at desktop and phone widths and look at it, in each shipped language.

## 3. Run the pass

- **critique:** list each finding with the rendered evidence, the file, the job it fails and a priority, and stop without editing.
- **polish:** fix in order broken tasks and misleading state, then missing loading, empty, error, disabled and success states, then flow, hierarchy and responsive drift, then visual and motion inconsistency, then dead code and leftover assets, each at the narrowest level that fixes its cause.
- **clarify:** rewrite the path's text by function, keeping terms and facts.
- **adapt:** change only what the other size or input needs.
- **harden:** run the `stress-test-content` skill on the target and fix what it finds.
- **bolder:** reuse the page's own type scale, motif and devices at full strength for the target, make one decisive move and quiet what surrounds it, adding no colour, font, radius or primitive the system lacks unless the person agrees to it.
- **quieter:** reduce saturation, weight, effects and motion while keeping hierarchy, anchors and the point of view.

## 4. Hold the scope

Run `git status --porcelain` again and compare it with the starting record, the pass's log and the allowed paths.
Keep every change inside the allowed paths, including a move or a rename there together with the imports it updated.
Reverse a change outside the allowed paths only when the log shows the pass made it and the starting record does not list its path.
Reverse such a move or rename by moving the file back to its old path, never by deleting the destination, because the file can hold the person's only copy of their edits.
Name every other change outside the allowed paths and ask the person, including an edit to a path in the starting record, a change whose owner is uncertain and a reversal whose result is uncertain.
Everything outside the target renders as it did before the pass.

## 5. Verify

Render the target again at desktop and phone widths, through the states the pass touched, with keyboard and touch where they apply.
Repeat render, fix and confirm until a round shows no new finding inside the target.
Hand over by name, rather than approve, any finding whose fix would leave the target or needs the person's call.

## 6. Finish

Report the pass, what changed with its files, the rendered evidence, and what remains open.

## Sources

This Skill adapts and changes text from `skill/SKILL.src.md`, `skill/reference/polish.md`, `skill/reference/bolder.md`, `skill/reference/quieter.md` and `skill/reference/critique.md` in Impeccable at `https://github.com/pbakaus/impeccable@e103efe779e2dd01274dabae83531fef00bf2563`, Copyright 2025 Paul Bakaus, under the Apache 2.0 licence in `LICENSE`.
The text here is rewritten and shortened, and is not the upstream wording.
