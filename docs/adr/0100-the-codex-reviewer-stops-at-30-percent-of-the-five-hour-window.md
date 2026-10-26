# 100. The Codex reviewer stops at 30 percent of the five-hour window

Date: 2026-10-19

## Status

Accepted. Supersedes 0095 and amends 0083: the Sol floor reads the Codex window with id five_hour and its minimum is 30, so Sol stops at 30 percent of the five-hour window. Amended by 0101: the account `second` is now the $100 Max plan and its 30 percent floor is gone.

## Context

0095 let Sol run until Codex was empty by reading the all-models effective percentage with a minimum of 0, and reviews drained the Codex five-hour window to 0.
The captain asked for a usage floor at 30 percent of the 5h quota on the Codex account and on the Claude second account, and the Pro floor already covers its 5h ask at 30.

## Decision

The Sol entry reads the percentRemaining of the Codex window with id five_hour and its minimum is 30.
The floor reads only a Codex provider quota-axi does not mark stale, because a stale reading is a cached snapshot and not the window's current headroom.
The floor still skips Sol when quota-axi fails, marks the Codex reading stale, or prints no five-hour reading.
The Pro entry is unchanged at 30, and the Max entry stays floorless.

## Consequences

A Codex five-hour reading below 30 falls through to Opus on the second account, and a reading of 30 or more still runs on Sol.
