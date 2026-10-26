---
name: technical-writing
description: "Where writing guidance starts: which writing Reference each kind of text takes, and the shape of a doc file, its page type, the kit's template, headings, what is true now, one sentence per line and diagrams. Pull before writing a README, a page under docs/, a commit message, a PR description, or Russian site and product copy, finding explanations, client letters or UI strings."
kind: reference
source: https://github.com/cursor/plugins@fd6dd6f7276956a532bb78a748a8d2818b6eb5f4
consults:
  - plain-sentences
  - plain-words
  - punctuation
  - unslop
  - russian-prose
  - writing-for-agents
  - interface-copy
---
# Technical writing

Each principle in the writing References has its own heading and is stated in one place only.
This reference holds the shape of a doc file, and the table below sends every kind of text to the References it takes.

## Pull the References the text takes

| Text | References |
| --- | --- |
| A README or a page under `docs/` | this one, `plain-sentences`, `plain-words`, `punctuation` and `unslop` |
| A PR description, a commit message or a report | `plain-sentences`, `plain-words`, `punctuation` and `unslop` |
| English UI strings | the product's own copy guidelines and `interface-copy` |
| Russian text of any kind above | `russian-prose`, beside the References that kind takes |
| An `AGENTS.md`, a `CLAUDE.md` or a `SKILL.md` | `writing-for-agents` |

## Fix a sentence a principle made worse another way

The principles serve the reader.
When following one makes a sentence worse, fix the sentence another way or leave it alone.

## Pick the page type

A README is one page of typed topics in the order its template sets: a concept, tasks, a reference table and troubleshooting.
A page under `docs/` is one Diátaxis mode, and it names that mode in `kind` front matter.
`checks-docs` refuses a page with none.

## Pick the mode with the compass

Two questions pick a mode: does the content serve doing or thinking, and does it serve learning or work?

- Doing and learning: **tutorial**.
- Doing and work: **how-to**.
- Thinking and work: **reference**.
- Thinking and learning: **explanation**.

Use the compass on a whole document or on one sentence, whenever you are unsure what you are writing.

Source: diataxis.fr, fetched 2026-07-18.

## A tutorial gives a visible result at every step

You are the teacher, and the learner's success is your job.
Open by saying what the learner will build.
Every step produces a visible result, early and often, and you tell the learner what they should see: the expected output, the prompt change, the log line.
Cut explanation to one clause and a link.

## A how-to takes a competent reader to their goal

Solve a problem a person has, not an operation the machine can perform.
Assume competence and give the actions only, linking background and completeness elsewhere.
Allow forks and judgment: "If you want x, do y."

## A reference page describes the thing in its own structure

Describe and only describe: facts, options, limits and errors.
Mirror the structure of the thing described, so code and docs can be navigated together, and put material where readers expect it.
Generate it from code where possible, so it stays true.

## An explanation answers one real why

Keep to one bounded topic, readable away from the product, whose title tolerates an implicit "About..." in front.
Anchor on a real why question, and give the context: design decisions, constraints and the alternatives that lost.

## Keep one mode on a page

Content of another mode moves to a page of that mode, and the two pages link where they meet.

## Put opinion only where the page type allows it

Opinion belongs on an explanation page, in a decision record, and in the recommendation of a report or a PR description.
A README, a how-to and a reference page state facts.

## Start from the kit's template

A doc file starts from the template the `@avi2dg/checks` kit ships for it.
`checks-docs` holds every doc file a change touches to its template: the title, the sections and their order.
Read the template before writing, rather than recalling it.
Fill a template slot only from what the source or the notes hold, and leave the slot out when they hold nothing.

In a repository that installs the kit, read them in `node_modules/@avi2dg/checks/dist/templates/`, where the package's `@avi2dg/checks/templates/*` export points.
Anywhere else, run `npm pack @avi2dg/checks` in a scratch directory and read `package/dist/templates/` out of the tarball.
Each template is named for the kind of file it shapes: `readme.md` for a README, `changelog.md` for `CHANGELOG.md`, `adr.md` for a decision record in `docs/adr/`, and a page under `docs/` takes the template named for its mode.
The release writes `CHANGELOG.md`, never a person.
The kit ships these:

<!-- `bun run docs` writes the list below from the installed kit's templates directory. -->
- `adr.md`
- `agents.md`
- `changelog.md`
- `claude.md`
- `explanation.md`
- `how-to.md`
- `readme.md`
- `reference.md`
- `tutorial.md`
<!-- The list above ends here. -->

## Title a heading by what the reader does or looks up

Use a verb phrase for a task: "Calibrate the radar array", not "Radar array calibration".
Use a noun phrase for a concept or a reference, and the symptom or the error text for a troubleshooting topic.
A heading carries the point, not just the topic: "Pick the page type", not "Modes".
Write it in sentence case.

## Talk about the subject, not the page

Open with the subject itself: "`budget.mjs` counts the files that import protos", not "This page explains the budget script".

## Say what is true now

Describe what the code does at this commit.
Where later work is tracked, link the issue rather than writing "until #N", "is planned" or "will soon".

## Keep history out of a living doc

A living doc names nothing by a former name and carries no migration table and no "used to".
What changed goes in the commit, which the changelog links, and a decision that needs its reasons kept goes in a decision record.

## Change the doc in the commit that changes the behaviour

The commit that changes a behaviour also changes every doc that describes it.

## Make every count true at the commit

Make every count or tree claim true at the commit that lands it, beside the command that regenerates it.

## Put one sentence on each line

End the line where the sentence ends, and never wrap a sentence across lines.
A changed line is then a changed sentence.
This holds for a doc file, not for a PR description, a commit message or a UI string.

## Draw where a picture reads faster

Draw a diagram where a flow, a sequence, a state machine, or a before and after reads faster than prose.
Write it as Mermaid in a GitHub PR or issue description, and in an investigation report, where GitHub renders it at no new cost.
Draw it as hand-authored inline SVG on a Lavish board, following the diagram playbook that `lavish-axi playbook diagram` prints.
The one exception on a Lavish board is a diagram that may need editing: author it as Mermaid in a `.mermaid` container, which Lavish turns into an editable Excalidraw whiteboard, with the snippet from `lavish-axi design`.
