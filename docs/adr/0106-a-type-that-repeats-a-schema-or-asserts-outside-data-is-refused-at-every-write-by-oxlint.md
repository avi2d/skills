# 106. A type that repeats a schema or asserts outside data is refused at every write, by oxlint

Date: 2026-11-07

## Status

Accepted.
Amends 0062: a change's `before` also carries the file's absolute path, `onDisk`.

## Context

`typescript-best-practices` asks for one declaration of each shape and a parse at every boundary.
The checks kit enforces both at lint time: `data-shape/schema-twin` fails a type that repeats the fields of an Effect Schema, and the type-aware `typescript/no-unsafe-type-assertion` fails an assertion that narrows a value's type.
A session that writes either finds out when `lint` next runs, a push later.

Both rules need the project the file sits in.
The twin rule reads the schemas the file declares, and the assertion rule asks tsgolint for the types the file's imports give it.
The kit's comment and prose matchers ship inside each bundle, and these two cannot, because they run in oxlint and tsgolint from the project's own `node_modules`.

## Decision

A Rule's `forbid` takes `types`, and `typescript-best-practices` carries it.
The matcher is `src/dispatcher/types.ts`, which every bundle ships as `types.ts`.

A `.ts` or `.tsx` file is judged when a directory above it holds `node_modules/.bin/oxlint` and the kit's data-shape plugin.
The matcher writes the file as the write would leave it to a copy beside it, runs that project's oxlint on the copy with the two rules alone and `--type-aware`, and removes the copy.
A finding is refused when its span covers a line the write adds, so an assertion the file already held is let through.
The refusal names the file, the line and the rule, then gives oxlint's message and what to do instead.

oxlint runs for 5 s at most.
Judging one file measured 0.26 s to 0.46 s, inside the hook's 10 s budget.

## What was considered and rejected

Failing closed, as 0104's redaction does, would block every TypeScript write in a project whose tsgolint is missing or broken.
0104 fails closed because a secret printed once is leaked for good.
A twin or an assertion that gets through is still failed by the gate at merge, so an oxlint that fails or runs past its budget lets the write through and logs it `unjudged`, as an edit the matchers cannot place is.

Linting the copy from a temporary directory would resolve none of the file's imports, so the assertion rule would see `any` where the project sees a type.

Shipping the two rules inside the bundle would mean shipping oxlint and tsgolint, which are platform binaries.

## Consequences

A project without oxlint and the kit is not judged, and nothing is logged for it.

The copy sits beside the file while oxlint runs, so a watcher on the project can see it.

Each judged write costs one oxlint run, and a write to a file outside a project costs a walk up the directory tree.
What reaches a file around the write tools is still unseen until the gate runs.
