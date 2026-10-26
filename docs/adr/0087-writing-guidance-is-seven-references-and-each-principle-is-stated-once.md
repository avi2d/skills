# 87. Writing guidance is seven References, and each principle is stated once

Date: 2026-10-07

## Status

Accepted.
Records the captain's answer of 2026-10-07 to the split proposal, which took every recommendation.
Amends 0061: `technical-writing` holds the shape of a doc file and routes every other kind of text, and the sentence layers move to other References.
Amends 0065: `unslop` holds the tells of what prose says and how it sounds, and its word, sentence and punctuation catalogues move to other References.
Amended by 0097: `writing-for-people` restates a short core of `technical-writing` and `unslop`, the one exception to stating each principle once.

## Context

The captain asked for the writing guidance to be split into small principles with no repeats, so that the next task can measure each principle with its own eval.
An inventory of `technical-writing`, `unslop`, `writing-for-agents`, the two writing Rules and the writing lines in `interface-copy`, `ui-principles`, `comment-discipline`, `agents-md-router`, `grilling` and the kit's prose matchers found 173 statements.
Nine groups of them repeated one principle word for word, 19 restated one in other words, and four contradicted each other.
The separator ban was stated in both References and held by the kit, and one name for one thing was stated nine times across four files.

## Decision

The writing guidance is seven References under `library/writing/references/`, and every principle in them has its own heading and is stated in one place only:

- `technical-writing` holds the shape of a doc file, and a table that sends each kind of text to the References it takes.
- `plain-sentences` holds how a sentence is built.
- `plain-words` holds which word goes in, with the filler, plain word and metaphor catalogues.
- `punctuation` holds the marks and inline markup.
- `unslop` holds the tells of content and voice, and the self-audit.
- `russian-prose` holds only what Russian adds to the other References.
- `writing-for-agents` holds the guidance for a document an agent consumes, one principle under each heading.

The four contradictions are settled in one place each.
Opinion belongs on an explanation page, in a decision record and in the recommendation of a report or a PR description.
The reader is "you", and a tutorial's "we" is the one exception.
`unslop`'s "use I" and "let some mess in" are dropped.
A sprawling agent document is disclosed by branch and split by sequence.

The review checklist and the worked example of `technical-writing` are dropped, because each restated principles stated above them.
The worked example's before and after pairs became the examples of the principles they showed.

`interface-copy` and `ui-principles` drop their own statements of one name for one thing, link text and the outcome label, and point at the Reference that holds each.
`comment-discipline` keeps its line on history in a code comment, because it is injected whole and a code comment is not a living doc.

`selection.toml` offers the four new References beside the three kept ones.
The `writing-for-people` and `agent-docs` Rules keep their text, their pointers and their state, and `writing-for-people` keeps its refusal.
The `readme-sections` case offers the five References for people prose in both arms.
The `copy-edit-overview` case offers `technical-writing`, `plain-sentences`, `plain-words` and `punctuation` alongside `unslop` in its injected arm, because they now hold the principles its judge reads.

## Consequences

The writing References total 30,808 characters against 34,935 before, as `docs/context-profiles.md` counts them.
Every session pays four more descriptions in the Hub listing.
A session that pulls `technical-writing` alone gets the routing table and the shape of a doc file, and pulls the sentence, word and punctuation References as the table says.
How the References reach a session is unchanged, and stays the open question the eval report of 2026-10-06 raised.
