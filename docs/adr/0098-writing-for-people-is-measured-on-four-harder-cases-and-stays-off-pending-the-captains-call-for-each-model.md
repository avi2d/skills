# 98. Writing for people is measured on four harder cases, and stays off pending the captain's call for each model

Date: 2026-10-12

## Status

Accepted.
Records the captain's choice to measure `writing-for-people` on harder cases before it is switched on, and what those cases found.
Amends 0097: the Rule is measured on twelve cases rather than eight, and the four new ones put the text inside a code change.
Amends 0063: the default cap is 120, the plan of `writing-for-people` at 5 repeats.
Amended by 0099: the Rule switches on for Muse Spark alone, kept facts counting as the help it gives Muse.

## Context

In the sweeps 0097 records no run failed in either arm, so they could not show whether the Rule helps.
Both arms are offered the writing References, and in a task that is only writing, both arms load `technical-writing` and `unslop` before they write.
With the Rule, Muse Spark left out a fact the task gave in 14 runs against 7 without it, Fisher p 0.13.

In small probes Muse skipped the References when the text came at the end of a code change, and Opus wrote sentences over 25 words in both arms.
An agent's plain `git commit` failed in the sandbox, because its repository named no author.

## Decision

Four cases join the eight, each judged by `plainProse` and `plainSentences` and each keeping a check on the facts the task gave:

- `en-commit` fixes the import key and commits, under a `CONTRIBUTING.md` that asks for a body saying what changed and why.
- `en-pr-fix` fixes the same key and writes the PR description.
- `en-readme-flag` adds a `--dry-run` flag and documents it in the README, which must keep its import and test commands.
- `en-news` writes a note on Ledger 1.3 for small business owners from engineering notes full of dashes and parentheses.

Each was seen failing on a real unguided run before the sweep.
The sandbox repository names an author, and a run's commit messages are kept beside the files it changed.

The sweeps of 2026-10-12 at `b133b41` ran all twelve cases, Muse Spark at 5 repeats and Opus 5.5 at 2.

| Model | Arm | Pass | Fail | Unjudged | Dropped a fact |
| --- | --- | --- | --- | --- | --- |
| Muse Spark | with the Rule | 51 | 1 | 8 | 3 |
| Muse Spark | without | 44 | 2 | 14 | 10 |
| Opus 5.5 | with the Rule | 20 | 4 | 0 | 0 |
| Opus 5.5 | without | 20 | 4 | 0 | 0 |

On Muse pass against fail gives Fisher p 0.60, and dropped facts p 0.04 over the 58 and 56 runs that finished.
Six Muse runs stopped at the provider's error or at the 15-minute timeout, two with the Rule and four without.
Three runs with the Rule reworded the seeded `ru-readme` overview, which that case reads as dropping it.

The `en-news` reader then took the paraphrases two guided notes used, and those two runs pass.
Judged again, Muse drops a fact in 1 run with the Rule against 10 without, p 0.004.
Read by hand, the one with the Rule and one without name the fact in words the reader misses, so the drops that are real number 0 against 9, p 0.001.
Without the Rule, Muse wrote a one-line commit in all four `en-commit` runs that finished, and left the earlier 10 MB limit out of four news notes.

So on Opus the twelve cases cannot tell the arms apart, and every fail in both arms is a sentence over 25 words.
On Muse the plain-prose checks cannot tell either, and the Rule keeps the facts the task gave, the reverse of the sign 0097 saw.
`selection.toml` leaves the Rule off, and the captain decides for each model whether the facts Muse keeps with the Rule count as the Rule helping.

## Consequences

A sweep of `writing-for-people` plans 120 Muse runs and costs half as much again as the eight cases did.
The sentence-length fails of Opus are as many with the Rule as without, so a case where they differ is still missing.
