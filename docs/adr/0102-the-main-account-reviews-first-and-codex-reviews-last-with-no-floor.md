# 102. The main account reviews first, Codex second, and the second account last with no floor

Date: 2026-11-03

## Status

Accepted. Amends 0083, 0100 and 0101: the reviewer chain runs Opus on main first, Sol on Codex second behind its five-hour floor, and Opus on second last with no floor.

## Context

The captain asked for review on the main Claude account first, then Codex, with the second account last.
The generated config had listed Codex first, the second account second, and main third, so an empty login on the second account stopped the chain before main.
The fork always tries the last entry whatever its floor reads, and it moves to the next entry only after a usage limit error, as 0083 records.
A floor on the last entry therefore never skips anything, so the second account carries none.

## Decision

Each machine's reviewer chain holds Opus on main first with no floor, Sol on Codex second with a five-hour floor at minimum 30, and Opus on second last with no floor.
Only the Codex floor runs quota-axi and jq.

## Consequences

The review step always tries main first, then Sol while its five-hour window holds 30% or more, then the second account, which the fork reaches after a usage limit error whatever the earlier entries read.
The review step needs quota-axi and jq for the Codex floor.
