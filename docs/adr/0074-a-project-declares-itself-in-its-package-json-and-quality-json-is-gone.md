# 74. A project declares itself in its package.json, and quality.json is gone

Date: 2026-09-26

## Status

Accepted.
Amends 0060: a project declares Effect with an `effect` dependency and switches a catalogued Rule under `skills.rules`, both in its `package.json`.
Amends 0071: only a project's `skills.rules.off` stands a refusal down.
Amends 0070: `checks-vendor` links each library the `prepare` script names, `.github/workflows/ci.yml` is hand-written rather than generated from `gates.ci`, `tests/vendored-paths.test.ts` declares its skip through `skipReason` at the test rather than in `testSkips`, and the Bodies' fallback is `bun install` or `bun run prepare`.
Amends 0073: a repository switches a Rule under `skills.rules` in its `package.json`.
Amends 0069: there is no fragment for `checks-quality --check` to require, and the kit reads `tsconfig.json` itself.

## Context

The checks kit replaced its `quality.json` manifest with each tool's native config file.
Every setting moved to the file its tool reads, and the kit no longer reads the manifest at all.
The Dispatcher was the last reader here: it learned what a repository declares and how a project switches a Rule from that file.
Deleting the file with the Dispatcher still reading it would leave every session in a repository that adopted the kit with no declaration and no switch.

The kit names no successor for `agentRules` or `features`, because no active declaration used those fields.
The Dispatcher still needs both halves of what it read: the declaration that fires `effect-error-channel`, and the switch that stands a refusal down or wakes a Rule the Selection leaves off.
No Rule carries a `declares` trigger on `features`, so nothing can miss it.

## Decision

`src/project.ts` reads the `package.json` at the git root of the prompt's directory, and `quality.json` is deleted with nothing reading it.
An `effect` entry in any dependency section declares `effect`.
A `skills.rules` block switches catalogued Rules on or off, with the same shape the manifest's `agentRules` had.
The `features` declaration is gone, and `declares` names only `effect`.
The Effect scope the manifest declared now lives as overrides in `.oxlintrc.json` and `tsconfig.json`, the size budget as size rules in `.oxlintrc.json`, the production files as `.jscpd.json`, and the vendored library as `checks-vendor` arguments in the `prepare` script.

## Consequences

A repository with no `package.json` declares nothing, as one with no manifest did.
A `package.json` the Dispatcher cannot read declares nothing either, and the dispatch log says so once a session.
`tests/bundle.test.ts` holds the two Effect overrides to exactly the files a Dispatcher bundles.
