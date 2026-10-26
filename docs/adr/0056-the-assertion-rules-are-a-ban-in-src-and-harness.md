# 56. The assertion rules are a ban in src/ and harness/

Date: 2026-09-24

## Status

Accepted. Supersedes the part of 0050 that held
`typescript/no-unsafe-type-assertion` and `typescript/no-non-null-assertion` at
a count. Superseded by 0058 on the scope: both rules hold for every file, and by 0067
on the baseline.

## Context

0050 turned both rules on for `src/` and `harness/` over a baseline of the 56
sites there, 41 unsafe type assertions and 15 non-null assertions across 14
files, and let the count only fall. Accepting a new site was running `oxlint
--suppress-all` and committing the higher number, which only a reviewer could
catch.

Every one of the 56 has since been narrowed rather than asserted: a type guard
such as `isRecord` where a parsed value was cast, and a checked lookup where an
index was taken on trust. `oxlint --prune-suppressions` dropped both rules from
the baseline.

## Decision

**The baseline counts no site of either assertion rule.**
`tests/e2e/assertion-baseline.test.ts` fails the suite on any entry for them in
`oxlint-suppressions.json`, so `--suppress-all` over a new site produces a
count the suite refuses. The repair is to narrow the value.

The rest of 0050 stands: both rules are `error` for the two trees, every run is
type-aware, no site carries a directive, and the baseline names no rule outside
the assertion rules and the Effect scope's (0055).

## Alternatives

Leaving the two rules to `checks-suppressions-ratchet` alone, as 0050 does. It
refuses a count that rose or appeared against the merge base, so a count once
raised on main is the base the next branch compares with. A count pinned at
zero holds without a base to read.

## Consequences

A raised count of the Effect scope's rules, whose baseline still counts
sites, is refused by `checks-suppressions-ratchet` alone.

Turning the rules on for `tests/` is a glob added to the override and a new set
of sites to narrow, not a baseline to regenerate, while the suite pins the
count at zero.
