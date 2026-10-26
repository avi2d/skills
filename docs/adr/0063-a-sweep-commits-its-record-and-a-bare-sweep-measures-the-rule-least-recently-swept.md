# 63. A sweep commits its record, and a bare sweep measures the Rule least recently swept

Date: 2026-09-25

## Status

Accepted.
Amends 0057 on where a sweep's results live, on the default repeats and cap, and on what a sweep that names no Rule measures.
Amended by 0097: the default cap is 80, the plan of `writing-for-people` at 5 repeats.
Amended by 0098: the default cap is 120, the plan of `writing-for-people` at 5 repeats.

## Context

0057 kept a sweep's results under `reports/`, which git ignores.
The calibration of `comment-discipline` on 2026-09-24 is the one sweep run so far, and its raw results survived only in a disposable worktree.

The defaults could not run together.
Every Rule with a case, at 3 repeats, planned 48 runs against a cap of 24, so a bare `bun run eval` was refused.
The refused sweep still wrote a `results.json` and a `table.md` with nothing in them.

At 3 repeats, a case whose arms split 3 to 0 reads a Fisher p of 0.1, the lowest a single case could reach.

## Decision

**A sweep's record is committed.**
A sweep that records at least one run writes `evals/sweeps/<startedAt>.json`, named for the UTC second the sweep started.
The record holds the model, the thinking level, the repeats, the commit the sweep ran on, the runs planned, the names of any that left no run record, and every run's verdict and spend.
It also holds a sha256 of each Rule file the sweep injected, and whether any of them differed from that commit, because the sweep reads the working tree and a Rule edited but not yet committed is not the prose the commit holds.
A sweep on such a tree is recorded rather than refused, and the page marks it uncommitted.
The reporter creates the file and never overwrites one.
A sweep that records no run writes nothing, to `reports/` or to `evals/sweeps/`, and a refused sweep is one of those.
`src/eval-sweeps.ts` decodes each record with a schema and refuses one named apart from its start.

`bun run docs` writes `evals/sweeps/README.md` from the records: every sweep with its model, thinking, repeats, runs and cost, then each Rule's arms, difference and Fisher p per sweep and per case.
`tests/docs.test.ts` fails when the page and the records disagree.
`tests/e2e/eval-sweeps-history.test.ts` fails when a commit or an uncommitted change edits, renames or deletes a record.
The suite workflow checks out full history, so that test reads every commit there.

Each run's event stream and changed files stay under `reports/`.
The calibration's came to 4 MB for 24 runs.

The calibration is the first record.
Its runs are copied unchanged from the `results.json` it wrote, and its commit is the one the pull request that added the ablation names as the commit it ran at.
It predates the prose hashes, so the page marks its prose not recorded.

**A bare sweep measures one Rule.**
With neither `EVAL_RULES` nor `EVAL_CASES` set, a sweep reads the records and measures the Rule whose newest sweep on `EVAL_MODEL` is oldest, counting only a sweep that judged a run of it.
A Rule never swept on that model comes before any that has been, in the order of the case catalog.
`EVAL_CASES` alone still sweeps the Rules those cases belong to.
A refusal for size names the Rules the sweep planned, since the sweep may have chosen them itself.

**The defaults are 5 repeats under a cap of 40.**
At 5 repeats, a case whose arms split 5 to 0 reads a p of 0.008, so one case can stand on its own.
40 runs is the largest Rule's plan at 5 repeats: the four cases of `comment-discipline` in both arms.
`tests/eval-settings.test.ts` fails when any Rule's plan at the default repeats exceeds the default cap.
The table carries each case's own p beside the pooled one.

## Alternatives

Raising the cap to hold every Rule's cases at once.
That is 80 runs today, and the cap would have to rise with every case added.
It would then bound nothing a person had not already chosen, and a bare sweep on a costly model would run the whole catalog.

A fixed Rule as the default.
A bare sweep would measure the same Rule every time.

Committing `reports/` whole.
The event streams are most of its size and are read only while a run is under suspicion.

## Consequences

A sweep leaves an untracked record in the checkout.
A measurement lands by committing that record with the page `bun run docs` rewrites, and a trial sweep's record is deleted instead.

Bare sweeps on one model take the Rules in turn, one Rule per sweep.

The e2e sweep test points `EVAL_SWEEP_DIR` into its scratch directory, so the suite adds nothing to the history.

The flake workflow checks out one commit, so there the history test reads only that commit.
