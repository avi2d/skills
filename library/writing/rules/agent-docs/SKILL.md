---
name: agent-docs
description: "Sends a session that wrote a SKILL.md to the writing-for-agents reference. Fires on a SKILL.md wherever it sits, and never on an AGENTS.md or a CLAUDE.md, which agents-md-router covers, or a README or a page under docs/, which writing-for-people covers."
kind: rule
source: local
consults:
  - writing-for-agents
trigger:
  predicate: file-matches
  glob: "**/SKILL.md"
---

# Agent docs

A session wrote a SKILL.md. Pull the `writing-for-agents` reference, and hold what was written, and what will be written, to it.
