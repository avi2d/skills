---
name: grilling
description: "Grill a project's goal or design with the person until you share one understanding, and keep their actual answers in that project. Use when a person asks to grill or interview an idea for a specific project."
kind: skill
source: https://github.com/mattpocock/skills@c55ee46073ed923f86ce59a5eb3b6d895095d1b7
consults:
  - technical-writing
---
# Grilling

The person owns decisions. An agent researches facts, proposes questions and recommendations, and records the answers the person actually gave. If the project is not yet identified, establish its identity before placing any project files.

## Work the decision tree

1. Name the destination and the boundary of the interview. Read the target project's existing goals, decisions, and code before asking what those sources can answer. Investigate missing facts yourself or ask an agent to investigate them; only questions dependent on those facts wait. Do not present a factual lookup as a decision.
2. Map decisions and their prerequisites. The **frontier** is every decision whose prerequisites have settled. Ask the whole frontier in one round, numbered, with a clear recommended answer and alternatives for each question.
3. Present the round on one Lavish page. The page sends the round as one prompt through `window.lavish.queuePrompt`, tagged `choice`, carrying every question ID with its selected option and any answer note, because a page that never calls `queuePrompt` delivers nothing and a selected control is not a submitted answer. The interview's owner shows the page to the person and routes the submitted prompt back to you.
4. Preserve the person's selected words. Keep disputed, skipped, or ambiguous answers open; ask for clarification instead of silently choosing the recommendation. Recompute the frontier from settled answers and facts after each round. The next round must not be a prewritten list.
5. At an empty frontier, show the person the complete decision recap, the open constraints, and any excluded work. Ask them to confirm that you share the same understanding. Stop without implementing or starting the project work.

## Keep the record with the project

Write a reviewed Q&A in `docs/interviews/<topic>.md`: each numbered question, the recommendation, the actual selected answer and note, evidence when relevant, the round, and what remains open. Write the confirmed destination, boundaries, non-goals, and settled constraints in `docs/goals.md`. Link the goals to the Q&A, rather than replacing the actual answers with a summary. The board's raw transcript is not the project record. If the target repository is not yet available, ask the person where to keep a private draft, and move it into the repository only after its owner and contents are confirmed.

Both `docs/goals.md` and `docs/interviews/<topic>.md` are **reference** pages. A decision merits `docs/adr/NNNN-<topic>.md` only when it is hard to reverse, surprising without its context, and the result of a genuine trade-off. Start each page from the kit's template for its kind; the `technical-writing` reference says where to find the templates. Record project terminology in its existing glossary convention only when the person settles a real term.

Before handing off, check that the saved Q&A matches every captured answer and note, that the goals agree with those answers, and that nothing marked open reads as decided. The interview is complete only after the person confirms the recap and the reviewed files carry that understanding.
