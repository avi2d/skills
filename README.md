# skills

The skills repository holds instructions for coding agents, written once and delivered to pi, Claude Code and Codex.
Each harness runs a Dispatcher built here, which fires a Rule when its trigger matches rather than waiting for the model to load it.
Use it to keep one set of agent instructions for every harness you run, and to have each instruction arrive when the work calls for it.
[Why this repository exists](docs/why.md) says what it replaced, and [the glossary](docs/glossary.md) defines its terms.

## Before you begin

- Bun, at the version `.bun-version` pins, which runs every command below.
- Git, to clone the repository.
- At least one harness: pi 1.2.0, Claude Code 2.1.280 or Codex 0.155.0-alpha.16.

## Install

To install skills:

1. Clone `https://github.com/avi2d/skills` to `~/Projects/skills`, because every link the install makes points into the checkout, and `bun run link` links your own home only from there.
1. From the root of the checkout, run `bun install`.
   It installs the dependencies and links the declared library sources under `repos/`.
1. Run `bun run link`.
   It writes `generated/` and checks that pi loads the checkout's extensions in a temporary home.
   Then it links each path below to the checkout, or writes it from the checkout where the list says so.

`bun run link` prints the version and path of the pi it checked, such as `pi 1.2.0 at /usr/local/bin/pi loaded every extension in a temporary $HOME first`.
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
- `~/Projects/firstmate/config/secondmate-harness`
- `~/Projects/firstmate/config/supervision-branch-model`
- `~/Projects/firstmate/config/supervision-branch-effort`
- `~/.pi/agent/settings.json`, written from `harness/pi/settings.json` rather than linked
<!-- The list above ends here. -->

