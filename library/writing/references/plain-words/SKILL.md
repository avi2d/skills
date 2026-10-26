---
name: plain-words
description: "Which word goes in prose a person reads: cutting filler, the short everyday word over AI vocabulary, the real name from the code, one name for one thing, literal words over jargon and metaphor, no hedge, and verbs over adverbs, each with its catalogue. Pull before writing or editing a doc, a commit message, a PR description, a report or UI copy."
kind: reference
source: https://github.com/cursor/plugins@fd6dd6f7276956a532bb78a748a8d2818b6eb5f4
---
# Plain words

Each heading is one principle about choosing a word, followed by the catalogue it is checked against.

## Cut every word that does no work

If the sentence survives without a word, the word goes.
"Note that it's important to remember that" is deleted whole.

- "In order to" becomes "to".
- "Due to the fact that" becomes "because".
- "It is important to note that" is deleted.
- "In the event that" becomes "if".

## Use the short, everyday word

A long word has to buy its length with precision.

- "Utilize" and "leverage" become "use", "facilitate" becomes "help", "numerous" becomes "many".
- "Serves as", "stands as", "boasts" and "features" become "is" or "has".
- Additionally, crucial, delve, enduring, enhance, fostering, garner, interplay, intricate, showcase, tapestry and underscore become the plain word they stand for.
- A buzzword becomes the plain word it decorates.

## Call a thing by its name in the code

The codebase is the word list.
Write the real symbol, file, flag or command name, not a synonym or a description of it.
"The ratchet" becomes `budget.mjs`, or the mechanism it names: "a limit that only tightens".

## Give one thing one name, and one word one meaning

Call each thing by one name, everywhere: a doc that says "the gate", "the ratchet" and "the budget check" for one thing teaches three things.
Pick one word for each action, "start" and never "initiate" for the same act, and give each word one meaning, so "check" never means both inspect and restrain.
In a product, the same concept keeps the same words on every screen, and when terms drift, keep a short glossary.
Leave an unchanged sentence as it was, since rewording it between edits costs the reader the same way.

## Say it literally

Use the words a developer would say out loud: "move", "delete", "a budget that only decreases".
A named pattern is fine when the doc says what it means the first time.
Skip idioms, colloquialisms, Latin abbreviations and figurative language, which a non-native reader, a translator and an agent all parse worst.
These abstract nouns read as technical and usually hide a plainer word, and new offenders join the list with their replacement:

- "Substrate" becomes "base", "wedge in" becomes "add", "vector" becomes "way" or "method".
- "Evacuate", for moving code, becomes "move out".
- "Endgame" becomes "the last phase", and "gold-plating" becomes "more than the job needs".
- Locus, vantage, nexus, primitive as a noun, harness as a metaphor, surface as in "API surface", bedrock, scaffolding as a metaphor, modality, paradigm, north star and flywheel become the concrete thing they stand for.

## Commit to the claim

State the fact once and plainly.
"Could potentially possibly be argued that it might" becomes "may", and a fact you know needs no hedge at all.

## Use a stronger verb or the number instead of an adverb

"Runs quickly" becomes "is fast" or the time it takes.
"Significantly improves" becomes the measured difference.
An adverb propping up a weak verb means the verb is wrong.
A procedure never calls a step "simply", "easy" or "quickly".
If it were simple, the reader would not be here.
