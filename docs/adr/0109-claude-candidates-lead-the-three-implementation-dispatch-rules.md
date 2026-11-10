---
governs: [src/generate/crew-dispatch-config.ts, harness/firstmate/crew-dispatch.json, tests/unit/crew-dispatch.test.ts, tests/unit/machine-files.test.ts]
---
# 109. Claude candidates lead the three implementation dispatch rules

Date: 2026-11-09

## Status

Accepted. Amends 0108: in the mechanical, ordinary size and above 150 changed lines rules, the Claude candidates come first, then Muse, then Terra where the rule lists it.
Amended by 0110: the ambiguous, investigation and unknown-cause rules list Fable 5.2 ahead of Opus 5.5.

## Context

The OpenCode Go monthly window is burning at 2.4 times an even pace: 9% used at 4% of the month, projected to run out on 20 November against an 8 December reset.
Both Claude accounts have room.

## Decision

In the three implementation rules, the Claude candidates keep their order and come first: Haiku 5.5 and Opus 5.5 on the account main and then the account second, as each rule lists them.
Muse follows them, and GPT-6.1 Terra at high follows Muse where the rule lists Terra.
The investigation, design and unknown-cause rules, the floors, efforts and accounts stay as they are.

## Consequences

The dispatch takes a Claude candidate of a rule whenever one is usable, and reaches Muse only once the Claude candidates of that rule are not usable.
The supervision branch still pins Muse, which is no longer the first candidate of its small rule.
Moving that pin to Haiku is a separate decision.
