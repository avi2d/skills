# 75. The generated root is read through Config where the program touches the tree

Date: 2026-09-27

## Status

Accepted.
Amends 0047: `src/bundle.ts` reads `SKILLS_GENERATED_ROOT` through Effect's `Config` inside each Effect that writes or reads the emitted tree, and no longer resolves it into a `GENERATED_ROOT` constant when the module loads.

## Context

`@avi2dg/checks` 0.27.0 ships the Effect language service's `processEnv` diagnostic at error for the paths a repository's Effect override covers.
It refuses a read of `process.env` outside an Effect generator.
`src/bundle.ts` read `SKILLS_GENERATED_ROOT` from `process.env` as it loaded, into the `GENERATED_ROOT` constant that 0047 resolves every emitted path through, and the diagnostic refused that read.
The language service keeps no baseline, so the read had to move or the diagnostic had to stay off.

## What was considered and rejected

- **Leaving `processEnv` off in `tsconfig.json`.** It exempts this repository from a rule of the kit for good, and a read of the environment as a module loads is the case the diagnostic exists for.
- **Reading `Config` as the module loads, through `Effect.runSync`.** `node/no-sync` refuses the call, and allowing sync calls at the top level would let any module in the Effect paths do sync I/O as it loads.
- **Recording the finding in a baseline.** The language service keeps none, and 0067 removed the oxlint baseline.

## Decision

The preload sets `SKILLS_GENERATED_ROOT` to `generated-<pid>` before any source module loads, and each test process generates into a root of its own, as 0047 decided.
`readGeneratedRoot` in `src/bundle.ts` reads the variable through `Config` and passes it through `generatedRoot`, so anything but `generated-<pid>` resolves to `generated`.
Each Effect that writes or reads the emitted tree yields `readGeneratedRoot`: `bundle`, `emitted`, `drift`, `write` and the `main` of `src/generate.ts`, `hubs` in `src/hub.ts`, and `link` and the `main` of `src/link.ts`.
A `Bundle` names its directory relative to the generated root in `dir`.
`LINKS` in `src/link.ts` is the map under `generated`, and `link` installs `linksUnder` the root it reads.
A test reaches the root through `GENERATED_ROOT` in `tests/lib/generated-root.ts`, which runs the same `readGeneratedRoot`, and takes `HUB` and `LINKS` under that root from the same file.

## Consequences

- `src/` reads no environment variable outside `Config` in the paths the Effect override covers.
- Config's environment provider reads an empty variable as unset, and `generatedRoot` sends both to `generated`.
- A failure to read the variable is a `FileFailure` naming `$SKILLS_GENERATED_ROOT`, the way `link` names `$HOME` when it has none.
- A mutant in `generatedRoot` moves the tests' root with the source's, since both run `readGeneratedRoot`, so the sandbox copy 0047 set up is still what keeps a sweep off the checkout's `generated/`.
