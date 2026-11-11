---
governs: [src/generate/link.ts, src/generate/no-mistakes-config.ts, tests/unit/link.test.ts, tests/unit/no-mistakes-config.test.ts]
---
# 112. The firstmate dispatch rules and pins move to the dotfiles repository

Date: 2026-11-10

## Status

Accepted.
Supersedes 0111, which kept the firstmate dispatch rules and the two supervision pins in this repository.
Supersedes 0102, whose reviewer chain this record states as it now holds.
Amends 0020: the dispatch rules path and the two supervision pin paths leave the map without moving to `RETIRED`.
Amended by 0114: the reviewer chain gains GPT-6.1 Sol on the Codex sign-in between the account main and the account second.

## Context

The firstmate settings links for the dispatch rules and the supervision pins now point into the dotfiles repository.
Nothing reads the copies this repository generated, and firstmate is not a harness this repository serves.
A machine's own fleet settings stay out of this public repository.

## Decision

This repository holds no firstmate dispatch rules and no firstmate pins.
`harness/firstmate/` is gone, and so are the generation, drift check and tests that wrote and held its files.
`bun run generate` writes and checks only `generated/`.
`bun run link` links nothing into the firstmate home, and retires the link it once made there for `secondmate-harness`.
As an exception to 0020, the dispatch rules path and the two supervision pin paths do not move to `RETIRED`.
The only machine that linked them now points them into the dotfiles repository, so this repository has no link left to retire.
The link map is the same on every platform.
The no-mistakes reviewer chain runs Opus 5.5 at high on the account main first and Opus 5.5 at high on the account second last, each on the pi agent with its account config dir in the environment, and no entry carries a floor.

## Consequences

A machine linked from an earlier checkout lets go of each path the `RETIRED` list takes back.
A change to the dispatch rules or the pins is made in the dotfiles repository, which holds their history from here on.
The pi extensions that react to a firstmate session at run time stay, and their removal is a separate decision.
