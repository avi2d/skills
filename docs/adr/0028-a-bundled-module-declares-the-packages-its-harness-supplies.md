# 28. A bundled module declares the packages its harness supplies

Date: 2026-09-15

## Status

Accepted. Extends 0013, whose classifier reads the other half of the same scan.

## Context

`AGENTS.md` has said since the Dispatcher existed that the core "uses no
runtime that only one of them has: no `Bun.*`, and no dependencies". Half of
that was a program: the suite reads the emitted bytes and refuses `Bun.`. The
other half was a sentence, and nothing read it.

0013 scoped `runtimeImports()` to relative specifiers on purpose - the property
it was built for is that a symlinked file cannot reach a sibling, so every
relative import has to land inside the directory. Bare specifiers were ignored,
and that left the dependency half of the constraint with no check at all.

Bringing Effect into this repository is what made the gap worth closing.
`import { Effect } from "effect"` in `dispatch.ts` typechecks, generates, and
passes the whole suite - including the test that loads the emitted directory
out of a temp home and watches a Rule fire. It passes because `bun test`
resolves a bare specifier from the repository's own `node_modules`, which the
directory a harness links does not have. Copied to a directory with no
`node_modules` above it and imported, the same bundle fails with `ENOENT while
resolving package 'effect'`. So the suite could not tell the difference between
a Dispatcher that loads and one that is broken for every user.

## Decision

`bundle()` refuses a runtime import of a package the bundle does not declare.
The scan 0013 already runs is split at its filter: `runtimeImports()` keeps the
contract that ADR wrote for it, and `packageImports()` returns the bare
specifiers, `node:` builtins excluded because every harness runtime has them.
Type-only imports are erased by the same rule as before, so reaching for a type
from a package costs nothing and ships nothing.

A `Bundle` may declare `externals`, the packages its harness resolves on its
Dispatcher's behalf. `PI_BUNDLE` declares one, `@earendil-works/pi-coding-agent`,
because pi loads the extension and its own package is there. The Claude and
Codex bundles declare none, which is now a fact a program holds rather than a
thing that happens to be true.

The relative check reports first when a module breaks both, because a bundle
that cannot resolve its own siblings is the failure 0013 named and the more
basic of the two.

## What was considered and rejected

- **Widening `runtimeImports()` to return bare specifiers too.** 0013 wrote
  that function's contract down and the suite pins every case in it. A second
  filter over the same scan costs one line and leaves that contract alone.
- **An allowlist of packages in one place.** Which packages resolve is a fact
  about a harness, not about the repository, and the bundle is where a harness's
  facts already live.
- **Resolving each specifier from the emitted directory at generation.** It
  would prove the real property rather than approximating it, and it would pass
  on the generating machine for exactly the reason the hole existed.
- **Leaving it to review.** The sentence in `AGENTS.md` had been there the whole
  time, and the import still passed every check the repository had.

## Consequences

- `bun run generate` and the suite both refuse a package entering a bundled
  module, naming the module, the specifier, and the three ways out.
- Effect can be adopted across the rest of `src/` without the adopter having to
  remember which seven files are off limits. The build says so.
- A harness that needs a package supplies it and says so in one line, next to
  the files it already lists.
