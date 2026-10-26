# 79. Pi's settings are a file of the machine's own, written from the checkout

Date: 2026-10-02

## Status

Accepted.
Amends 0008: `LINKS` and `MERGED` together are the whole account of what $HOME takes from here, and `~/.pi/agent/settings.json` is in `MERGED` rather than the map.
Amends 0004: pi's settings are written from the checkout rather than linked to it, so pi's own writes no longer dirty the checkout.

## Context

`bun run link` pointed `~/.pi/agent/settings.json` at `harness/pi/settings.json`.
Pi writes some keys into that file by itself, and its write follows the link into the checkout.
On the Windows machine, after a merge, the checkout held a new `deviceId`, and `lastChangelogVersion` had moved from 0.99.1 to 1.0.0.
The rebuild after each merge pulls main before it runs `bun install --frozen-lockfile`, `bun run generate` and `bun run link`.
A dirty settings file stops that pull whenever main changes the file.

Pi 1.0.0's source shows which keys it writes by itself:

- `lastChangelogVersion`, on the first interactive start after an upgrade.
- `deviceId`, through `getOrCreateDeviceId`, when a person logs in to OpenAI's ChatGPT.
- `trackingId`, when a person first opts in to analytics.

Every other write follows a choice a person makes inside pi, such as `/model` or `/settings`.

Pi reads one global settings file, `<agent-dir>/settings.json`, and writes it with `writeFileSync`, which follows a link.
The only layer it adds is a project's `.pi/settings.json` under the working directory, and some keys this repository sets, such as `cacheWarming`, apply only globally.
`PI_CODING_AGENT_DIR` moves the whole agent directory and adds no layer.
Pi has no flag, variable or include that keeps the tracked settings apart from its own writes.

## What was considered and rejected

- **Restoring the checkout's file before each pull.** That throws `deviceId` away, so pi makes a new one after every rebuild.
- **Marking the file skip-worktree.** `git pull` still refuses whenever main changes a file the checkout holds changed.
- **Waiting for pi to add an overlay.** The captain does not wait on an upstream maintainer.
- **Dropping `lastChangelogVersion` from `harness/pi/settings.json` in the same change.** The linker ignores it, so leaving the file alone keeps this change to the linker.

## Decision

`MERGED` in `src/generate/link.ts` names `~/.pi/agent/settings.json`, its source `harness/pi/settings.json`, and the keys pi writes by itself: `deviceId`, `lastChangelogVersion` and `trackingId`.
`bun run link` writes that path as a file of its own.
The file holds every key of the checkout's file except pi's own, and pi's own keys from the file already there.
The linker ignores pi's own keys in the checkout's file.

The linker reads the file already there through any link before it writes, so the first run after this change keeps the `deviceId` pi wrote into the checkout.
It removes a link before writing, so its write never reaches the checkout.
It reports `kept` and writes nothing when the file already holds what it would write.
It names every other key it replaces, with the value the file held, so a change made inside pi never disappears without a line saying so.

When the checkout's file differs from `HEAD` only in pi's own keys, and the index holds it as `HEAD` does, the linker restores it with `git checkout`.
A difference in any other key, or a staged change, is somebody's edit, and the linker leaves it alone.

## Consequences

A checkout that pulls this change before main changes `harness/pi/settings.json` needs no step by hand.
Its first `bun run link` keeps the `deviceId` pi wrote into the checkout, and leaves the checkout clean.

A checkout pi dirtied cannot pull a commit that changes `harness/pi/settings.json`, so `bun run link` never runs to restore it.
The commit that turns off `fullscreenCopyOnSelect` is one, and it is on main ahead of this change.
Such a checkout, the Windows machine's among them, needs one step by hand before its next pull, run from the checkout's root:

```sh
f=~/.pi/agent/settings.json
cp "$f" "$f.tmp" && mv "$f.tmp" "$f" && git checkout harness/pi/settings.json
```

The copy and the move make `~/.pi/agent/settings.json` a file of its own holding the `deviceId`, and the next `bun run link` keeps it.
`git checkout` runs only once they succeed, so the `deviceId` is never thrown away while the link still stands.

A setting changed inside pi lasts until the next `bun run link`, which prints it and puts the checkout's value back.
A change meant to last goes in `harness/pi/settings.json`.

The uninstall leaves `~/.pi/agent/settings.json`, because it holds the machine's own keys.

`harness/pi/settings.json` still holds `lastChangelogVersion`, which the linker ignores.
A later change can drop it once every checkout has pulled this one.

A pi release that writes a new key by itself needs that key added to `MERGED`.
Until then, every `bun run link` names the key and drops it, and pi writes it again.
