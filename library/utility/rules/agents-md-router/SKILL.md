---
name: agents-md-router
description: "States what an AGENTS.md or CLAUDE.md is: a router whose entries name the file, link or command holding the detail. Fires on an AGENTS.md or a CLAUDE.md wherever it sits, and never on a SKILL.md, which agent-docs covers."
kind: rule
source: local
trigger:
  predicate: file-matches
  glob: "**/{AGENTS,CLAUDE}.md"
---

# Agent file router

An `AGENTS.md` or `CLAUDE.md` is a router, not a manual. Every entry names the file, link or `bun run` command holding the detail. Explanations live in the README or a page under docs/, never here. The checks kit holds the shape: 3,000 characters at most, and every entry points somewhere.
