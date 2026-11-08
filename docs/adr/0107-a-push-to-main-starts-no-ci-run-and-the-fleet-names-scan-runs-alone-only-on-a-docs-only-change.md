# 107. A push to main starts no ci run, and the fleet-names scan runs alone only on a docs-only change

Date: 2026-11-08

## Status

Accepted.
Amends 0096: the fleet-names scan step runs only on a docs-only change.

## Context

`ci.yml` ran the full suite on every push to main, after the pull request that made the push had already run it.
It also ran `tests/e2e/fleet-names.test.ts` as a step of its own on every run, and `bun run test` runs that file again on every run that is not docs-only.

## Decision

`ci.yml` triggers on `pull_request` and `workflow_dispatch`, and not on `push`.
The release pull request keeps its full run, because `checks-release-pr` dispatches `ci.yml` on its branch.

The fleet-names step runs only when the change is docs-only, where `bun run test` is skipped.

## Consequences

A merge to main starts no suite run.
A code change runs the fleet-names scan once, inside `bun run test`.
