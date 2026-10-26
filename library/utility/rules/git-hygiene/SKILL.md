---
name: git-hygiene
description: "A habit that protects a repository's history: no hand edits to CHANGELOG.md. Use before editing CHANGELOG.md."
kind: rule
source: local
trigger:
  predicate: file-matches
  glob: "**/CHANGELOG.md"
---

# Git hygiene

Never hand-edit `CHANGELOG.md`. Regenerate it through the tool that owns it instead.
