# 65. Guidance for agent docs is a Reference that a Rule on their paths names, and voice is a Reference too

Date: 2026-09-25

## Status

Accepted.
Records the call on `unslop` and `writing-for-agents` from the review of the skills stale audit, which was to make both References.
Amends 0061: `writing-for-agents` no longer holds `**/{SKILL,AGENTS,CLAUDE}.md`, and the `agent-docs` Rule holds it instead.
Raises the worst-case ceiling that 0038 set.
Narrowed by 0078: the `agent-docs` Rule fires only on `**/SKILL.md`, and the `agents-md-router` Rule holds `AGENTS.md` and `CLAUDE.md`.
Amended by 0087: `unslop` holds the tells of content and voice, and its other catalogues live in other References.

## Context

`selection.toml` switched off the `unslop` and `writing-for-agents` Rules, and no repository's `quality.json` switched either on, so no session received either one.
Two places still named them.
`technical-writing` handed voice to `unslop`, which no agent could reach by name.
`.no-mistakes.yaml` sent the reviewer of every Body to `rules/writing-for-agents/SKILL.md`.

Neither fits as a Rule that every session opens with.
`unslop` is 6,798 bytes, about 1,700 tokens, against the opening ceiling of 1,200 in `tests/budget.test.ts`.
0061 had already given people docs a shape that costs little: the guidance in a Reference, and a short Rule on their paths that names it.

## Decision

`unslop` and `writing-for-agents` are References under `references/`, switched on in `selection.toml`, so the Hub offers both by name.
Their guidance is unchanged.
Each description says when to pull it.
`unslop` is pulled before writing or editing prose a person reads, such as a doc, a commit message or a PR description.
`writing-for-agents` is pulled before creating or editing a `SKILL.md`, an `AGENTS.md` or a `CLAUDE.md`.

The `agent-docs` Rule fires on a write to `**/{SKILL,AGENTS,CLAUDE}.md`.
Its text is one instruction: pull the `writing-for-agents` reference, and hold what was written and what will be written to it.
A Rule and a Reference cannot share a name, so the Rule is `agent-docs`.
No path matches both its glob and a glob of `writing-for-people`.

`technical-writing` lists `unslop` and `writing-for-agents` in `consults`, and `agent-docs` lists `writing-for-agents`.
Switching off a Body that another Body consults stops `bun run generate`, so neither pointer can dangle again without the build saying so.
`.no-mistakes.yaml` sends the reviewer to `references/writing-for-agents/SKILL.md`.

`WORST` in `tests/budget.test.ts` is 3,550.
`agent-docs` costs 35 tokens, which puts the worst case at 3,533 on each harness.
A session still opens at 944.

## What was considered and rejected

Deleting both Bodies would have meant repointing `.no-mistakes.yaml` and every place in `technical-writing` that names them at guidance that would no longer exist.

`unslop`'s old description asked for it before every chat reply.
As a Reference, that asks every session to pull about 1,700 tokens, which is the cost the Selection switched it off to avoid.

A separator in an agent's file is still refused under the name `writing-for-people`, as 0062 decided.
A Rule's `forbid` judges every write the session makes, whatever the Rule's trigger.
A second `forbid: prose` on `agent-docs` would refuse each such write twice.

## Consequences

Every session pays two more descriptions in the Hub listing.
A session pays for a Reference itself only when it pulls one.

The evals for these References are separate work.
An eval case names the Body it measures, and both References keep their names.
`carriageOf` in `src/eval-pi.ts` reads the Body it injects from `rules/`, and the agent runs with `--no-skills`, so no arm can reach a Reference until the runner changes.
