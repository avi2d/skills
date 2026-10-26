---
kind: reference
---
# The link map

The link map is every path in $HOME that `bun run link` writes or takes back, and what each one points at in this checkout.
`bun run docs` writes this page from `LINKS`, `MERGED` and `RETIRED` in `src/generate/link.ts`, and `bun run test` fails when the two disagree.

## The links

`bun run link` makes each path below a symbolic link to the path beside it in this checkout, creating the directories that hold it.
It repoints a link that points anywhere else, and refuses a path that holds anything other than a link.
A path with a target for each machine points at the Mac's target on macOS and at the other one everywhere else.
A path only one machine links names only that machine's target.
A target under `generated/` is written by the same run, because a clone arrives without it.

| In $HOME | Points at, in this checkout |
| --- | --- |
| `~/.claude/settings.json` | `harness/claude-code/settings.json` |
| `~/.codex/hooks.json` | `harness/codex/hooks.json` |
| `~/.pi/agent/claude-bridge.json` | `harness/pi/claude-bridge.json` |
| `~/.pi/agent/keybindings.json` | `harness/pi/keybindings.json` |
| `~/.pi/agent/web-search.json` | `harness/pi/web-search.json` |
| `~/.pi/agent/extensions/session-name.ts` | `harness/pi/extensions/session-name.ts` |
| `~/.pi/agent/extensions/qwen-tool-calls.ts` | `harness/pi/extensions/qwen-tool-calls.ts` |
| `~/.pi/agent/extensions/web-tools.ts` | `harness/pi/extensions/web-tools.ts` |
| `~/.pi/agent/extensions/herdr-model-label.ts` | `harness/pi/extensions/herdr-model-label.ts` |
| `~/.pi/agent/extensions/transcript-style` | `harness/pi/extensions/transcript-style` |
| `~/.pi/agent/extensions/copy-selection.ts` | `harness/pi/extensions/copy-selection.ts` |
| `~/.pi/agent/extensions/haiku-compaction.ts` | `harness/pi/extensions/haiku-compaction.ts` |
| `~/.pi/agent/extensions/haiku-compaction` | `harness/pi/extensions/haiku-compaction` |
| `~/.agents/skills` | `generated/skills` |
| `~/.pi/agent/extensions/skills-dispatch` | `generated/pi/extension` |
| `~/.claude/skills` | `generated/skills` |
| `~/.claude/skills-dispatch` | `generated/claude-code/dispatcher` |
| `~/.codex/skills-dispatch` | `generated/codex/dispatcher` |
| `~/Projects/firstmate/config/crew-dispatch.json` | `harness/firstmate/crew-dispatch.mac.json` on the Mac, `harness/firstmate/crew-dispatch.json` on the Windows machine and any other |
| `~/.no-mistakes/config.yaml` | `generated/no-mistakes/config.yaml` |
| `~/Projects/firstmate/config/secondmate-harness` | `harness/firstmate/secondmate-harness` on the Mac |
| `~/Projects/firstmate/config/supervision-branch-model` | `harness/firstmate/supervision-branch-model` on the Mac |
| `~/Projects/firstmate/config/supervision-branch-effort` | `harness/firstmate/supervision-branch-effort` on the Mac |

## The files it writes

`bun run link` writes each path below as a file of the machine's own, because the harness writes keys of its own into it, and would write them through a link into this checkout.
It keeps each key the last column names from the file already there, and takes every other key from the file in this checkout.
It names each key it replaces, with the value the file held.
When the file in this checkout differs from its last commit only in the keys the harness writes, it restores the file.

| In $HOME | Written from, in this checkout | Kept from the file already there |
| --- | --- | --- |
| `~/.pi/agent/settings.json` | `harness/pi/settings.json` | `deviceId`, `lastChangelogVersion`, `trackingId` |

## The paths it takes back

Each path below was once in the map.
`bun run link` removes it when it is still a link into this checkout, and leaves anything else at that path alone.

- `~/.pi/agent/effect-codemode`
- `~/.claude/agents`
- `~/.claude/CLAUDE.md`
- `~/.codex/AGENTS.md`
- `~/.config/opencode/AGENTS.md`
- `~/.pi/agent/AGENTS.md`
- `~/.pi/agent/extensions/compaction-points.ts`
- `~/.pi/agent/extensions/transcript-style.ts`

## Related topics

- [Uninstall](../README.md#uninstall)
- [How a Rule reaches a harness](how-a-rule-reaches-a-harness.md)