[The link map](docs/links.md) says what each one points at.
Codex also has to trust its hooks once, as [Codex does not run the hooks](#codex-does-not-run-the-hooks) describes.

## Switch a Body on or off

To switch a Body on or off for every repository:

1. Add its name to, or remove it from, a list in `selection.toml`.
   A Rule is listed in the default Profile's `rules`, and another Profile names only the Rules it adds in `add` and the ones it removes in `drop`.
   A Skill or a Reference is listed only in the default Profile, which every other Profile shares.
1. Run `bun run generate`.

A Rule's refusal still runs when `selection.toml` leaves the Rule off, and only `skills.rules.off` in a repository's `package.json` stands it down.

To switch a Rule on or off in one repository, name it under `skills.rules` in that repository's `package.json`:

```json
"skills": { "rules": { "off": ["fix-what-you-see"] } }
```

`off` keeps a Rule and its refusal out of every session there.
`on` takes the Rules that `selection.toml` leaves out of the session's model Profile and makes them active there, and each one's trigger still decides when it fires.
The Dispatcher reads the file at every prompt, so the switch needs no `bun run generate`.

## Get an edited Rule into the next session

To get an edited Rule into the next session:

1. Edit `library/<domain>/rules/<name>/SKILL.md`.
1. Run `bun run generate`.
1. Start a new session.

The dispatch index carries a copy of each Rule's text, so a session gets the text as it was when `bun run generate` last ran.
An edit to the text of a Skill or a Reference needs no generate, because the Hub links to the Body itself.

## See what fired

To see what fired:

1. Read `~/.local/state/skills/dispatch.log`.
   Every Dispatcher appends a line there for each Rule it injects, delivers or refuses with, and for each predicate it could not ask.
   A line looks like `2026-09-25T07:23:06.330Z <session> deliver typescript-best-practices: file-matches matched src/a.ts`.
1. Run `bun run dispatch-report`.
   It reads the last week of the log and lists the active Rules that reached no session, the sessions that lost a Rule, and the sessions that asked `repo-contains` of no tree or a partial one.

## Read opening context

To inspect the stored opening requests without running a new agent session:

1. Run `bun run context-index` to update the local index.
1. Run `bun run context-report` to write the report and offline explorer under `$XDG_STATE_HOME/skills/`, or `~/.local/state/skills/` when that is unset.

The [session reader guide](docs/context-sessions.md) names what each tool stores and what its records cannot measure.
The generated [Profile context parts](docs/context-profiles.md) page lists character sizes from this tree and contains no machine-local measurements.

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

## Where things are

| Path | What it holds |
| --- | --- |
| `library/` | one directory per domain, such as `writing` or `engineering`, each holding a `rules/`, a `skills/` and a `references/` directory, with a `.gitkeep` in one that holds no Body |
| `library/<domain>/rules/` | the Rules, one directory each, which a Dispatcher fires by trigger |
| `library/<domain>/skills/`, `library/<domain>/references/` | the other two Kinds of Body |
| `selection.toml` | the Rule, Skill and Reference lists of the default Profile, and each model Profile's Rule additions and removals against it, with optional tool limits, and in `default_models` the models that run the default Profile on purpose |
| `src/dispatcher/` | one Dispatcher adapter per harness, the dispatch core, and every other module a Dispatcher bundle ships |
| `src/generate/` | the generator, which writes the bundles, the dispatch index, the Hub and each machine's firstmate and no-mistakes files, and the linker |
| `src/bodies/` | what reads the Bodies and `selection.toml` |
| `src/eval/` | what `bun run eval` runs to measure a Rule |
| `src/context/` | what `bun run context-index` and `bun run context-report` run to read the opening context of stored sessions |
| `src/docs/`, `src/report/` | what `bun run docs` and `bun run dispatch-report` run |
| `src/platform/` | the Effect layer, file access and failures the rest of `src/` shares |
| `tests/` | the suite |
| `evals/` | the ablation that measures what a Rule or a Reference changes |
| `evals/sweeps/` | one committed record per sweep, and the page `bun run docs` writes from them |
| `harness/` | each harness's Contract, which [The harness Contracts](docs/contracts.md) describes |
| `generated/` | the Hub, the Dispatcher bundles and the dispatch index, written by `bun run generate` and never committed |
| `repos/` | links to library source for agents to read, and never committed |
| `docs/` | the pages linked below, and the decision records in `docs/adr/` |
| `package.json` | scripts, dependencies, the release version, and the repository's Rule switches |
| `CHANGELOG.md` | what each release changed, with links to its pull requests, written by `bun run build` |

## Troubleshooting

### A Rule did not fire

The Rule is off, its trigger did not match, or the session holds an index generated before the Rule changed.
Look for the Rule in `selection.toml` and in the `skills.rules` of the repository's `package.json`, then look for its name in the dispatch log.
A line naming a predicate the Dispatcher could not ask, such as a `tool-call` naming an argument the tool was not called with, says why.
When the index is stale, run `bun run generate` and start a new session.

### `refused: a real file stands where a link belongs`

`bun run link` never replaces a path that holds anything other than a link, and home-manager may still own the path.
If home-manager wrote it, remove the path from the dotfiles tree and rebuild, then run `bun run link` again.
Otherwise, move the file aside and run `bun run link` again.

### `refused: pi <version> at <path> could not load what this checkout links`

The pi at that path failed to load an extension this checkout links, and the lines below the refusal name each one with its error.
`bun run link` kept the links $HOME had, and it restores nothing.
Those links point into this checkout, so an extension that was already linked loads as the merge left it, and every Dispatcher loads as this run wrote it.
If the error names a function pi does not export, such as `createCodemodeExtension is not a function`, upgrade pi to the version [Before you begin](#before-you-begin) names, then run `bun run link` again.
Otherwise, fix the extension, or remove it from `harness/pi/settings.json`, or move its destination from `LINKS` into `RETIRED` so the link $HOME holds goes too, then run `bun run link` again.

### `refusing to link the account's own home`

`bun run link` links the home your account owns only from the `~/Projects/skills` checkout, so a worktree or a second clone cannot repoint your harnesses into itself.
Run it from `~/Projects/skills`, or, to try a copy, give it a temporary home: `HOME=$(mktemp -d) bun run link`.

### Codex does not run the hooks

Codex trusts a hook by its hash, so it ignores `harness/codex/hooks.json` until you trust the version that is linked.
After installing, and after the file changes, run `/hooks` in Codex once and trust the hooks.
`bun run link` cannot do that step.

## Related topics

- [Write a Rule](docs/write-a-rule.md)
- [Measure a Rule](docs/measure-a-rule.md)
- [Develop this repository](docs/develop.md)
- [Frontmatter fields](docs/frontmatter.md)
- [Trigger predicates](docs/triggers.md)
- [The link map](docs/links.md)
- [Eval variables](docs/eval-variables.md)
- [Eval cases](docs/eval-cases.md)
- [The harness Contracts](docs/contracts.md)
- [How a Rule reaches a harness](docs/how-a-rule-reaches-a-harness.md)
- [Why this repository exists](docs/why.md)
- [Glossary](docs/glossary.md)
- [Decision records](docs/adr/README.md)
