---
name: writing-for-people
description: "Holds every text a person reads to a short core of the technical-writing and unslop references: a README, a page under docs/, site copy, UI messages, a PR description and a commit message, in any language. It is in force from the prompt, so it reaches a commit message or a PR body before the command that carries it runs. Refuses at every write what the checks kit's docs gate would fail on the lines it adds to a living doc or an agent file."
kind: rule
source: local
consults:
  - technical-writing
  - unslop
trigger:
  predicate: always
forbid: prose
---

# Writing for people

This holds for every text a person reads: a README, a page under docs/, site copy, UI messages, a PR description and a commit message, in any language.
An AGENTS.md, a CLAUDE.md and a SKILL.md are written for agents, and this leaves them alone.
Keep every fact the task gave, and say what is true now.
Write about the subject, never about the page, and in a change message say what changed and why.
On a page, title each section by the task it holds, in sentence case, and put one sentence on each line.
Name the mechanism or a number, never a feeling, state what happened in neutral words, and name the source of every claim.
Use no dash, parenthesis or semicolon, no serves as, no passive with by, no inline-header label and no chatbot framing.
Hold the text to the `technical-writing` reference and the `unslop` reference for the rest.
