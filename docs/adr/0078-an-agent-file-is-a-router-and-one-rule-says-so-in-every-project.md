# 78. An agent file is a router, and one Rule says so in every project

Date: 2026-09-28

## Status

Accepted.
Records the captain's ruling of 2026-09-28 that an `AGENTS.md` is a router, and that one Rule for all projects says so rather than a section copied into every file.
Narrows 0065: the `agent-docs` Rule fires only on `**/SKILL.md`, and `agents-md-router` holds `AGENTS.md` and `CLAUDE.md`.
Amends 0071: the `release-pointer` case that switched `agent-docs` off now measures `agents-md-router`, which every Profile switches on.

## Context

The captain ruled that an `AGENTS.md` is a router.
Every entry points to the file, link or command that holds the detail, notes move into docs a person reads, and the file stays under 3,000 characters.

Every repository's `AGENTS.md` still ended with a `## Maintaining this file` section.
It called the file a store of knowledge for future sessions, which contradicts the ruling.
The kit's `AGENTS.md` template required the section word for word, so each repository carried its own copy, and every session loaded it.

Under 0065 the `agent-docs` Rule fired on `**/{SKILL,AGENTS,CLAUDE}.md` and sent the session to the `writing-for-agents` reference.
0071 switched `agent-docs` off, because `release-pointer` passed 5 of 5 in both arms on every model.

## What was considered and rejected

- **Correcting the section's text in the kit's template.** Every repository would still carry a copy of the same guidance, and each copy would need a rollout whenever the wording changed.
- **Leaving the router to `writing-for-agents`.** A Reference reaches a session only when it pulls one, and `agent-docs`, the Rule that named it on these paths, is off.
- **Leaving `CLAUDE.md` out.** In these repositories a `CLAUDE.md` is the same kind of agent file, and the kit's check holds both.
- **Allowing any command as a pointer.** The kit's check accepts a `bun run` command, and every repository in the fleet uses bun, so a broader wording would promise what the check refuses.

## Decision

The `agents-md-router` Rule fires on a write to `**/{AGENTS,CLAUDE}.md`.
Its text says that an agent file is a router, that every entry names the file, link or `bun run` command holding the detail, and that explanations live in the README or a page under `docs/`.
`selection.toml` switches it on in every Profile, `ollama-qwen` included.

The kit's `checks-docs` holds the decidable half of the ruling: the 3,000-character ceiling, and that every entry points somewhere.
The Rule carries only the judgment a check cannot make, which is where an explanation belongs.

`agent-docs` fires only on `**/SKILL.md` and stays off, as 0071 decided.
Its description names `agents-md-router` for the paths it gave up.
This repository's `AGENTS.md` drops the `## Maintaining this file` section.

The Rule is on although `release-pointer`, its only case, passed 5 of 5 in both arms for `agent-docs`.
0071 switched a Rule off when the context it spent bought nothing.
This Rule replaces a section that every session loaded with a Rule that fires only when a session writes an agent file, so it spends less context than the section it replaces.
Its text also differs from what the sweeps injected: they measured `agent-docs` sending the session to `writing-for-agents`, not a statement of the router.
It is on by the captain's ruling that the router is a rule for all projects, not on eval evidence.

## Consequences

A session that never writes an agent file pays nothing for the Rule.

Kit 0.29.0 drops the section from its `AGENTS.md` template, and its `checks-docs` refuses any `## Maintaining this file` heading in an agent file.
A repository that upgrades to 0.29.0 fails `checks-docs` until it deletes the section.
The `agents-md-kit-rollout` task makes that upgrade and deletion in every other repository.

No sweep has measured the Rule's own text yet.
A sweep of `release-pointer` under `agents-md-router` is the evidence a later record would read, whether to keep the Rule on or to switch it off.
