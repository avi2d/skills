# 70. Vendoring a library moves to the kit's checks-vendor

Date: 2026-09-26

## Status

Accepted. Supersedes 0027 and 0049 on how `repos/effect` is fetched, and the
part of 0060's trigger note that still names `repos/effect.toml`. Amends 0009
and 0037 on when the suite runs.
Amended by 0074: the `prepare` script's arguments name the library,
`ci.yml` is hand-written, the vendored-paths skip is declared at the test, and
the Bodies' fallback is `bun install` or `bun run prepare`.

## Context

The captain's standing word is that every repository keeps the full
`@avi2dg/checks` kit, current, run the one way: from npm by semver range,
package scripts calling its bins by bare name. `@avi2dg/checks` 0.19.0 adds
`checks-vendor`: one shared, version-pinned, read-only clone of each library a
repository declares under `sources.libraries` in `quality.json`, linked at
`repos/<name>` and run from `prepare`, falling back to `node_modules` whenever
it cannot vendor. For library clones the captain chose one shared read-only
clone per library version on the machine, fetched by the kit's own command
keyed off the installed version, with `node_modules` as the fallback - the same
shape `repos/effect.toml` and `src/vendor.ts` built by hand for this repository
alone.

## Decision

**`quality.json`'s `sources.libraries` replaces `repos/effect.toml`.** The
entry names the npm package, the git remote and a tag template keyed on the
installed version; `checks-vendor` resolves the tag, clones it once into a
shared cache, and links `repos/effect` to it. `src/vendor.ts`, `repos/effect.toml`
and `tests/e2e/vendor.test.ts` are deleted. `package.json`'s `prepare` runs
`checks-vendor` in place of the repository's own script.

**The Bodies' fallback is `bun install` or `bunx checks-vendor`, never a hand
clone.** `checks-vendor` expects `repos/effect` to be a symlink it manages; a
directory left there by a hand clone fails the next `checks-vendor` run rather
than being adopted, the same refusal a leftover tree from the old script would
have met. Where the link is still missing, or the repository does not declare Effect,
the fallback is the installed package under `node_modules/effect`, as it already
was.

**The path-existence proof moves to a test that reads through the link.**
`tests/vendored-paths.test.ts` replaces the one part of `tests/e2e/vendor.test.ts`
worth keeping: every path a Body sends a reader to inside `repos/effect` is
checked to exist. It is declared in `testSkips` with `"when": "local"`, so a
CI run - where `checks-vendor` always links the tree - fails on a moved path,
and a local run without the link skips and says why.

**The kit's generated `ci.yml` replaces `suite.yml`.** `checks-quality`
writes `.github/workflows/ci.yml` whole from `gates.ci` in `quality.json`, so
the suite runs on every pull request and every push to main. A branch pushed
without a pull request no longer runs it; the pull request that merges it does.

**Stryker and `.gitignore` drop the trailing slash.** `checks-vendor` links
`repos/<name>` as a symlink, not a directory, so `repos/*/` in `.gitignore` and
`stryker.conf.mjs`'s `ignorePatterns` missed it; both now read `repos/*`.

## What was considered and rejected

- **Keeping `src/vendor.ts` and pointing it at the same shared cache.** Two
  programs reading the same cache format is the kind of duplication 0024
  refuses; the kit's own command is the one to call.
- **Dropping the path-existence test rather than rewriting it.** A release that
  moves a path a Body names would still leave the suite green, which is the
  silent regression 0024 warns against for a check that stops deciding
  anything.

## Consequences

- **A fresh clone's `bun install` links `repos/effect`** through `checks-vendor`
  in `prepare`, the same moment `bun run vendor` used to fetch it.
- **`repos/effect` is a symlink**, so a command that resolves it, such as
  `git check-ignore`, is asked about the link itself rather than a path inside
  it.
- **skills fires `effect-error-channel` on `declares matched effect`**, from
  `quality.json`'s `sources.effect`, the same trigger 0060 gave checks and
  career; `repos/effect.toml` no longer exists to fire the other predicate.
