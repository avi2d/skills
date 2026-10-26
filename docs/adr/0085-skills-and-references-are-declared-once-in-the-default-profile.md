# 85. Skills and References are declared once, in the default Profile

Date: 2026-10-07

## Status

Accepted. Amends 0073: only `profiles.default` names Skills and References, and every other Profile names its models, its Rules and optionally its tools.
Amended by 0088: a Profile outside the default names only additions in `add` and removals in `drop`.

## Context

0073 had each Profile name its complete Rules, Skills and References, and generation rejected Skill or Reference lists that differed between Profiles, because the shared Hub offers one set to all three harnesses.
Every Profile in `selection.toml` therefore repeated the same two lists, and only the Rules told one Profile from another.

## Decision

`profiles.default` names the Skills and References, and every Profile shares them.
Any other Profile names `models`, `rules` and optionally `tools`.
A `skills` or `references` field on a Profile other than the default is refused, with a message saying that every Profile shares the default's.
What each harness receives is unchanged: the Hub still offers one set of Skills and References, and a Profile still varies only its Rules and its tools.

## Consequences

A Profile's table shows only what sets it apart from the default.
A Profile cannot be written to vary Skills or References by model, which the shared Hub could not deliver anyway.
