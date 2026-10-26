---
name: git-hygiene-co-author
description: "Leave the agent's name off a commit's `Co-Authored-By` trailer. Use when committing."
kind: rule
source: local
trigger:
  predicate: tool-call
  tool: bash
  argument: command
  matches: "**git commit**"
---

# Git hygiene, co-authorship

Never add the agent's own name as a `Co-Authored-By` trailer in a commit message.
