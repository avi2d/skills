---
name: guard-the-context-window
description: How to read a long log or a wide command's output without spending the session's context on it. Use on every session.
kind: rule
source: https://github.com/cursor/plugins@fd6dd6f7276956a532bb78a748a8d2818b6eb5f4
trigger:
  predicate: always
---

# Guard the context window

Read a long log or a wide command's output where it can be filtered, summarised, or grepped for the lines that answer the question, and bring back the summary rather than the whole log.

Send the output of a command that runs longer than a minute to a file, then read and filter that file as often as the question needs.
Run the command again only after a change it can see, or to tell a flaky result from a real one, and then run only what failed.

Context spent inside a session cannot be spent again, and neither can the machine's time on a run whose output is already on disk.
