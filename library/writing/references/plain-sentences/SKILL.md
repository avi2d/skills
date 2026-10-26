---
name: plain-sentences
description: "How a sentence a person reads is built, in any language: one thought each, length, condition first, commands, the actor named, the reader as you, and one reading only. Pull before writing or editing a doc, a commit message, a PR description, a report or UI copy."
kind: reference
source: https://github.com/cursor/plugins@fd6dd6f7276956a532bb78a748a8d2818b6eb5f4
---
# Plain sentences

Each heading is one principle about building a sentence.
The rules come from Google developer style, the STE rules of ASD-STE100 Issue 9 and Kohl's Global English Style Guide, fetched 2026-07-18.

## Carry one thought in a sentence

Give each instruction its own sentence, and each thought its own sentence everywhere else.
Split a sentence that carries two thoughts, and keep a long one that carries a single thought with its condition or consequence.

## Split a long sentence

Split an instruction longer than about 20 words and any other sentence longer than about 25.
Below that bound, let length follow the thought.
When you have to read a sentence twice to parse it, rewrite it.

## Put the condition before the instruction it guards

"To delete the document, click Delete." "If hot oil touches your skin, injuries can occur."
The reader skips what does not apply, and meets the warning before the step.

## Write an instruction as a command

"Install the component", not "the component must be installed" and not "you should install the component".
Write a procedure as direct commands, never as narration, and leave out "please".

## Name the actor

"The compiler checks the types", not "the types are checked".
"`budget.mjs` reads the budget", not "configuration is performed".
Use the passive only when the actor is unknown or beside the point.

## Address the reader as you, in the present tense

Write "you" and the present tense, and "will" only for what genuinely happens later.
A tutorial's "we" is the one exception.

## Put the common case first

State the common case, then the exceptions.

## Keep only and not next to the word they change

"Only fails on growth" and "fails only on growth" say different things.

## Make every pronoun point at one thing

Every "it", "they" and "this" points at one obvious noun.
Repeat the noun when in doubt, and never use "this" or "which" for a whole clause.

## Give every clause its own verb

"Phase 1 moves the converters and Phase 2 the runtime" leaves Phase 2 without a verb, so give it one.
Turn a participle or gerund phrase, such as a trailing "highlighting the risk", into a clause with its own subject and verb, or delete it.

## Turn a noun string into a clause

"The proto import budget check script" becomes "the script that checks the proto-import budget".

## Keep the small words that fix the parse

"Remove the backup file", not "Remove backup file".
"Ensure that the switch is off" keeps "that" because it makes the sentence parse one way.
Repeat the article in a series of two things: "the client and the host".

## Show what and and or join

When a sentence can group two ways, use "both...and", "either...or" or "if...then" to show which parts go together.

## Open consecutive sentences differently

Two sentences in a row that start with the same phrase read as a template, so start the second another way.
