# 55. src/ outside the bundles is held to Effect by its checks

Date: 2026-09-24

## Status

Accepted. Supersedes the part of 0050 that let the baseline count the two
assertion rules and nothing else. Amended by 0059, which corrects its claim that
`extends` replaces the language service's `plugins` block. Superseded by 0067
on the baseline. Narrowed by 0069, after which the effect-scope test no longer
sees each rule fail. Superseded by 0092 on its scope, which holds every source
file outside the tests to Effect.

## Context

`AGENTS.md` said everything in `src/` that is not bundled returns `Effect`, and
no program held it. `src/generate.ts` wrote its generated root through
`existsSync`, `readdirSync` and `rmSync` inside an effect whose type promised
`FileFailure`, so a file standing where the root belongs escaped as an untyped
defect. Nothing in the lint or the typecheck could see it.

The sentence was also wider than meant: a pure helper that returns a plain
value is right as it is. What has to be Effect is a function that does IO or
can fail.

## Decision

**Every effectful or fallible function in `src/` returns `Effect`, except in
the modules a Dispatcher bundles and the pi extensions under `harness/`.** Those
load without `node_modules` and cannot import `effect`. Tests stay plain
`bun:test` and run an effect through the helpers in `tests/lib/effect.ts`.

**File and process access goes through Effect's platform services.**
`FileSystem` and `ChildProcessSpawner` come from one layer in `src/platform.ts`,
built from `@effect/platform-bun`, and every entry point runs under it with
`BunRuntime.runMain`. `@effect/platform-node-shared` is held to `effect`'s own
release through `overrides`, because its range resolves a release that asks for
a newer `effect`.

**Two overrides hold the scope, and both leave out the bundled files.**

- `.oxlintrc.json`: the kit's `effect-channel/no-throw` and
  `effect-channel/no-try-catch`, `node/no-sync`, `oxc/no-async-await`,
  `promise/avoid-new`, `unicorn/no-process-exit`, and `no-restricted-properties`
  on `Bun.file`, `Bun.write`, `Bun.spawn`, `Bun.spawnSync` and `Bun.$`.
- `tsconfig.json`: the Effect language service's `nodeBuiltinImport`,
  `asyncFunction`, `newPromise` and `extendsNativeError` at `error`.

**The baseline counts these rules as well as the assertion rules.** A site the
lint rules find goes into `oxlint-suppressions.json` through `oxlint
--suppress-all`, as 0050 has it for the assertion rules, and its count can only
fall. It counts no site today: `src/bodies.ts`'s `fences`, the last, fails a
malformed fence as a `MalformedBody` instead of throwing.
`tests/e2e/assertion-baseline.test.ts` takes the scope's rules from the
override, so it still refuses a baseline naming any other rule.

## Consequences

The bundled-file list lives in three places: `src/bundle.ts`, the lint
override's `excludeFiles` and the language-service override's `exclude`.
`tests/bundle.test.ts` fails when either override disagrees with what the
Dispatchers ship. Moving the Dispatcher modules under a directory of their own
would make one glob do it.

effect-tsgo merges the kit's language-service severities with the `plugins`
block `tsconfig.json` declares for the override, so `tsconfig.json` carries the
override alone. `tests/e2e/effect-scope.test.ts` fails when a diagnostic the
Effect Rule leans on stops failing a probe at the kit's severity.

`unicorn/no-process-exit` skips a file that opens with a shebang. The entry
points carry none, since none is executable and `package.json` runs each
through `bun run`. A shebang put back disarms the rule for that file.

Enabling the `node`, `promise` and `unicorn` plugins in the override brings
their correctness and suspicious rules under the kit's categories for the
scope, as it does for every enabled plugin.

FileSystem has no `lstat`, so `entryAt` in `src/files.ts` tells a link from what
it points at by whether `readlink` succeeds, and `filesUnder` walks the tree
itself rather than through a recursive `readdir`, which Bun follows into a
symlinked directory.

`tests/e2e/effect-scope.test.ts` lints and typechecks a copy holding a probe in
a scoped file and at the end of every bundled one, so each rule is seen failing
where it should and silent where it should not.
