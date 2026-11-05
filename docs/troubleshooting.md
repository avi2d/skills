---
kind: how-to
---
# Troubleshoot skills

Read this page when `bun run link` refuses, a Rule does not reach a session, or Codex skips the hooks.

## Troubleshooting

### A Rule did not fire

The Rule is off, its trigger did not match, or the session holds an index generated before the Rule changed.
Look for the Rule in `selection.toml` and in the `skills.rules` of the repository's `package.json`, then look for its name in the dispatch log.
A line naming a predicate the Dispatcher could not ask, such as a `tool-call` naming an argument the tool was not called with, says why.
When the index is stale, run `bun run generate` and start a new session.

### `refused: a real file stands where a link belongs`

`bun run link` never replaces a path that holds anything other than a link, and home-manager may still own the path.
To clear it:

1. If home-manager wrote it, remove the path from the dotfiles tree and rebuild, and otherwise move the file aside.
1. Run `bun run link` again.

### `refused: pi <version> at <path> could not load what this checkout links`

The pi at that path failed to load an extension this checkout links, and the lines below the refusal name each one with its error.
`bun run link` kept the links $HOME had, and it restores nothing.
Those links point into this checkout.
An extension that was already linked loads as the merge left it, and every Dispatcher loads as this run wrote it.
If the error names a function pi does not export, such as `createCodemodeExtension is not a function`, upgrade pi to the version [Before you begin](../README.md#before-you-begin) names, then run `bun run link` again.
Otherwise, fix the extension, or remove it from `harness/pi/settings.json`, or move its destination from `LINKS` into `RETIRED` so the link $HOME holds goes too, then run `bun run link` again.

### `refusing to link the account's own home`

`bun run link` links the home your account owns only from the `~/Projects/skills` checkout, so a worktree or a second clone cannot repoint your harnesses into itself.
Run it from `~/Projects/skills`, or, to try a copy, give it a temporary home: `HOME=$(mktemp -d) bun run link`.

### Codex does not run the hooks

Codex trusts a hook by its hash, so it ignores `harness/codex/hooks.json` until you trust the version that is linked.
After installing, and after the file changes, run `/hooks` in Codex once and trust the hooks.
`bun run link` cannot do that step.

## Related topics

- [Install and uninstall skills](install.md)
- [See what fired](../README.md#see-what-fired)
