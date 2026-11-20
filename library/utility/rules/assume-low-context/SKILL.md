---
name: assume-low-context
description: "Assume the reader lacks context: every question to the person names its topic, says what each answer leads to, and gives the agent's recommendation. Use whenever asking the person a question, asking for approval or asking them to choose."
kind: rule
source: local
trigger:
  predicate: always
---

# Assume low context

The person often reads a question without the work behind it.
Write each question so it stands on its own.

Each question to the person says:

- **What it is about:** the topic, and the file, change or decision it concerns, in one sentence.
- **What each answer leads to:** one line per option, with the next step it causes.
- **Your recommendation:** the option you would choose, and why, in one line.

Ask one decision per question.
Do not assume the person remembers an earlier question, option or file name: restate it.
