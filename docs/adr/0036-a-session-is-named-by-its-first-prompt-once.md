# 36. A session is named by its first prompt, once

Date: 2026-09-15

## Status

Accepted. Numbered 24 when it was written, which another record already held;
nothing cited it under that number. Records `harness/pi/extensions/session-name.ts`,
whose argument was written in its own header until the `comment-discipline`
sweep (docs/adr/0023) took the prose out of the code.

Amended by 0081: a Firstmate session is named by its role rather than its first
prompt, and a resume applies that name over the one the session carries.

## Context

pi titles its pane `π - <cwd>`, which says where a session is and nothing about
what it is doing. Half a dozen sessions in one repository are then all called
the same thing, and switching between them is a guessing game.

Naming the session moves the title to `π - <name> - <cwd>`. That is the form
the herdr renamer promotes to a tab label, so the topic a tab wears exists only
because the harness says what it is working on.

That leaves two questions the extension has to answer: what the name is made
of, and when it is set.

## Decision

**The name is the session's first prompt on one line, and it is set once.**

- **The first prompt, not a summary of it.** Shortening a task to something a
  tab can wear is the renamer's job, and it already does it, cached per topic
  and retried on failure. Asking a model here would buy the same answer twice
  and let the two disagree.
- **The first prompt only.** A name that followed the conversation would
  rewrite the tab on every turn, and a label is how you find a tab again, which
  a moving one is not. `/name` remains the way to say otherwise.
- **A skill invocation is named as the user typed it.** A skill reaches the
  handler already expanded: the whole Body wrapped in a tag whose first line is
  `<skill name="..." location=...`, which is what the tab would be called if
  the first line were taken as it stands. pi's own parser gives the invocation
  back, so the name is the slash form: the skill, then the user's message where
  there is one.
- **TUI only.** A print or RPC run has no pane whose title anybody reads, and
  the renamer shortens these very names by shelling out to `pi -p`. Naming a
  session in there would be this extension answering itself.
- **A session that already has a name keeps it.** That name was typed by hand
  with `/name`, or carried in by a resume or a fork, and either is worth more
  than a first line.

## Consequences

- The `named` flag is per session rather than per process: `/new` builds a
  fresh runtime and calls the factory again. That constraint is the one line
  the sweep left in the file, because module scope would name only the first
  session of a run and nothing would say so.
- A session whose first prompt is a wall of pasted text wears the first 60
  characters of it. The renamer is what turns that into something readable, and
  a bad tab label is a cosmetic failure rather than a broken session.
