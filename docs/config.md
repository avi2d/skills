---
kind: reference
---
# The skills config

The skills config is one optional JSON file that names what `bun run link` writes beyond the paths [the link map](links.md) lists.
`bun run link` and the evals read it from `$SKILLS_CONFIG` when that variable is set, and from `${XDG_CONFIG_HOME:-$HOME/.config}/skills/config.json` otherwise.
A path that holds no file reads as an empty config, so a clone with no config links only what the link map lists.
A key the config does not declare is ignored, so a config written for a newer checkout still loads in an older one.
A file that is not JSON, or a key that holds the wrong shape, stops `bun run link` before it links anything, naming the file.

## Keys

| Key | Holds | What it does |
| --- | --- | --- |
| `claudeConfigDirs` | an array of directories, each relative to $HOME | `bun run link` writes Claude Code hooks into each directory, an eval treats each as a live config, and the reviewer uses the first |

A directory in `claudeConfigDirs` that is empty, starts with `/` or `~`, or holds a `..` segment is refused.
[The keys it adds to a Claude config directory](links.md#the-keys-it-adds-to-a-claude-config-directory) says which keys `bun run link` writes there.

## Example

This config gives the checkout's hooks to two Claude Code config directories, each started with `CLAUDE_CONFIG_DIR` naming it:

```json
{ "claudeConfigDirs": [".claude-work", ".claude-personal"] }
```

## Related topics

- [Install and uninstall skills](install.md)
- [The link map](links.md)
