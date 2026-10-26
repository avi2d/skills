---
name: ui-principles
description: "Interaction judgment for interfaces: start from the decisions, reduce effort, act next to the object, one gesture per decision, only valid choices, truthful async state, local waits, preserved user edits, undo and drafts, one vocabulary, stable layout and complete states, host conventions and focus, and long labels. Pull when designing or reviewing how a screen or a control behaves, or when choosing between two UI options."
kind: reference
source: https://github.com/CyberAP/ui-principles@531c436c07900a84d1ec7d793a419dec5cd3eba4
consults:
  - motion
  - interface-copy
  - plain-words
---
# UI principles

These principles decide what goes on a screen, how it behaves and how it looks.
They are a standard to decide by rather than a checklist to cite.
They come from tools a person uses repeatedly, such as an editor or an admin screen, so a first visit to a website bends some of them, and each section says where.
Visual identity is the design direction's business, and these principles never override it.

## Working to them

- **Designing.** Start from the decisions, then compose from that list rather than from the screens that already exist.
- **Checking.** One gesture per decision, only valid choices and local waits are the ones a plausible control breaks silently, so exercise them before calling a screen done.
- **Reviewing.** A finding names the observed behaviour, where it happens and the principle it breaks, because a principle's name alone is not evidence.
- **Conflict.** Choose one principle, name the one given up, and record the tradeoff.

## Start from the decisions

Before any layout, list the decisions a person makes on this surface and how often each happens.
The frequent decision gets the most direct, visible gesture, and a rare edit stays available out of the way.
On a website, a first visit's decisions come before repeat actions: does this person fit the job, where is the evidence, how do I reach them.
Each option is labelled by its outcome, as the `interface-copy` reference describes for actions.

## Reduce effort, reveal depth on demand

Make people think less: the fewest steps, not the fewest elements.
Every element serves a real purpose, each fact has one home, and the options of the core decision are always visible where the person makes it.
Advanced controls wait behind an interaction, a context or a mode.
Find the action a person repeats most and make it the cheapest, with one fixed target and no aiming.
A first-time visitor needs an explicit identity, offer and route to contact, so an introduction that states the purpose is not clutter.
Several primary actions across independent tasks are fine, and one primary action per decision is the rule.

## Act next to the object

A person acts on the object where it is shown, and a control sits next to what it acts on, on its first line.
Things that belong together stay together and look alike, so the layout explains itself and mirrors the structure of the decision.
A form or a dialog is right when it clarifies a complex edit, holds focus, or shows an irreversible consequence, so a contact form is not a violation for being a form.

## One gesture commits one decision

- Each surface and each gesture does one job, and navigating, structuring and choosing never share a gesture.
- Hover informs and a click acts, so nothing stateful or audible happens on hover.
- A row is either one target or a holder of its own controls, never both.
- A glyph means one thing everywhere, so a close button never deletes.
- A mode offers only its own actions.

A test clicks each child control and checks that the parent row did not also activate, because spotting nested markup misses a click handler delegated to the parent.

## Expose only valid choices

A control exists only if every value it can reach is valid, and a value the system fixes is shown as text rather than offered as a one-option select.
An action that is valid but unavailable right now may stay visible with its reason, because it tells a person what the product can do.
Keep the valid domain in one schema, and test by submitting every value the real control can reach to the real boundary.

## Keep async results truthful

Every action shows feedback at once.
Pending, saved and failed states are shown honestly, a late response never reverses what the person just did, and the source of truth has the final word.
Optimistic UI carries a rollback or conflict policy, and slow sync never interrupts unrelated work or playback.
A test delays request A, submits B, releases B before A, and checks the visible and the persisted result, and covers rejection and reconnect.

## Local waits and actionable validation

A wait affects only what is actually waiting, and everything else keeps working.
Short waits stay invisible and long ones show where they happen.
Missing input is explained next to the action that needs it, and whether that action stays enabled is decided per workflow.
A control disabled for a reason outside the person's input says that reason.
Duplicate and destructive actions are guarded while they are in flight.
A test delays one operation and uses another, submits missing input and checks that no harmful request leaves, and submits twice.

## Show what changed and keep the person's edits

Show the difference rather than the whole state: what is new, what it was, and who made it, whether the tool, the person or an upstream source.
A person's own edits outrank the tool's and are never silently overwritten, and when ownership cannot be resolved the conflict is shown.
A test edits a field, injects a generated or upstream update, and checks that the person's value remains or a conflict appears, after a reload too.

## Undo, and survive interrupted work

Exploring costs nothing: the original is kept and a reversible local change can be undone.
Prefer undo to confirmation for a reversible action, offered quietly rather than as a row in the content.
An action that reaches beyond what the person can see, such as sending a message, asks for an explicit commitment, because undo cannot recall it.
What the person typed, where they are and what they were looking at survive switching, errors and coming back, within a defined expiry and with no sensitive data stored by default.

## One vocabulary within a product

The same thing looks and behaves the same way everywhere in a product: shared controls, tokens and interaction behaviour.
Action names follow the `plain-words` reference.
The material says what a person can do, so editable text sits in a field and an action looks like an action.
The direction chooses its own families, and two purposeful type families are allowed when the brief needs them.

## Stable layout and complete states

Empty, busy, error and disabled get the same care as the main state, and disabled keeps its shape.
Layout stays still under the person's attention: space is reserved for content that arrives, and a state that comes and goes shares a slot with one that stays.
Motion is short, interruptible and shows a change of state, as the `motion` reference describes.
A test reads a named target's bounding box before and after delayed content loads, and includes interactions, because an aggregate layout shift score leaves out shifts that follow input.

## Host conventions and keyboard focus

Familiar native controls beat invented ones, and the host's conventions for gestures, modifiers and theme hold.
Focus stays visible for the keyboard, and a click never erases later keyboard focus, so focus outlines are never removed globally.
A desktop dialog follows its platform's button order only in a native host, and on the web the product keeps one consistent order.
A test tabs through the real controls, activates them by keyboard and checks the visible focus, beside an existing accessibility scan.

## Long labels and reading-sized review

Design for the longest string and the right reader: labels wrap rather than compete, and a surface for reviewing is sized for reading.
A test renders the real longest translation and adversarial labels at each declared width and at enlarged text, checks that named controls do not clip, overlap or overflow, and fails when it scanned no page or no target.
Optical alignment and concentric nested corners stay with visual review.

## Sources

This Reference adapts and changes text from `SKILL.md` in UI principles at `https://github.com/CyberAP/ui-principles@531c436c07900a84d1ec7d793a419dec5cd3eba4`, dedicated to the public domain under CC0 1.0 Universal in `LICENSE`.
The text here is rewritten, regrouped and narrowed, and is not the upstream wording.
