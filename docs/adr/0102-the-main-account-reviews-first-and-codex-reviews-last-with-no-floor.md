# 102. The main account reviews first and Codex reviews last with no floor

Date: 2026-11-03

## Status

Accepted. Amends 0083, 0100 and 0101: the reviewer chain runs Opus on main first, Opus on second second behind its login check, and Sol on Codex last with no floor.

## Context

The captain asked for review on the main Claude account first, ahead of Codex and the second account.
The generated config listed Codex first, the second account second, and main third, so an empty login on the second account stopped the chain before main.
The fork always tries the last entry whatever its floor reads, and it moves to the next entry only after a usage limit error, as 0083 records.
A floor on the last entry therefore never skips anything.

## Decision

Each machine's reviewer chain holds Opus on main first with no floor, Opus on second second with the login check floor 0101 records at minimum 0, and Sol on Codex last with no floor.
No reviewer floor runs quota-axi or jq.

## Consequences

The review step always tries main first, then the second entry while its folder holds a Claude Code login, then Sol.
The daemon no longer needs quota-axi or jq for the review step.
