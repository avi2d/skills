---
governs: [src/generate/no-mistakes-config.ts, src/generate/crew-dispatch-config.ts, src/generate/crew-dispatch.ts, harness/firstmate/crew-dispatch.json, tests/unit/crew-dispatch.test.ts, tests/unit/machine-files.test.ts]
---
# 108. Astra reviews first with no floor, and Codex models join four dispatch rules

Date: 2026-11-08

## Status

Superseded by 0111, which keeps one dispatch file for the one Mac firstmate home.
Amends 0102: the reviewer chain runs Astra on Codex first, then Opus on the account main, then Opus on the account second, and no entry carries a floor.
What follows is left as it was written.

## Context

The Codex sign-in now reaches a plan with only a weekly window.
The Sol floor read the five-hour window, which that plan does not report, so the review step skipped the Codex reviewer every time.
A weekly floor would keep a reviewer out of the chain that the plan is sized to run.

## Decision

Each machine's reviewer chain holds GPT-6 Astra at high first, then Opus 5.5 on the account main, then Opus 5.5 on the account second.
Sol leaves the chain, and no entry carries a floor.

Crew dispatch lists GPT-6 Astra at high after Opus 5.5 in the bounded investigation rule and the unknown cause rule.
It lists GPT-6.1 Terra at high after Muse in the two clearly specified implementation rules.
Both spend the `codex` provider and carry no floor, and the other rules keep their candidates.

## Consequences

The review step always tries Astra first and reaches main only after a Codex usage limit.
The review step no longer runs a quota reading or jq.
Crew dispatch takes Astra when Opus is not usable, and Terra when Muse is not usable.
