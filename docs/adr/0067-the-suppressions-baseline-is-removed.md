# 67. The suppressions baseline is removed

Date: 2026-09-26

## Status

Accepted. Supersedes the baseline mechanism in 0050, and the baseline part of
0055 and 0056.

## Context

The committed `oxlint-suppressions.json` files in checks, skills and dotfiles
are empty objects. An empty baseline waives no lint findings, and
`checks-suppressions-ratchet` treats a missing baseline as empty. Keeping the
file therefore changes no lint verdict. oxlint recreates `{}` when
`--suppress-all` or `--prune-suppressions` runs, making the baseline itself an
unnecessary committed artifact.

## Decision

Do not commit `oxlint-suppressions.json`. The assertion-baseline test accepts
only an absent or empty baseline in the working tree, and the effect-scope fixture no
longer copies the file. Fix lint findings rather than generating a suppression
baseline.

## Consequences

Removing the empty baseline changes no lint verdict. The ratchet continues to
compare an absent baseline as empty; any non-empty committed baseline remains
rejected by the test.
