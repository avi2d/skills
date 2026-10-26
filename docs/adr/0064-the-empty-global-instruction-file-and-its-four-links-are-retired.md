# 64. The empty global instruction file and its four links are retired

Date: 2026-09-25

## Status

Accepted. Amends 0026: `global/AGENTS.md` and its four links are retired.
Amends 0004: `src/link.ts` no longer installs a global instruction file, and
the suite no longer walks `global/` for files the map must reach.

## Context

`global/AGENTS.md` is now one sentence saying the instructions it used to hold
fire as Rules through Dispatchers. The links to it moved from dotfiles into
this repository's `LINKS`, so the reason to keep the file and avoid dangling
links no longer holds.

## Decision

Delete `global/AGENTS.md` and move its four `$HOME` paths from `LINKS` to
`RETIRED` in `src/link.ts`. The next `bun run link` removes those links when
they still point into this repository; paths owned by something else remain
untouched.

## Consequences

- The repository no longer carries an empty global instruction file.
- A local skills copy removes the four links the next time `bun run link` runs.
