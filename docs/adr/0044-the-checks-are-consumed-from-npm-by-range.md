# 44. The checks are consumed from npm, by range

Date: 2026-09-23

## Status

Accepted. Supersedes the clause of 0035 that fetched `@avi2d/checks` from
`github:avi2d/checks` at a commit, and the rejection of publishing it to a
registry. What 0035 says about the suite generating what it reads and about the
memoised bundle still holds. Amended by 0051, which moves `@avi2dg/checks` to
`dependencies` because every Dispatcher bundle ships its `scripts/comments.ts`.

## Context

The shared checks kit lives in `github.com/avi2d/checks`, and each repository
that uses it consumed it a different way: this one pinned a git commit,
dotfiles and career used a `file:` path that resolves only because the
checkouts sit side by side, and smithers had no dependency at all. The captain
asked for the kit to be published so that every repository uses it the same
way.

0035 rejected publishing on two facts. npmjs needed credentials and a second
factor the worktree did not have, and GitHub Packages needs a token in every
consumer's `.npmrc`. The first was a fact about who publishes, not about who
installs, and the kit is now published. The second does not apply to npmjs: a
public package installs with nothing configured, in a clone, a worktree and CI
alike.

The `@avi2d` scope on npmjs belongs to someone else, so the package is
published as `@avi2dg/checks`.

## Decision

**`@avi2dg/checks` is a devDependency by caret range, the one `package.json`
declares, from the public npm registry.** The tarball carries `dist/index.js`
built, so no build step runs at install. `bun.lock` records the version
resolved and its integrity, so every install of one commit gets the same bytes.

**Every repository that uses the kit consumes it this way.** No `file:` path
and no git pin stands beside it.

`tests/e2e/toolchain.test.ts` keeps refusing a `file:` or `link:` dependency and
a repository dependency that names anything but a 40-character commit; a range
is neither, so the kit passes it.

## Consequences

- **Taking a new release of the checks is `bun update @avi2dg/checks`** for one
  inside the range, and an edit to the range for one outside it. Either shows up
  in `bun.lock`.
- **A release is what reaches a consumer.** A commit to `avi2d/checks` that is
  not published changes nothing here.
- **The kit's own paths are spelled `@avi2dg`.** `.oxlintrc.json`,
  `tsconfig.json`, `.dependency-cruiser.cjs` and the `lint` script name
  `@avi2dg/checks`.

## What was considered and rejected

- **Keeping the git pin here and leaving the other repositories as they were.**
  It keeps the difference the captain asked to remove.
- **An exact version rather than a range.** `bun.lock` already fixes what an
  install resolves, so an exact spec would only make taking a patch release an
  edit to `package.json` as well.
