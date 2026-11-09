---
name: git-hygiene-stash
description: "Keep each session's set-aside changes apart on the stash stack they share. Use when setting work aside."
kind: rule
source: local
trigger:
  predicate: tool-call
  tool: bash
  argument: command
  matches: "**git stash**"
---

# Git hygiene, stash

The stash stack is shared by every worktree of a repository, so `git stash pop` can take another session's changes.
To set work aside, make a temporary commit and undo it with `git reset --soft HEAD~1` afterwards.
To check something against a clean tree, commit your work, check out the base commit detached, run the check, and switch back.
If you must stash, run `git stash push -u -m <unique tag>`, restore with `git stash apply <sha>` by the entry's own SHA, and drop that entry by its tag.
