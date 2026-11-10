---
governs: [src/generate/link.ts, src/generate/no-mistakes-config.ts, tests/unit/link.test.ts, tests/unit/no-mistakes-config.test.ts]
---
# 112. The firstmate dispatch rules and pins move to the dotfiles repository

Date: 2026-11-10

## Status

Accepted.
Supersedes 0111, which kept the firstmate dispatch rules and the two supervision pins in this repository.
Supersedes 0102, whose reviewer chain this record states as it now holds.

## Context

The firstmate settings links for the dispatch rules and the supervision pins now point into the dotfiles repository.
Nothing reads the copies this repository generated, and firstmate is not a harness this repository serves.
A machine's own fleet settings stay out of this public repository.

## Decision

This repository holds no firstmate dispatch rules and no firstmate pins.
`harness/firstmate/` is gone, and so are the generation, drift check and tests that wrote and held its files.
`bun run generate` writes and checks only `generated/`.
`bun run link` links nothing into the firstmate home, and retires the link it once made there for `secondmate-harness`.
The link map is the same on every platform.
The no-mistakes reviewer chain runs Opus 5.5 at high on the account main first and Opus 5.5 at high on the account second last, each on the pi agent with its account config dir in the environment, and no entry carries a floor.

## Consequences

A machine linked from an earlier checkout keeps no link into a file this repository no longer holds.
A change to the dispatch rules or the pins is made in the dotfiles repository, which holds their history from here on.
The pi extensions that react to a firstmate session at run time stay, and their removal is a separate decision.
