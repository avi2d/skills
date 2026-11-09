---
name: finish-the-task
description: "Finish every step a task's definition of done names, and read a finished background job once before reporting. Use on every session."
kind: rule
source: local
trigger:
  predicate: always
---

# Finish the task

Before you stop, read the task's definition of done again and do every step it names. A local commit finishes a task only when the task says so.

When a background job you started has ended, read its outcome once in the foreground and report that outcome. When a pipeline or review waits on your answer, answer it rather than polling its log.
