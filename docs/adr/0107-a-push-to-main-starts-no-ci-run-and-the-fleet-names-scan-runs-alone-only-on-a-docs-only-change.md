# 107. A push to main starts no ci run, and the fleet-names scan runs alone only on a docs-only change

Date: 2026-11-08

## Status

Accepted.
Amends 0096: the fleet-names scan step runs only on a docs-only change.
Amends 0070 and through it 0009 and 0037: `ci.yml` no longer runs on a push to main.

## Context

`ci.yml` ran the full suite on every push to main, after the pull request that made the push had already run its own head.
It also ran `tests/e2e/fleet-names.test.ts` as a step of its own on every run, and `bun run test` runs that file again on every run that is not docs-only.
A merge can land on a main that moved since the pull request ran, so the merged tree the push creates goes unchecked at that point.
The release pull request dispatched run is the first run to check that merged tree.
That delay is accepted because the cost of a run on every push to main now outweighs the earlier reason to keep each push red where it landed.

## Decision

`ci.yml` triggers on `pull_request` and `workflow_dispatch`, and not on `push`.
The release pull request keeps its full run, because `checks-release-pr` dispatches `ci.yml` on its branch.

The fleet-names step runs only when the change is docs-only, where `bun run test` is skipped.

## Consequences

A merge to main starts no suite run.
A code change runs the fleet-names scan once, inside `bun run test`.
