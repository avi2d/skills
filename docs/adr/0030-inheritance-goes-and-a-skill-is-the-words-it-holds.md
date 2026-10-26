# 30. Inheritance goes, and a Skill is the words it holds

Date: 2026-09-15

## Status

Accepted. Supersedes 0015 on `extends`. What 0015 decided about `consults`
and about a by-name link resolved while building still stands, and moved with
the code.

## Context

`extends` let a Skill declare itself another Skill plus more, and generation
composed the two into one Body: the parent's prose, then the child's. It was
built, documented in 0015, and tested. No Body ever used it. `grep -rl
"^extends:" rules skills references workflows` returns nothing.

Composition also needed a copy to live in. The composed Body existed only in
the emitted Hub, because the parent's text had to be written into the child's
bytes somewhere, and the tree keeps neither. 0029 makes a Hub a directory of
links into the tree, which leaves nowhere for a composed Body to be. A Body is
now the directory it is written in, and that directory is what every harness
reads.

So the choice was to keep inheritance by giving it a place to be written, or to
delete a feature with no users. Keeping it means a copy in the very design that
was removing copies.

## Decision

`extends` is deleted: the field, `src/compose.ts`, the lineage and circle
checks, `withProse`, and the tests that covered them. A Skill is the words in
its own `SKILL.md`. Sequencing two Skills is a Workflow, which is what
`CONTEXT.md` already said inheritance was not.

`at` and `target`, the two helpers that phrase a dangling-name complaint, move
to `src/bodies.ts`, where the three remaining by-name links reach them.
`consults` keeps every rule 0015 gave it, now checked over the tree as
authored, in `consultable` in `src/hub.ts`.

## What was considered and rejected

- **Keeping `extends` and composing into the linked directory.** A generated
  `SKILL.md` would have to be written somewhere, so a Hub goes back to holding
  bytes for the sake of a field nothing uses.
- **Keeping the field parsed and refusing it.** A schema that knows the word
  only to reject it is a feature the frontmatter still advertises.
- **Leaving it in unused.** Every reader of `src/` pays for it, every future
  change to Body loading carries it, and nothing was gained while it sat there.

## Consequences

- **A Skill that wanted a parent writes the words or declares a Workflow.**
  Bringing `extends` back is a revert of this commit and a new place to put the
  composed text.
- **`UncomposableBodies` keeps its name** while no longer having composition
  behind it. It is the failure for Bodies that do not fit together: two sharing
  a name, a consulted Body outside the Hub, a Workflow step naming nothing. The
  messages are the product, and they did not change.
- **0015's account of `extends` is history rather than instruction.** It
  records a design this repository ran for a day and removed.
