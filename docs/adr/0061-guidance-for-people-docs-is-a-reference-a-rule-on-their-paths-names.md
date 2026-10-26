# 61. Guidance for people docs is a Reference that a Rule on their paths names

Date: 2026-09-25

## Status

Accepted.
Records D1 of the documentation decisions of 2026-09-24, which took every recommendation.
Amends 0012, whose case was `technical-writing` firing on a Markdown file, a commit and a pull request.
`technical-writing` is now a Reference and fires on nothing.
Amended by 0065: `writing-for-agents` is a Reference too, and the `agent-docs` Rule holds `**/{SKILL,AGENTS,CLAUDE}.md`.
Amended by 0087: `technical-writing` holds the shape of a doc file and routes other text, and its sentence layers live in other References.
Amended by 0097: `writing-for-people` is in force from every prompt and carries a short core of `technical-writing` and `unslop` for every text a person reads.

## Context

A session writing a README or a page under `docs/` received no writing guidance, because `technical-writing`, `writing-for-agents` and `unslop` were all switched off.
Switching `technical-writing` on as it stood measured 6,084 tokens against the worst-case ceiling of 3,500 in `tests/budget.test.ts`.
It also fired on every `.md` file, `AGENTS.md` and `SKILL.md` included, which `writing-for-agents` covers for a different reader.
Its Global English layer allowed parentheses, which the separator ban in `unslop` forbids.

From 0.13.0 the `@avi2dg/checks` kit ships a template for each doc file.
Its `checks-docs` gate holds every doc file a change touches to that template.

## Decision

`technical-writing` is a Reference, pulled by name.
It holds the guidance in the order a writer of a people doc meets it: the page type, the template, titles, the sentence layers, punctuation, saying what is true now and one sentence per line.
It names `node_modules/@avi2dg/checks/templates/` and copies no template, so the kit is the one source.
`bun run docs` writes the Reference's list of templates from the installed kit's templates directory, and `tests/docs.test.ts` fails when the committed list and the kit disagree.
What `checks-docs` holds, such as a template's sections and the titles it bans, is left out of the prose.

The `writing-for-people` Rule fires on a write to `**/README.md` or `**/docs/**/!(SKILL|AGENTS|CLAUDE).md`.
A `file-matches` Rule arrives after the write, so its text is one instruction: pull the `technical-writing` reference, and hold what was written and what will be written to it.
`writing-for-agents` keeps `**/{SKILL,AGENTS,CLAUDE}.md`, so people and agents stay separate readers with separate guidance.
The glob language takes a `!(a|b)` exclusion for this, and no path matches both Rules' globs.

A people doc takes one sentence per line.
Its prose uses periods and commas, with no em dash, en dash, parenthesis, hyphen used as a dash or semicolon.
The ban stays prose in the Reference until a check holds it.

## Why each glob starts with `**/`

Claude Code hands the Dispatcher the absolute path of a file it writes, and the Dispatcher matches a glob against the path as the harness gives it.
A glob anchored at the repository root, such as `docs/**/*.md`, would never match on Claude Code.
`**/README.md` matches the root `README.md` and a nested one alike.

## What was considered and rejected

Switching `technical-writing` on as it stood, and raising the ceiling to about 6,100 tokens, charges every session that writes any Markdown for 1,850 words.
A guidance page in each repository with no Rule is read only when something sends an agent to it.

## Consequences

Every session pays the Reference's description in the Hub listing.
Only a session that writes a people doc pays for the Reference itself.
The Rule costs 37 tokens, which puts the worst case at 3,498 of 3,500 on each harness.

A `quality.json` that switches `technical-writing` on names a Rule the index no longer carries.
The README's example of `agentRules` does that, and it stays wrong until the README is rewritten to its template.
