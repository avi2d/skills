# 24. A constraint a program can decide is written as a program

Date: 2026-09-15

## Status

Accepted. Records `rules/force-determinism`.

## Context

Every Body in this tree is a non-deterministic instruction. It reaches a model
as text, it is read alongside everything else in that context, and whether it
was applied is not observable from outside the turn. That is the cost of the
whole collection, and it is worth paying for the things that need a human's
judgment.

It is not worth paying for the things that do not. The captain's instruction:

> i want to not lean if possible on non deterministic context instructions like
> skills or rules, if we can programmically check some cases - for example, we
> can ban expect-error usage, we should write such program and use it and not
> lean on context instruction

Asked how far it reaches, he answered that it is for all projects, which is why
it is a Rule here rather than a note in one repository.

Three failures in his repositories on the day this was written are what it is
drawn from, and none of them is a case of anyone ignoring an instruction:

- A test tier asserted colour contrast it had no way to measure. It reported
  compliance while the text on screen was unreadable.
- A guard became a test that could not fail, the moment the tree it read
  stopped being tracked. It passed on the directory being there and it passed
  on the directory being empty.
- Two hand-written tables that had to agree disagreed within hours of both
  being edited.

Each one is prose, or an unpinned table, sitting where a program belonged. The
second is the more useful of the three, because it is what this Rule does
wrong if it is followed carelessly: the check existed, it ran, and it was
green. Nobody had ever seen it red.

## Decision

`rules/force-determinism` is a Rule, scoped by `repo-contains` over the source
extensions, as `comment-discipline` and `software-design` are. The constraint
it governs is written in the same turn as the code, so it is in force before
that turn rather than queued by a write.

It says three things.

**Where a program can decide, the program decides.** The reader is given the
test, because that judgment is the one the Rule cannot make for them: could a
program decide this case, with no human reading anything? If yes, the Rule asks
for the mechanism by name - the type system, a lint rule or compiler flag, a
generator, a test - in that order of preference, since a state the types refuse
never reaches a linter. "Automate it" decides nothing and is not an answer.

**If no, prose is the right home and that is not a failure.** A rule that
treated every remaining sentence as unfinished work would push people into
writing checks that assert the thing they can reach instead of the thing they
mean, which is the colour-contrast tier exactly.

**A check that cannot fail is worse than no check**, because it reports success
forever and nothing contradicts it. So a new check is trusted only once it has
been watched failing: write the violation, see it go red, remove it, see it go
green, in that order. This is the part that stops the Rule manufacturing its
own false comfort, and it is why the second failure above is quoted in the Rule
rather than only here.

The Rule also states what it is. Whether a constraint is mechanizable is a
judgment, so it cannot check itself, and it is prose for the reason it permits
prose. A rule that overstated its own standing would be the thing it warns
against.

## What was considered and rejected

- **Folding it into `software-design`.** That Rule is about the shape of code.
  This one is about where a constraint is written down at all, and its subject
  includes the instructions in this repository. Buried as a bullet it would
  read as advice about tests.
- **Naming bans in the Rule itself**, `@ts-expect-error` among them. A Rule
  listing the constraints it wants mechanized is the failure it describes,
  written one level up. It names the mechanisms and lets each repository own
  its own checks.
- **Landing the checks with it.** A sweep is running against this repository
  now, and the checks this Rule implies here follow it. Landing both together
  would bury the standard under the work it prompted, which is what 0023 did
  for the same reason.
- **Making the Rule fire on a write instead of on the repository.** The
  decision about where a constraint lives is made while writing, so a Rule
  delivered at the write is the cleanup pass it exists to replace.

## Consequences

- **Some existing Rules are now candidates for deletion.** Any sentence in this
  tree that a program could decide is one this Rule asks to be replaced by the
  program, and that includes sentences in Bodies here. Nothing is deleted in
  this change; the Rule is the instrument that makes each of them answerable.
- **The trigger is pinned by a test rather than by this record.**
  `tests/dispatch.test.ts` asserts the Rule reaches a repository holding code
  and no repository without any. Both halves of it were watched failing before
  the change landed: once with the Body switched off in `selection.toml`, once
  with its glob widened to `**/*`.
- **A check added under this Rule costs two runs rather than one.** That is the
  price of the guard above, and it is paid every time.
- **Nothing measures compliance with it.** It is a Rule about determinism that
  is itself non-deterministic, and the record says so in place of a check.
