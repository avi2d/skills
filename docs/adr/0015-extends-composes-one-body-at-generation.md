# 15. `extends` composes one Body at generation

Date: 2026-09-14

## Status

Superseded on `extends` by 0030, which deletes the field and the composition
with it. What this record says about `consults` and about resolving a by-name
link while building still holds. Recorded the design `src/compose.ts` was built
to, and the rationale swept out of its comments by the comment-discipline pass.

## Context

A Body writes down the names of other Bodies in three places: a Skill
`extends` one other Skill, any Body `consults` the Skills and References it
pulls by name, and a Workflow's step names the Body it runs. Names can
dangle, and something has to decide when that is discovered and what a name
costs a reader at runtime.

The runtime alternative is a model asked for something no Hub holds, which
looks from the outside like a model that chose not to bother - the same
silent-degradation shape the Dispatcher exists to end. So all three links
are resolved while generating, and a name that leads nowhere stops the
build naming the Body and the field. `extends` and `consults` are checked
in `src/compose.ts`; a Workflow's step asks the same question through the
same `target` function from `src/dispatch-index.ts`, where the tree that
holds it is already being walked - one wording for one rule, because two
copies of the sentence are two wordings that can drift while the rule stays
one rule.

## Decision

**A Skill that `extends` another IS that Skill plus what it adds, and the
two are composed into one Body at generation.** The parent's prose arrives
in the child's own bytes, parent first, so there is no second invocation
the model could skip, and what the child adds reads as an addition because
what it adds to is already in front of the reader. A chain rather than a
single parent - a parent may extend one in turn, and the alternative is a
depth rule nothing needs - with a circle refused by naming the path that
closed it.

What travels with the prose:

- **The parent's assets, child's winning on a shared name.** A child that
  ships its own copy of a script means to use it.
- **The parent's `consults`.** The child inherits the paragraph that does
  the pulling, so it inherits what that paragraph pulls; without this, a
  child whose `harnesses` is wider than its parent's carries "read `x`"
  into a Hub nothing checked for `x`.
- **Not the `extends` field itself.** After composition the parent's text
  is here, so a field still naming the parent would send a model after a
  copy of what it is already reading. `withProse` strips the line from the
  emitted frontmatter.

**A child cannot reach a harness its parent's words were kept from.** The
child carries the parent's own text, so a child whose `harnesses` is wider
than its parent's would walk harness-specific prose into a Hub that
harness's Body was deliberately absent from. Refused in `lineage`, where a
reader of either Body can see the rule.

**Composition runs over the whole tree, before selection.** What `extends`
says is what a Body IS, so a parent switched off in `selection.toml` stops
being offered by name - it does not gut its children, which have already
absorbed its text. `generated()` in `src/generate.ts` holds the order.
What is reachable by name from a given harness is a Hub's question, and
`src/hub.ts` asks it there.

**A declared `consults` must be written in the Body's own prose, in
backticks.** The frontmatter says a reader is sent somewhere and the text
is where they are sent, so a Body declaring a link its own words never
mention is a link nothing would follow. Backticks, and not merely somewhere
in the prose, because `how`, `why` and `research` are ordinary English
words, and a link satisfied by a sentence that happened to use one is a
link nobody wrote. Checked against the composed text, since a child that
inherits the pulling paragraph has been sent where its parent sends anyone.

## What was considered and rejected

- **Resolving `extends` at runtime** - the parent as a second document the
  model is asked to also read. The invocation it could skip, above.
- **Selecting before composing.** Makes switching a parent off a breaking
  edit to every child, when the intent of the switch is only to stop
  offering the parent by name.
- **Accepting a `consults` the prose never mentions.** A declaration with
  no sentence behind it; the check is the same rule `records` is held to
  (a declared Fact must be asked for in the text).

## Consequences

- A dangling `extends`, `consults` or step name is a build failure naming
  the Body and the field, never a runtime shrug.
- A composed Body in the Hub is self-contained: its bytes carry everything
  its lineage said.
- The `at` and `target` helpers in `src/compose.ts` are exported precisely
  so the third by-name link (Workflow steps) phrases its complaints the
  same way.
