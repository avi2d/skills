---
name: guard-the-context-window-spark
description: How to read a slow command's output from a file instead of running the command again. Use on every Spark session.
kind: rule
source: local
trigger:
  predicate: always
---

# Guard the context window on Spark

Read a long log or a wide command's output where it can be filtered, summarised, or grepped for the lines that answer the question, and bring back the summary rather than the whole log.

Send the output of a command that runs longer than a minute to a file, then read and filter that file as often as the question needs.
Run the command again only after a change it can see, or to tell a flaky result from a real one, and then run only what failed.

Context spent inside a session cannot be spent again, and neither can the machine's time on a run whose output is already on disk.
