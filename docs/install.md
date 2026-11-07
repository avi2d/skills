---
kind: how-to
---
# Install and uninstall skills

Install skills once on each machine whose harnesses should take their instructions from this checkout, and uninstall it to hand those paths back.

## Before you begin

- The tools the README's [Before you begin](../README.md#before-you-begin) section lists.

## Install

To install skills:

1. Clone `https://github.com/avi2d/skills` to a checkout, because every link the install makes points into the checkout.
   `bun run link` links your own home only from the checkout the guard in `src/generate/link.ts` names.
   From any other copy it stops before it writes, so a worktree cannot repoint your harnesses into itself.
1. From the root of the checkout, run `bun install`.
   It installs the dependencies and links the declared library sources under `repos/`.
1. Run `bun run link`.
   It writes `generated/` and checks that pi loads the checkout's extensions in a temporary home.
   Then it links each path below to the checkout, or writes it from the checkout where the list says so.

`bun run link` prints the version and path of the pi it checked, such as `pi 1.5.0 at /usr/local/bin/pi loaded every extension in a temporary $HOME first`.
It then ends with one line per path, such as `linked   ~/.claude/settings.json`, and exits 0.
On a machine without pi, the line about pi reads `pi is not on $PATH, so no pi extension was load-checked`.
These paths in $HOME then belong to the checkout:

<!-- `bun run docs` writes the list below from `LINKS` and `MERGED` in `src/generate/link.ts`. -->
- `~/.claude/settings.json`
- `~/.codex/hooks.json`
- `~/.pi/agent/claude-bridge.json`
- `~/.pi/agent/keybindings.json`
- `~/.pi/agent/web-search.json`
- `~/.pi/agent/extensions/session-name.ts`
- `~/.pi/agent/extensions/qwen-tool-calls.ts`
- `~/.pi/agent/extensions/web-tools.ts`
- `~/.pi/agent/extensions/herdr-model-label.ts`
- `~/.pi/agent/extensions/transcript-style`
- `~/.pi/agent/extensions/copy-selection.ts`
- `~/.pi/agent/extensions/haiku-compaction.ts`
- `~/.pi/agent/extensions/haiku-compaction`
- `~/.agents/skills`
- `~/.pi/agent/extensions/skills-dispatch`
- `~/.claude/skills`
- `~/.claude/skills-dispatch`
- `~/.codex/skills-dispatch`
- `~/Projects/firstmate/config/crew-dispatch.json`
- `~/.no-mistakes/config.yaml`
- `~/.orc/orchestrator.md`
- `~/Projects/firstmate/config/secondmate-harness`
- `~/Projects/firstmate/config/supervision-branch-model`
- `~/Projects/firstmate/config/supervision-branch-effort`
- `~/.pi/agent/settings.json`, written from `harness/pi/settings.json` rather than linked
<!-- The list above ends here. -->

[The link map](links.md) says what each one points at.
Codex also has to trust its hooks once, as [Codex does not run the hooks](troubleshooting.md#codex-does-not-run-the-hooks) describes.

## Uninstall

To uninstall skills, run this script from the root of the checkout:

<!-- `bun run docs` writes the script below from `LINKS` and `RETIRED` in `src/generate/link.ts`. -->
```sh
root=$(pwd -P)
for path in \
  '.claude/settings.json' \
  '.codex/hooks.json' \
  '.pi/agent/claude-bridge.json' \
  '.pi/agent/keybindings.json' \
  '.pi/agent/web-search.json' \
  '.pi/agent/extensions/session-name.ts' \
  '.pi/agent/extensions/qwen-tool-calls.ts' \
  '.pi/agent/extensions/web-tools.ts' \
  '.pi/agent/extensions/herdr-model-label.ts' \
  '.pi/agent/extensions/transcript-style' \
  '.pi/agent/extensions/copy-selection.ts' \
  '.pi/agent/extensions/haiku-compaction.ts' \
  '.pi/agent/extensions/haiku-compaction' \
  '.agents/skills' \
  '.pi/agent/extensions/skills-dispatch' \
  '.claude/skills' \
  '.claude/skills-dispatch' \
  '.codex/skills-dispatch' \
  'Projects/firstmate/config/crew-dispatch.json' \
  '.no-mistakes/config.yaml' \
  '.orc/orchestrator.md' \
  'Projects/firstmate/config/secondmate-harness' \
  'Projects/firstmate/config/supervision-branch-model' \
  'Projects/firstmate/config/supervision-branch-effort' \
  '.pi/agent/effect-codemode' \
  '.claude/agents' \
  '.claude/CLAUDE.md' \
  '.codex/AGENTS.md' \
  '.config/opencode/AGENTS.md' \
  '.pi/agent/AGENTS.md' \
  '.pi/agent/extensions/compaction-points.ts' \
  '.pi/agent/extensions/transcript-style.ts'
do
  case "$(readlink "$HOME/$path")" in "$root"/*) rm "$HOME/$path" ;; esac
done
```
<!-- The script above ends here. -->

The script removes each path that is still a link into this checkout, and leaves a path holding anything else alone.
It leaves each file `bun run link` writes rather than links, because that file holds keys of the machine's own, such as pi's `deviceId`.
The directories `bun run link` created to hold a link stay behind.

## Related topics

- [Troubleshoot skills](troubleshooting.md)
- [The link map](links.md)
