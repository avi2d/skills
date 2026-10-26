# 12. A Rule's trigger is a list, and any match fires it

Date: 2026-09-14

## Status

Accepted. #12 is the limit this lifts; `technical-writing` is the case that
exposed it.
Amended by 0061: `technical-writing` is a Reference now and fires on nothing.

## Context

A Rule declared exactly one `trigger`, so a Rule that genuinely applies in
two unrelated places could not say so. `technical-writing`'s description
names docs, readmes, RFCs, PR descriptions and commit messages; its one
`file-matches` trigger reaches the first three, and a commit message written
through `git commit -m` or a PR body pushed through `gh pr` never touches a
matching path. The predicates to reach both existed (`tool-call` on
`bash.command`); a Rule was just not allowed to carry them alongside the
`file-matches` one.

The issue left the shape open: `trigger` accepts a list, or a new `any-of`
predicate holds the alternatives.

## Decision

`trigger` accepts one condition block, or a non-empty list of them; any
match fires the Rule. Internally everything is a list: the parser normalises
a single block to a one-entry list, the index carries `triggers`, and the
core iterates.

The list won over `any-of` because a combinator is not a predicate: it would
be a fifth entry in `PREDICATES` that matches no event itself, it invites the
nesting question (`any-of` inside `any-of`) with no meaning to give it, and
it costs a level of indentation in every Rule that uses it. The list has
none of those, and a single-trigger Rule's frontmatter stays exactly as
authored - only the generated index changes shape.

What the change holds on to:

- **The log names the trigger that fired, not just the Rule.** The existing
  `why` strings already name the predicate and its evidence; a `tool-call`
  line now carries its glob too (`tool-call matched bash.command against
  **git commit**`), because two of one Rule's alternatives can share a tool
  and an argument, and which of them a broken predicate hides behind is what
  the line is for.
- **At most one injection per session.** Firing and injecting were already
  separate: however many triggers match, the `injected` set admits a Rule
  once.
- **A broken alternative is reported without silencing the ones that work.**
  Each trigger is evaluated on its own, so a `tool-call` entry whose argument
  is missing says `broken` while a sibling still delivers.
- **A complaint names the entry.** A malformed list entry reports as
  `trigger[1].glob`, not as `trigger.glob`.

The Dispatcher's boundary check (`readIndex`) requires `triggers` to be an
array, so an index generated before this change is refused with "regenerate
it" rather than read as every Rule silently off.

## What was considered and rejected

- **An `any-of` predicate.** See above: a combinator posing as a predicate,
  plus the nesting question.
- **`trigger` singular kept for one condition, `triggers` plural added for
  lists.** Two field names for one idea, and every reader of the schema
  learns both.

## Consequences

- `technical-writing` declares three triggers and now reaches all five of
  its advertised cases. Its `gh pr` glob is `**gh pr {create,edit}**` rather
  than the issue's `**gh pr**`, because `gh pr` is a substring of
  `gh project` and the two subcommands that write a PR body are create and
  edit.
- Any future Rule that applies in unrelated places declares the list; the
  first matching trigger, in declared order, is the one the log credits.
