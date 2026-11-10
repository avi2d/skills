# skills

The skills repository holds instructions for coding agents, written once and delivered to pi, Claude Code and Codex.
Each harness runs a Dispatcher built here, which fires a Rule when its trigger matches rather than waiting for the model to load it.
Use it to keep one set of agent instructions for every harness you run, and to have each instruction arrive when the work calls for it.
[Why this repository exists](docs/why.md) says what it replaced, and [the glossary](docs/glossary.md) defines its terms.

## Before you begin

- Bun, at the version `.bun-version` pins, which runs every command below.
- Git, to clone the repository.
- At least one harness: pi 1.5.1, Claude Code 2.1.280 or Codex 0.155.0-alpha.16.

## Install

[Install and uninstall skills](docs/install.md) says how to clone, link and unlink the checkout.

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

[Read stored session context](docs/context-sessions.md) says how to index and read stored opening requests.

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
| `src/platform/` | the Effect layer, file access, frontmatter field readers and failures the rest of `src/` shares |
| `tests/` | the suite, run with `bunx checks-test --changed` |
| `evals/` | the ablation that measures what a Rule or a Reference changes |
| `evals/sweeps/` | one committed record per sweep, and the page `bun run docs` writes from them |
| `harness/` | each harness's Contract, which [The harness Contracts](docs/contracts.md) describes |
| `generated/` | the Hub, the Dispatcher bundles and the dispatch index, written by `bun run generate` and never committed |
| `repos/` | links to library source for agents to read, and never committed |
| `docs/` | the pages linked below, and the decision records in `docs/adr/` |
| `package.json` | scripts, dependencies, the release version, and the repository's Rule switches |
| `CHANGELOG.md` | what each release changed, with links to its pull requests, written by `bun run build` |

## Related topics

- [Troubleshoot skills](docs/troubleshooting.md)
- [Write a Rule](docs/write-a-rule.md)
- [Measure a Rule](docs/measure-a-rule.md)
- [Develop this repository](docs/develop.md)
- [Frontmatter fields](docs/frontmatter.md)
- [Trigger predicates](docs/triggers.md)
- [The link map](docs/links.md)
- [The skills config](docs/config.md)
- [Eval variables](docs/eval-variables.md)
- [Eval cases](docs/eval-cases.md)
- [The harness Contracts](docs/contracts.md)
- [How a Rule reaches a harness](docs/how-a-rule-reaches-a-harness.md)
- [Why this repository exists](docs/why.md)
- [Glossary](docs/glossary.md)
- [Decision records](docs/adr/README.md)
