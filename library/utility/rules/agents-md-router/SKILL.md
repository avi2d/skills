---
name: agents-md-router
description: "Routes each fact to the file that owns it, with a what goes where table for README.md, AGENTS.md, VISION.md and ADR records. Fires on those paths wherever they sit, and never on a SKILL.md, which agent-docs covers."
kind: rule
source: local
trigger:
  - predicate: file-matches
    glob: "**/{AGENTS,CLAUDE}.md"
  - predicate: file-matches
    glob: "**/README.md"
  - predicate: file-matches
    glob: "**/VISION.md"
  - predicate: file-matches
    glob: "**/docs/adr/*.md"
---

# Agent file router

An `AGENTS.md` or `CLAUDE.md` is a router, not a manual. Every entry names the file, link or `bun run` command holding the detail. Explanations live in the README or a page under docs/, never here. The checks kit holds the shape: 3,000 characters at most, and every entry points somewhere.

Put each fact in the file that owns it.

| File | Answers | Never holds |
| --- | --- | --- |
| `README.md` | What it is and how to use it | Why it refuses things |
| `AGENTS.md` | How to work in this code | Purpose or direction |
| `VISION.md` | Whether a change belongs, and the principle that decides it | Features, commands, layout, tech stack, or coding rules |
| `docs/adr/` | Why one specific decision was made | Standing principles |
