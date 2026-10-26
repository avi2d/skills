# 4. The repo installs itself, and the Contract stays hand-written

Date: 2026-08-28

## Status

Accepted. The arrival half of #32; the departure half is recorded in the
dotfiles repository's own ADR.

Amended by 0008: the map is the whole account of what $HOME takes from here, and every entry is a path git has.

Amended by `0021-the-emitted-tree-reaches-a-clone-through-the-generator.md`.
The working tree is still the installed version, and a clone no longer arrives
holding all of it: `generated/` is in no clone, so `bun run link` writes it
before it points `$HOME` at it. What follows is left as it was written.

Amended by 0020: a dropped entry is retired through `RETIRED` rather than keeping its last target.

Amended by 0064: the global instruction file and `global/` are gone, so
neither is installed or walked any more.

Amended by 0079: `~/.pi/agent/settings.json` is a file of the machine's own,
written from `harness/pi/settings.json` rather than linked to it. Pi's writes
through the link dirtied the checkout and stopped the pull before each
rebuild, so the linker keeps pi's own keys on the machine and names every
other key of pi's it puts back.

## Context

Until now this repository reached `$HOME` through the dotfiles repo: a flake
input there carried the Hub and the Dispatcher into the nix store on every
rebuild, and the harness settings lived in the dotfiles tree outright. Both
halves of that arrangement had been generating tickets. The input copied the
whole repository - 134M of `node_modules` included - into the store per
rebuild, its lock sat 18 commits stale behind a `path:` override that hid the
gap, and two separate issues existed just to ask which Hub was actually
installed. Meanwhile the settings were a daily-edited file in a repo built
around a `sudo darwin-rebuild`, and `CONTEXT.md` here had already named what
they are: the **Contract** half of each harness's Adapter, which made the
other repo's tree the wrong address by this repo's own vocabulary.

The setup changes often - harnesses swap, skills churn daily - and every edit
was paying nix's price for a guarantee nix was not actually providing: the
dotfiles flake already hardcoded absolute paths into the working tree, so the
reproducible build was a lock that said one thing and links that did another.

## Decision

Two, adopted together.

**This repository installs itself.** `src/link.ts` declares every path in
`$HOME` that resolves into this repo - the Contracts, the global instruction
file, the Hub, the Dispatcher, the sub-agent definitions - and `bun run link`
installs them as symlinks into the working tree. No flake output, no store
copy, no lock: the installed version IS the working tree, and a Body edit is
`bun run generate` and nothing else. The boundary rule is absolute in both
directions: neither this repo nor the dotfiles repo holds a path into the
other. What must agree across the boundary - the theme name `terminal` /
`custom:terminal`, the statusline path `$HOME/.claude/cc-statusline` - is
frozen and asserted on each side independently, as literals, so the pair
cannot drift without one side's own suite going red.

**The Contract files stay hand-written.** In a repo whose organising rule is
that `generated/` belongs to the generator, the settings are the deliberate
exception, because they have a second writer: the harness itself rewrites its
own settings at runtime - pi on every launch, Claude Code whenever a
preference moves. A generated file with a second writer is a suite that goes
red on every launch; a hand-written, live-symlinked file makes the harness's
writes a reviewable diff in this working tree instead.

## What was considered and rejected

- **Generating the Contract from the Selection.** The cohesive-looking
  option: `disableBundledSkills` and the permission denies really are
  downstream of what the Hub holds. Rejected on the second-writer problem
  above - build-time ownership by the generator and runtime ownership by the
  harness cannot both hold on one file.
- **Keeping the flake input for the Hub and moving only the settings.** Leaves
  the daily-edited half of the repo behind a `sudo darwin-rebuild` and keeps
  the store copies and the stale lock - the tickets that motivated the move
  would all have stayed open.
- **Copying instead of symlinking, with drift as a diff.** Rejects the
  harness's own writes on every install; the churn the live symlink turns
  into a reviewable diff would instead be silently overwritten.
- **Vendoring the herdr integration files** (`herdr-agent-state.sh` / `.ts`,
  which the Contracts enable). Their headers say herdr installs and
  overwrites them; a copy here would be written through or silently detached,
  the exact failure it would exist to prevent. They enter no repository and
  are verified in place instead - present, and carrying the expected
  `HERDR_INTEGRATION_ID` and a frozen `HERDR_INTEGRATION_VERSION`, so a herdr
  upgrade is looked at rather than passed over. This also keeps **Vendor**
  meaning what `CONTEXT.md` says it means: Bodies, copied verbatim.

## Consequences

- **Ordering on first install is a hard constraint.** home-manager renames
  anything standing where it wants a path to `.hm-bak`; the dotfiles repo
  must therefore drop its claim (remove and rebuild) before `bun run link`
  runs. The linker's refusal to replace a real file is the guard on the other
  side of the same mistake.
- **A fresh machine needs this repo cloned before any harness is configured.**
  There is no lock to build from; the working tree is the artifact. That is
  the accepted cost of making every edit live.
- **The map is held complete by the suite**, from three directions: every
  declared link resolves into the repo, every file under `harness/` and
  `global/` is reachable through the map, and every hook or extension the
  settings enable is owned by the map, verified as herdr's, or frozen. A
  Contract file added and never linked is the same drift as a Body missing
  from `selection.toml`, and fails the same way.
- **The harness's runtime writes now dirty this working tree.** That is the
  feature, not a leak: the churn lands where it is a diff. The trailing
  newline pi drops on every launch arrives with the file it afflicts.
- **When the setup stabilises**, the dotfiles repo may grow an injection of
  this repo again. That is a new decision against this ADR, not a revert of
  it: whatever carries the files then still may not carry a path into this
  working tree.
