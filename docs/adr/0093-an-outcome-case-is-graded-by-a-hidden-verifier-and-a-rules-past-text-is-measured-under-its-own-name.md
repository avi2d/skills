# 93. An outcome case is graded by a hidden verifier, and a Rule's past text is measured under its own name

Date: 2026-10-10

## Status

Accepted.
Records the captain's answer of 2026-10-09 to the agent-written tests investigation, which took its recommended option to measure outcome before going further.

## Context

Every judge before this one reads how a run worked: whether a check ran after the last write, or whether a reproduction came before the fix.
Such a judge measures compliance with a Rule, not whether the work is right.
Kun Chen's DeepSWE write-up grades each task against behavioural tests the agent never sees, and finds that tests an agent writes for itself on a single task do not raise the pass rate while they cost time and tokens.
0091 replaced `prove-it-works`' "the failing test first and the fix on top" with a reproduction through the real entry point, and nothing measured whether either line changes the outcome.

A sweep has two arms, the Rule injected and the Rule withheld, and a third arm would reshape the plan, the tally, the comparison and the sweep page.

## Decision

A case can carry a hidden verifier: behavioural tests written from the task statement, a command that runs them, and a hand fix they pass.
The tests reach the sandbox only after the run's changes are read, and the run passes only when the command exits 0.
Whether the run wrote a test, and how many turns it took, are recorded with the run and never judged.

A case can deliver a Rule as it read at a past commit, read with `git show`, and is then filed under a name of its own.
That name gets its own two-arm comparison against the Rule withheld, so the plan, the tally and the sweep page stay as they were.
`prove-it-works-test-first` is `prove-it-works` at `ca24440`, the commit before 0091.

## Consequences

Each comparison of a past text against the current one needs two sweeps, each with its own withheld arm, so the no-rule arm is run twice and can be pooled.
A Rule moved since the commit is not found, because the past text is looked up at the Rule's current path.
A verifier that cannot fail is caught before it is trusted, because a test runs every verifier on its unfixed seed and on its hand fix.
