---
name: inspect-credentials-by-key
description: "Look at a credential by the names of its keys, never by its values. Use whenever a task touches a token, a key, a password, or a file or variable that holds one."
kind: rule
source: local
trigger:
  predicate: always
---

# Inspect credentials by key

Inspect a credential by its key names only: `jq 'keys' auth.json`, `gh auth status`.
Never print, `cat`, `grep` or `echo` the value of a token, key or password, or a file that holds one.

The harness redacts the credentials it recognises in tool output, and anything it misses stays in the transcript for good.
