# 88. A Profile declares only what differs from the default

Date: 2026-10-07

## Status

Accepted. Amends 0073 and 0085: a Profile outside the default names additions in `add` and removals in `drop` against `profiles.default`, and the two GPT Profiles merge into `gpt-6`.

## Context

0085 left each Profile outside the default naming its complete Rules list, so telling one Profile from another meant comparing whole lists line by line.
The two GPT Profiles named identical Rules for different model pairs, which doubled the comparison for no difference.

## Decision

`profiles.default` keeps the full Rules list.
Any other Profile holds a `rules` table with only `add` and `drop` against it, resolved in base order with additions merged in name order.
Generation refuses an addition the default already lists, a removal it does not list, a Rule named in both, a bare Rules list outside the default, and a name in neither the library nor the default.
`gpt-6-luna` and `gpt-6-1-sol` merge into `gpt-6`, which names all four models.
What each model receives is unchanged.

## Consequences

A Profile's table shows only what sets it apart from the default at a glance.
A Rule added to the default reaches every Profile that does not drop it.
