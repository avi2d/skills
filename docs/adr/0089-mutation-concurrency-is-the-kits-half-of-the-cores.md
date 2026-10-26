# 89. Mutation concurrency is the kit's half of the cores

Date: 2026-10-08

## Status

Accepted.
Supersedes the decision of 0047 that `concurrency` is 10. The rest of 0047 stands.

## Context

0047 set `concurrency` to 10, measured on an M1 Pro with 8 performance cores and 2 efficiency cores.
`stryker.conf.mjs` later replaced that fixed count with `availableParallelism()`, because a fixed count oversubscribes a smaller CI runner and the extra Timeouts count as killed.
A sweep at every core leaves none for anything else the machine runs at the same time.
`@avi2dg/checks` 0.35.0 caps it in `stryker.preset.js`: `concurrency` is half of `availableParallelism()`, rounded down and at least 1.

## Decision

Mutation concurrency is the preset's, and `stryker.conf.mjs` sets none of its own.

## Consequences

- A sweep runs half as many test processes as the machine has cores: 5 on the M1 Pro 0047 measured on.
- A sweep takes longer than the 19m41s 0047 measured at 10, and the baseline's timings stay as they were measured, at concurrency 10.
- A smaller runner gets no more processes than it has cores, so it is not oversubscribed into Timeouts.
- A change to the cap is a change to the kit, and reaches this repository with the next `@avi2dg/checks` bump.
