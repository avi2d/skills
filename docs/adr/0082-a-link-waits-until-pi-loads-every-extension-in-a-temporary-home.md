# 82. A link waits until pi loads every extension in a temporary home

Date: 2026-10-04

## Status

Accepted.

## Context

On 3 October, on the Mac, a no-mistakes run failed after 169.5 minutes with `Failed to load extension ~/.pi/agent/effect-codemode/index.ts: ... createCodemodeExtension is not a function`.
The rebuild after the merge had linked an extension that the installed pi could not load.
`effect-codemode` imports `createCodemodeExtension` from `@earendil-works/pi-coding-agent`, which pi hands to every extension, and the installed pi exported no such function.
Pi 0.87.1 is one such pi: it fails to load the extension with `(0 , _piCodingAgent.createCodemodeExtension) is not a function`.

The rebuild after each merge runs `bun install --frozen-lockfile`, `bun run generate` and `bun run link` in the checkout.
Nothing in it started pi, so the first program to load the extension was the next session that needed it.

Pi 1.0.2's `main.js` loads every extension before it looks for a model.
It turns each extension that fails into an error, prints `Failed to load extension "<path>": <error>` and exits 1.
With `--print`, no prompt and stdin closed, it exits 0 once every extension has loaded, and asks no model anything, so it needs no credential.
`--help` and `--list-models` also load the extensions, but they exit 0 before pi reports a failure.

`bun run` puts `node_modules/.bin` of the checkout and of each directory above it first on `PATH`.
`pi` looked up on that `PATH` is the pinned dev dependency, which loads `effect-codemode`, and not the pi the machine runs.

## What was considered and rejected

- **Loading the extensions in the real home after linking.** A failure would leave the broken link in place, which is the state that failed the run.
- **Copying credentials into the temporary home to run a prompt.** The load needs no credential, and a copy puts keys where a test can read them.
- **Loading each extension with `--no-extensions` and `--extension`.** It checks a list kept beside the map, and misses how pi itself finds an extension through `~/.pi/agent/extensions/` and the `extensions` list of its settings.
- **Refusing to link on a machine without pi.** No pi there loads the extension, and Claude Code and Codex would lose their links to a check that cannot fail.

## Decision

`bun run link` writes the generated tree, then links the checkout into a temporary home and starts the installed pi there, before it touches `$HOME`.
That link restores nothing in the checkout, because the settings pi reads through a link it had into `harness/pi/settings.json` hold keys that only the merge into `$HOME` keeps.
Pi runs as `pi --offline --print --no-session --no-approve`, with no prompt and stdin closed.
It runs in an environment that holds only `HOME`, `PATH`, `TMPDIR` and `NO_COLOR`, so no API key and no `PI_CODING_AGENT_DIR` reaches it.
Its `PATH` drops the `node_modules/.bin` entries that `bun run` adds, so `pi` is the installed one.
The link looks `pi` up on that `PATH` itself, runs the path it finds, and prints that path with the version `pi --version` reports, so the output names the pi it checked.

The link refuses, exits 1 and keeps the links `$HOME` had when any of these holds:

- Pi names an extension it failed to load. The refusal prints each such line, with the temporary home written as `~`.
- Pi exits with a status other than 0. The refusal prints what pi wrote to stderr.
- Pi runs longer than 60 seconds.
- Pi exits 0 without loading an extension the preflight passes it with `--extension`, which writes a file when pi loads it. That pi checked nothing.

When `pi` is not on that `PATH`, the link goes ahead and prints that no pi extension was load-checked.

## Consequences

An extension that the installed pi cannot load stops the rebuild, which names it, rather than the next session that needs it.
The check detects a failure and does not contain one.
The links `$HOME` keeps point into the working tree, as [record 0004](0004-the-repo-installs-itself-and-the-contract-stays-hand-written.md) and [record 0021](0021-the-emitted-tree-reaches-a-clone-through-the-generator.md) record.
An extension that was already linked therefore loads as the merge left it, and every Dispatcher loads as the refused run wrote it.
The refusal restores neither the working tree nor a Dispatcher, and only an extension the map had not linked yet stays out of `$HOME`.
The refusal holds back every link, Claude Code's and Codex's included, because one run installs the whole map or none of it.
Upgrading pi, or reverting the extension, and running `bun run link` again lets the link through.

Each `bun run link` starts pi once more, which takes about a second.

The preflight loads only what this checkout links.
A package in pi's `packages` list, or an extension another tool installs, such as herdr's, is missing from the temporary home, and pi skips it there without an error.
