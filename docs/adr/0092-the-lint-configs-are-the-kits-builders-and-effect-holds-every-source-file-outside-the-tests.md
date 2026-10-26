# 92. The lint configs are the kit's builders, and Effect holds every source file outside the tests

Date: 2026-10-09

## Status

Accepted.
Supersedes the scope of 0055, which held only `src/` to Effect.
The rest of 0055 stands.

## Context

`.oxlintrc.json` extended the kit's `oxlintrc.json` and then restated rules by hand: the two assertion rules, the size budgets for production and test files, and the Effect override with its plugin list.
A rule the kit changed did not reach this repository until someone copied it again.
`knip.config.ts` spread the kit's `knip-base.json`, and `.dependency-cruiser.cjs` pulled the kit's `not-to-dev-dep` rule apart to widen its `from` by one path.
`scripts/lint-deps.sh` named every tracked TypeScript file to depcruise, and `bun run lint` ran it as `lint:deps`.
The Effect language service override in `tsconfig.json` was a second hand-written copy of the oxlint override's paths.

`@avi2dg/checks` 0.37.0 ships a `defineConfig` builder for each of the three tools.
The oxlint one takes a required `effect` key and ordinary oxlint keys, and adds the kit's base rules, size budgets and Effect override itself.
The knip one takes a required `entry`.
The dependency-cruiser one takes `devOnly` and `orphans` beside dependency-cruiser's own keys.
`checks-effect-scope` writes the language service override from `oxlint.config.ts`, and `checks-lint` runs `checks-imports`, which cruises every tracked TypeScript file in every repository.

## Decision

**`oxlint.config.ts`, `knip.config.ts` and `dependency-cruiser.config.ts` call the kit's `defineConfig`, and state only what differs from its defaults.**
That is the Effect exemptions, the ignored paths and the `Bun` global ban in `src/` for oxlint, the entry points for knip, and `evals/` and `tests/` as dev-only paths for dependency-cruiser.
A comment beside each exempted glob says why that path stays outside Effect.

**The Effect rules hold every source file outside the tests, less `evals/`, `harness/` and the modules a Dispatcher bundles.**
`evals/` stays out because vitest runs each eval as an async test, and `harness/` because pi loads each extension as a plain async module.
The three config files at the root come into the scope with everything else outside those paths.

**`bun run build` runs `checks-effect-scope`, which writes the `tsconfig.json` override from `oxlint.config.ts`.**
`checks-lint` runs it again with `--check`, and fails when the two differ.

**`checks-lint` runs dependency-cruiser through `checks-imports`.**
`scripts/lint-deps.sh`, `.dependency-cruiser.cjs` and the `lint:deps` script are deleted, and `bun run lint` is `oxlint`, then `checks-lint`.

## Consequences

A rule or budget the kit changes reaches this repository with the next `@avi2dg/checks` bump, and no file here restates one.

The bundled-file list lives in two places: `src/generate/bundle.ts` and the `effect` key of `oxlint.config.ts`.
`tests/unit/bundle.test.ts` fails when the oxlint override's `src/` exclusions disagree with what the Dispatchers ship, and `tests/e2e/effect-scope.test.ts` fails when the `tsconfig.json` one does.

A new top-level directory of TypeScript is held to Effect from its first file, unless `oxlint.config.ts` exempts it with a reason.
