---
governs: [src/generate/no-mistakes-config.ts, tests/unit/no-mistakes-config.test.ts]
---
# 114. Sol returns to the reviewer chain with no floor

Date: 2026-11-11

## Status

Accepted.
Amends 0112: the reviewer chain gains GPT-6.1 Sol on the Codex sign-in between the account main and the account second, and no entry carries a floor.

## Context

Commit add5e20 of 2026-11-08 removed Sol from the reviewer chain, with the five-hour Codex floor it carried, to put Astra first.
Astra left the chain on 2026-11-09, because the OpenAI weekly quota is shared and Astra spent too much.
Codex now reports only a weekly window for its plan, with no five-hour window, so a floor on the five-hour window would skip Sol on every run.
The OpenAI weekly window stands at 84% and resets on 15 November.

## Decision

The reviewer chain runs Opus 5.5 on the account main first, GPT-6.1 Sol on the Codex sign-in second, and Opus 5.5 on the account second last.
Sol has no floor, as no entry in the chain has one.
Astra holds no slot in the chain.

## Consequences

The review step tries Sol after main reaches a usage limit, and before second.
A floor that would skip Sol on the weekly window is a new decision and needs its own record.
The worker dispatch rules are not generated here, as 0112 records, so the change that puts Astra back in them is made in the dotfiles copy.
