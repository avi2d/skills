---
kind: explanation
---
# Why this repository exists

Why keep agent instructions in a repository with a build step and a Dispatcher per harness, rather than as skills each harness loads by itself?
A skill fires only when the model remembers to load it, and the instructions here have to fire every time their work comes up, in every harness, from one copy.

## A skill fires when the model remembers

The coding agents in scope run on several harnesses, pi first, then Claude Code and Codex.
A harness offers a skill by its description and leaves the model to decide to load it.
pi's own documentation says models do not always do so, and suggests prompting or `/skill:name` to force it.
An instruction that applies to a whole class of work, such as `typescript-best-practices`, cannot depend on the model choosing to remember it.
So a Rule here is never invoked.
It carries a trigger, and the Dispatcher fires it when the trigger matches.

## Composition in prose is optional

Bodies once chained into each other by asking the model to call another skill.
`implement` ended by asking for `/code-review`, and nothing made that happen.
Every such edge was a suggestion that could be dropped, with no trace when it was.
Here a Body names the Bodies it pulls in `consults`, which the build resolves.

## Not everything is a skill

The old layout treated everything as a skill, when the things in it were not the same kind of thing and did not want the same triggering.
A Rule fires by trigger, and a Skill and a Reference are reached by name.
So each Body is one of three Kinds, and the Kind is the directory it lives in.

## Settings and instructions in one place

The harness settings once lived in a dotfiles repository that nix owned, and a Body's needs in those settings were met by hand.
Which set of skills was active was recorded nowhere, because the links that made up the active set were git-ignored.
This repository now installs itself, as [record 0004](adr/0004-the-repo-installs-itself-and-the-contract-stays-hand-written.md) decided.
Each harness's Contract lives in `harness/`, `selection.toml` records what is active, and `bun run link` links both into $HOME.

## Related topics

- [How a Rule reaches a harness](how-a-rule-reaches-a-harness.md)
- [Glossary](glossary.md)
- [Decision records](adr/README.md)
