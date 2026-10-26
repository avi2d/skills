---
name: interface-copy
description: "Craft depth for the words inside an interface: action labels, form labels and validation, errors, loading, empty and success states, terminology, and messages that translate and fit. Pull when writing or fixing the text of a screen, a control or a state, rather than a document."
kind: reference
source: https://github.com/pbakaus/impeccable@e103efe779e2dd01274dabae83531fef00bf2563
consults:
  - plain-words
  - punctuation
  - russian-prose
---
# Interface copy

Interface text tells a person what happened, what matters and what to do next.
Keep the product's factual meaning, its terminology and its voice.
Ask before changing a factual claim, a legal meaning or a term that may belong to the domain.
Russian UI strings follow the info style that the `russian-prose` reference names.

## Read the whole path

Read the entire interaction path rather than isolated strings, and list:

- ambiguous nouns, verbs and actions, and internal jargon
- vague labels, outcomes and system states
- a missing consequence, recovery path or timing
- one concept capitalised two ways
- a heading, intro or helper line that repeats what is already said
- text that breaks at a realistic width or in translation
- a tone that ignores stress, risk or urgency.

## Set the message for each state

For each state, decide the one fact the person needs now, the action available next, the context that changes the decision, and the tone for the moment.
Say each idea once.
When the heading already explains the state, the introduction adds something new or goes.

## Write by function

**Actions.** A label names what will happen with a specific verb and object, such as Delete 12 files rather than Apply.

**Destructive actions.** Name the object and the consequence, prefer undo when recovery is safe, and when confirmation is needed name the action on both the message and the button rather than Yes or OK.

**Forms.** Labels persist and placeholders are examples, requirements show before submission, and validation says what needs attention and how to correct it, next to the field and announced to assistive technology.

**Errors.** A useful error says what failed, why when that is known and useful, and how to recover, with no internal code as the primary message and no promised cause the system cannot know.

**Loading.** Loading text names the real operation and sets an honest expectation when the wait is long, with determinate progress only when it is real.

**Empty states.** An empty state tells first use, no results, an active filter, a missing permission and a failure apart, and offers the next useful action.

**Success.** Routine success is brief, and mentions the next consequence only when it changes what the person does.

**Help.** Helper text answers an implicit question rather than restating the control, an icon-only control has an accessible name, and link text follows the `punctuation` reference.

Privacy, payment, deletion, access loss and blocked work are treated seriously, so warmth is welcome there and jokes are not.

## Translation and fit

- Write whole translatable messages rather than concatenated fragments, with variables and numbers structured so a translator can reorder them.
- Plurals go through `Intl.PluralRules` or the project's i18n library, never a hand-built `s`.
- Leave room for expansion, since a translation often runs a third longer, rather than abbreviating early.
- Alt text carries the image's information, and a decorative image has an empty alt.
- A screen reader name matches the visible label.
- Colour, punctuation or an icon never carries a message alone.

Terms follow the `plain-words` reference.

## Verify

Read the flow in context and check that it is understood without hidden product knowledge, that every error, empty state and decision point says what to do, that terms are accurate and consistent, and that the text holds at the target widths, at 200 % zoom, with long names, in every shipped language and with dynamic values.
The final copy is as short as it can be without losing meaning or recovery.

## Sources

This Reference adapts and changes text from `skill/reference/clarify.md` in Impeccable at `https://github.com/pbakaus/impeccable@e103efe779e2dd01274dabae83531fef00bf2563`, Copyright 2025 Paul Bakaus, under the Apache 2.0 licence in `LICENSE`.
The text here is rewritten and shortened, and is not the upstream wording.
