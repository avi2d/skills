# 49. A pin resolves when the dependencies install

Date: 2026-09-24

## Status

Accepted. Supersedes 0027 on how the fetched tree reaches a checkout, and on
both Effect Bodies opening with the instruction to fetch it. Superseded by 0070
on how `repos/effect` is fetched: `checks-vendor` replaces `src/vendor.ts`.
Applies 0024.

## Context

`rules/effect-error-channel` fires wherever `repos/effect.toml` is tracked, and
spent eight of its lines telling the reader to run one command: check whether
`repos/effect` is there, run `bun run vendor` if it is not, and clone the pin
by hand where no such script exists. `references/effect-patterns` opened with
the same instruction. 0024 calls an instruction the weak form of a constraint a
program can decide, and this one was being missed:

- The dispatch log shows the Rule injected into 484 sessions.
- Of the 22 checkouts on this machine carrying the pin, two primary checkouts
  and 20 worktrees, 4 had the tree. Neither primary checkout did.

Measured here at the pin: a fetch takes 3.6 seconds and puts 3,996 files,
59 MB, into `repos/effect`; a run on a tree already at the pin takes 0.17
seconds and fetches nothing. Bun 1.3.13 runs the root package's `prepare` on
`bun install` and on `bun install --frozen-lockfile`, fails the install with
the script's exit status when the script fails, and skips it under
`--ignore-scripts`.

## Decision

**`bun install` resolves every pin.** `package.json` carries
`"prepare": "bun run vendor"`. Every clone, worktree and CI job already runs
`bun install` before anything else here works, so the tree lands beside the
dependencies, at the pin, checked against `commit` the way `bun run vendor`
already checks it. A fetch that fails, or that lands on a commit the pin does
not name, fails the install and names the pin.

**The Rule says where the source is, in one line, and how to fetch it when it
is missing, in one sentence.** "Effect's source is at `repos/effect`." and a
fallback, `bun run vendor` or else a `--depth 1` clone of the pin's `url` at its
`ref`, replace the eight. The fallback is for the checkouts `prepare` does not
reach: `dotfiles`, which has no `prepare`, a checkout installed before this
change, and an install run with `--ignore-scripts`. The pointer into
`Effect.ts` and the paragraph on reading before writing from memory stay,
because what to read is not a command. The Reference makes the same swap
for its opening instruction. The Rule costs 646 tokens rather
than 712, and the worst case a session can receive falls from 3,456 to 3,390
against the 3,500 ceiling.

**Stryker leaves the fetched trees out of its sandbox.** With the tree fetched,
Stryker's own file reader selected 4,153 files for the copy, 3,996 of them the
library. With `/repos/*/` in `ignorePatterns` it selects 157, `repos/effect.toml`
still among them. Nothing the mutate run executes reads the tree.

## Why prepare rather than first read

Either would do: resolve in `prepare`, or lazily when something first reads
`repos/effect`. First read has one real advantage: it would cover every
repository the Rule reaches, where `prepare` covers only the repositories that
wire it. It loses on the rest.

- **No moment is the first read.** An agent reads the library through `Read`
  and `Grep`, and as often through `rg` or `grep` inside a shell command.
  Recognising a read of `repos/effect` inside an arbitrary shell string is a
  guess, and a missed guess leaves the same missing tree the instruction did.
- **The seam that would host it holds no side effects.** The only code that
  runs at a read is the Dispatcher, whose core is a pure function and whose
  adapters hold no judgment. A fetch would be a new action in the core and a
  new effect in three adapters, each under its harness's hook deadline: Claude
  Code gives the `PreToolUse` hook 10 seconds, and a fetch is 3.6 on a good
  network.
- **A failure there is quiet.** A hook killed mid-clone leaves a missing or
  half-written tree and tells the agent nothing. A `prepare` that fails stops
  `bun install` with the pin's name in the error, in front of whoever ran it.
- **It is a build step.** `prepare` is one line of `package.json` and
  `src/vendor.ts` unchanged.

## What was considered and rejected

- **`postinstall`.** Bun runs it at the same moment. `prepare` is the step npm
  runs to build a local checkout, and says what this is.
- **`"prepare": "bun run vendor || true"`**, so an offline install still
  succeeds. Then an install that could not fetch the library reports success,
  and nothing says the tree is missing until an agent goes to read it. An
  offline first install cannot fetch the packages either.
- **Failing the suite when the tree is absent.** `bun install --ignore-scripts`
  still leaves a checkout without it, and the suite stays green with nothing
  fetched; the check that reads the tree skips and says why.

## Consequences

- **A fresh clone's `bun install` fetches Effect**, 4.5 seconds for the whole
  install from a warm package cache. So does every CI job, which puts the check
  that every path a Body names inside the tree exists in front of every pull
  request; it skipped on a runner that never fetched.
- **`bun install` needs `github.com`** the first time a checkout installs, and
  again whenever a pin moves.
- **`tests/e2e/vendor.test.ts` runs the real `bun install`** over a copy of the
  tracked tree whose pins name a local upstream. It holds that every pin lands
  at its commit, and that a pin that does not resolve fails the install and
  names itself. The first went red with the `prepare` line absent; the second
  went red with `|| true` appended to it.
- **`dotfiles` pins the same library** with a `vendor` script of its own and no
  `prepare`. The Rule reaches it too, and there the fallback sentence is what
  fetches the tree, until its `package.json` carries the same line.
