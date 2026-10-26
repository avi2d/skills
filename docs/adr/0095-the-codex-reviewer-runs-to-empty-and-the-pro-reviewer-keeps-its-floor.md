# 95. The Codex reviewer runs to empty, and the Pro reviewer keeps its floor

Date: 2026-10-10

## Status

Superseded by 0100, which stops Sol at 30 percent of the Codex five-hour window. Amends 0083. What follows is left as it was written.

## Context

0083 spends each $20 review account down to 30% of its allowance and no further.
The captain banks Codex credit and presses its reset himself, and asked for the Codex reviewers to run to 0% instead of stopping at 30, so a review with 5% of Codex left still runs on Sol and only an empty Codex falls through to Opus.

## Decision

The Sol entry keeps its floor command, which still skips Sol when `quota-axi` fails or prints no Codex reading, and its `minimum` is 0.
The Pro entry is unchanged at 30, and the Max entry stays floorless.

## Consequences

Reviews spend Codex to empty before reaching Opus, and the banked reset stays a manual step.
A Codex reading of 0 still selects Sol, and only a missing or failing reading skips it.
