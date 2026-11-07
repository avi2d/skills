---
name: credential-files
description: "Read a file that holds a secret by its key names only. Use on every session."
kind: rule
source: local
trigger:
  predicate: always
---

# Credential files

Read a file that holds a secret by its key names only, such as `jq 'keys'` on a JSON file, or ask the tool that owns it, such as `gh auth status`.
What a tool prints stays in the session transcript as it stands, so a value printed once is a value leaked.
This holds for every such file, `.env` included, beyond the ones the harness refuses to read.
