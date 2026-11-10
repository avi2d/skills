---
governs: [src/generate/crew-dispatch-config.ts, src/generate/machine-files.ts, src/generate/link.ts, src/generate/firstmate-pins.ts, harness/firstmate/crew-dispatch.json, tests/unit/crew-dispatch.test.ts, tests/unit/machine-files.test.ts]
---
# 111. One crew dispatch file holds the Mac rules

Date: 2026-11-10

## Status

Accepted.
Supersedes 0108, 0109 and 0110, which spread the dispatch rules across machines and named reviewers the chain no longer runs.
What follows states the one file dispatch that the move to remote workers leaves behind.

## Context

Every worker is now dispatched from the one Mac firstmate home.
Both Windows second mates are retired.
The Windows rules had no reader left.
The Windows execution home holds no `config/crew-dispatch.json`.
It takes its profile from the parent through `dispatch-override`.
A remote inherit push strips a symlinked `crew-dispatch.json` from a remote home rather than sending it.
Two dispatch files survived that move with nothing left to distinguish them.
The two supervision branch pins are the main home own pins and stay outside this decision.

## Decision

The generator writes only the Mac rules.
It writes them as `harness/firstmate/crew-dispatch.json`.
`harness/firstmate/crew-dispatch.mac.json` is gone.
The Windows rules are gone with it.
`secondmate-harness` is no longer generated.
`bun run link` links `crew-dispatch.json` and the two supervision pins on macOS only.
`bun run link` retires a `Projects/firstmate/config/secondmate-harness` link it once made.
The two supervision branch pins are unchanged.
The candidate order of each rule and the default stay exactly as the source holds them today.
The trivial rule lists Haiku 5.5 at low on main, Haiku 5.5 at low on second, Opus 5.5 at low on main, Opus 5.5 at low on second, and Muse at low.
The small rule lists Haiku 5.5 at high on main, Haiku 5.5 at high on second, Opus 5.5 at medium on main, Opus 5.5 at medium on second, Muse at high, and Terra at high.
The large rule lists Opus 5.5 at medium on main, Opus 5.5 at medium on second, Muse at high, and Terra at high.
The ambiguous rule lists Fable 5.2 at high on main, Fable 5.2 at high on second, Opus 5.5 at high on main, and Opus 5.5 at high on second.
The investigation rule lists the same four candidates in the same order.
The unknown cause rule lists the same four candidates in the same order.
The Mac only rule lists Opus 5.5 at high on main and Opus 5.5 at high on second.
The default lists Muse at high, Opus 5.5 at medium on main, and Opus 5.5 at medium on second.
Haiku 5.5 and Muse carry a 15 percent floor over all models, and the other candidates carry no floor.
Terra spends the Codex provider and the rest spend Claude or the OpenCode Go provider.
Candidates run in preference order.
The reviewer chain runs Opus 5.5 at high on main first and Opus 5.5 at high on second last.
No chain entry carries a floor.
Each chain entry runs on the pi agent with its account config dir in the environment.

## Consequences

The dispatch reaches one file for every worker from the one Mac firstmate home.
Routine work still starts on a cheap workhorse and hard work still reaches Fable 5.2 before Opus 5.5.
The review step always tries main first and reaches second only past a usage limit.
