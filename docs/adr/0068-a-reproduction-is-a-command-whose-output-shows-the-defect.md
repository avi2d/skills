# 68. A reproduction is a command whose output shows the defect

Date: 2026-09-25

## Status

Accepted. Amends 0057: the `prove-it-works` judge counts a reproduction by
what the command printed, not by how it exited.

## Context

The `reproduce-first` case asks for a fix to `parseDuration("2m")`, which
returns 2000 where 120000 is right. Its judge passed a run only when a command
on `2m` failed before the first write to `src/duration.ts`, by exiting
non-zero or by printing a failing test.

The first sweep of `prove-it-works` on Muse Spark 1.3 at high scored both arms
0/5 on that case. Every injected run had reproduced the bug before fixing it,
with a `bun -e` on `2m` that printed 2000 and exited zero. No withheld run
had run anything on `2m` before its fix. The judge measured the exit status of
a script the agent wrote, which the Rule says nothing about.

## Decision

`reproducedBeforeFix` takes the defect as a pattern the case supplies, and a
reproduction is a command matching the case's runner, run on the reported
input before the first write to the source, whose output matches that pattern.
The exit status no longer counts either way. `reproduce-first` supplies
`\b2000\b`, the value `parseDuration("2m")` returns before the fix.

## Consequences

- A command that prints the wrong value and exits zero reproduces the bug.
- A command that fails for an unrelated reason, or a test run that counts a
  failure without printing the wrong value, does not.
- A new case judged by `reproducedBeforeFix` names its own defect, so the
  judge carries no guess about what a reproduction prints.
- The Muse record `2026-09-25T11-11-38Z` judged `reproduce-first` by the old
  rule. It stays as it is, and a new sweep of `prove-it-works` supersedes it.
