# 38. What a session opens with is a number a check holds

Date: 2026-09-22

## Status

Accepted. Applies 0024 to the one property of this collection that nothing was
deciding: how much context the Rules spend. Covers the total; a cap on a single
Body is a separate decision and is not made here. Amended by 0060: the
dispatch index also carries the Rules the Selection leaves off, so the budget
measures `indexFor` without them. Amended by 0065: `WORST` is 3,550.

## Context

Every Rule this repository switches on is charged to a real session, and until
now nothing measured the bill. The Selection says which Rules are on and the
trigger says when each fires, so the cost is computable from the tree - and it
was computed for the first time while planning this refactor, which is late.

Measured against the dispatch index on the day this was written, for pi:

```
opening: 944  prove-it-works 525, guard-the-context-window 218,
              right-size-the-work 119, fix-what-you-see 82
worst:   2889 + effect-error-channel 712, comment-discipline 619,
              force-determinism 555, git-hygiene 59
```

Two numbers rather than one, because a Rule costs on two schedules. Four of the
eight active Rules carry `trigger: always` and are in every session's opening
context. The other four fire on `file-matches` or `repo-contains`, so a session
in a repository that trips none of them pays nothing for them. Adding the eight
together gives 2,889 and overstates the unconditional bill by three times,
which is the reading anyone would take without the split.

The number moves under this refactor in both directions: phases ahead of this
one delete bodies, re-enable `typescript-best-practices` and
`writing-for-agents`, and shrink `unslop` into a lint config and switch it back
on. Each of those is a deliberate change to what a session opens with, and none
of them would have been visible as one.

GitLab enforces the same shape on its own agent instructions and is worth the
comparison: `.ai/principles/distillation_prompt.md` has a hard 64 KiB budget,
guarded by a validator at lefthook pre-commit, at pre-push, and as a CI job,
and the provisioner aborts before mutating anything, "reporting stored bytes,
the overage, and how much Markdown to remove". The last clause is the part
worth copying.

## Decision

`tests/budget.test.ts` holds two ceilings, `OPENING` at 1,200 tokens and
`WORST` at 3,500, and checks both for every harness in scope.

What it measures is `indexFor(harness, ...).rules[].text`, the prose a
Dispatcher injects, rather than the `SKILL.md` on disk. The two agree today and
they are not the same claim: the index is the artifact a session receives, it
is already filtered by the Selection and by `receives`, and it is what would
change first if injection ever stopped being the whole file.

A token is four characters. The ceilings are set against that same count, so
the pair is a budget rather than a measurement, and swapping in a real
tokenizer would mean restating both numbers rather than discovering the check
was wrong.

`overBudget` returns the total, the ceiling, the overage and the three largest
bodies, so a red run says what to cut without anyone opening a second file.
`tests/lib/budget.ts` is a pure function over a spend list, and a test feeds it
a synthetic set over its ceiling, so the check is held to being able to fail
without switching a Rule on to prove it.

Raising a ceiling is allowed and is meant to be a diff. A phase that switches a
Rule on raises it in the same commit and says why there.

## What was considered and rejected

- **One ceiling over every active Rule.** It is the number that is easy to
  quote and it is the misleading one: `unslop` at 1,628 tokens on `always`
  costs a session more than `software-design` at 1,802 on `repo-contains`, and
  a single total ranks them the other way round.
- **A word cap on each Body.** The Agent Skills spec recommends under 5,000
  tokens and under 500 lines per `SKILL.md`, which every Body here already
  satisfies - a check that cannot fail. `obra/superpowers` caps an ordinary
  skill at 500 words and a frequently-loaded one at 200, which 20 of the 52
  Bodies exceed, and it would charge a long Reference that is pulled on demand
  the same as a Rule that is injected every turn. The aggregate is what costs.
- **Measuring the `SKILL.md` file.** It counts frontmatter and it counts Bodies
  the Selection switched off, so it answers a question about the tree rather
  than about a session.
- **A real tokenizer.** It adds a dependency to the build side of the suite to
  sharpen a number whose purpose is to be compared against itself.
- **Failing the generator rather than the suite.** `bun run generate` would
  then refuse to write a tree somebody is deliberately measuring, and the
  Dispatcher is not what the ceiling is about.

## Consequences

- **Switching a Rule on is now two edits**, `selection.toml` and, when it does
  not fit, the ceiling. That is the check working: the second edit is where
  the cost gets stated.
- **The ceilings have about 20% of headroom each** and are not slack to spend.
  The phases ahead add more than that, so they raise the numbers explicitly.
- **A per-harness difference would show up here first.** The three harnesses
  hold the same Rules today; the test asks each one separately, so a Body that
  one harness stops receiving changes one row rather than the total.
