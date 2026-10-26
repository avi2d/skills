# 50. The assertion rules hold a generated baseline

Date: 2026-09-24

## Status

Accepted. Supersedes the part of 0033 that left
`typescript/no-unsafe-type-assertion` and `typescript/no-non-null-assertion`
off by name. Superseded by 0055 on the rules the baseline counts, by 0056 on the count, and by 0067 on the baseline.

## Context

0033 left both rules off because they ban outright what the `as` and non-null
`!` clauses of `typescript-best-practices` permit under a condition, and
judging the sites already in the tree was a policy nobody had made. That left
the two clauses as prose with no program behind them, and prose alone did not
hold them: a crude count of assertion-shaped tokens in `src/` went from 36 to
49 between 2026-08-27 and 2026-09-22 while the clauses were live.

With both rules on, oxlint reports 207 sites on this tree: 56 in `src/` and
`harness/`, 15 non-null assertions and 41 unsafe type assertions across 14
files, and 151 in `tests/`.

## Decision

**Both rules are `error` for `src/**` and `harness/**`, held at a baseline of
the sites there today.** An `overrides` block in `.oxlintrc.json` turns them
on. The check does not decide whether any of the 56 is right, which is the
judgment 0033 refused; it decides that the count only falls.

**The baseline is oxlint's own.** `oxlint-suppressions.json` at the root is
oxlint's bulk-suppression file, a count per rule per file. `oxlint
--suppress-all` writes it, `oxlint --prune-suppressions` shrinks it, and every
run reads it. Measured on 1.83.0, whose `--help` lists neither flag:

- A site beyond a file's count fails the lint, in a file the baseline counts
  and in one it does not.
- A count above what the file holds fails it too, as "suppressions that do not
  occur anymore". Fixing a site fails the lint until the prune lowers the
  count, and a count raised by hand leaves no slack to spend.
- `--suppress-all` only adds and `--prune-suppressions` only removes, so the
  one file the lint accepts is the one the generator writes from the tree.

**Every run is type-aware, through `options.typeAware`.** A failure names the
repair as bare `oxlint --suppress-all` or `oxlint --prune-suppressions`, and
without type information `no-unsafe-type-assertion` does not run, so a bare
prune deletes its 41 entries as unused. With the option set, the command a
failure prints is right as printed. The lint script keeps `--type-aware`.

**No site carries a directive.** `comment-discipline` bans machine-read
suppressions in comments; the baseline is a file of counts, and no line of
source changes.

**The baseline counts these two rules and nothing else.** `--suppress-all`
records every rule's findings, and while the file exists oxlint suggests it on
any failure, so a regenerate over an unused variable would baseline that too
and the lint would pass. `tests/e2e/assertion-baseline.test.ts` refuses a
baseline naming a third rule. It also runs the real config and baseline in a
scratch copy of the scoped trees: it regenerates the baseline from nothing and
compares it byte for byte, adds each rule's site to a counted file and to a
new file under each scoped tree, and removes an accepted site to see the lint
fail until the prune restores the committed file.

## Alternatives

`--max-warnings` with both rules at `warn` holds one number for the whole tree.
It is written by hand into the lint script, shared with any other warning, and
blind to where a site moved, and fixing a site leaves slack a new one can
spend. Rejected.

An override switching the rules off for each file that holds a site today
grandfathers whole files: a thirteenth `!` in `src/dispatch.ts` would pass.
Rejected.

A script here comparing oxlint's JSON output against a counts file of its own
is oxlint's feature written twice, and the copy nothing else runs is the one
that goes stale. Rejected, and the shared checks kit is where one would go if
oxlint lacked it.

Turning the rules on for the whole tree at once, 207 sites, was the other
scope. `src/` and `harness/` come first; `tests/` is a glob added to the
override and a regenerated baseline.

## Consequences

Accepting a new site would be running `oxlint --suppress-all` and committing a
raised count, a diff only a reviewer would see. `checks-suppressions-ratchet`
from `@avi2dg/checks` refuses it instead: `bun run lint` and a pull request
workflow read the suppressions file at the merge base with main and at the
head, as `checks-comment-gate` reads a range, and fail naming each rule and
file whose count rose or appeared. A lowered count or a removed entry passes.

An `oxlint-disable` comment passes both rules and the baseline. The kit's
comment check refuses `eslint-disable` and not `oxlint-disable`, and oxlint has
no setting that refuses inline directives, so that is true of every lint rule
here. The kit's directive list is where it closes.
