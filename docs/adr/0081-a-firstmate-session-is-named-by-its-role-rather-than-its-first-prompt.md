# 81. A Firstmate session is named by its role rather than its first prompt

Date: 2026-10-04

## Status

Accepted.
Amends 0036: a Firstmate session is named by its role rather than its first prompt, and a resume applies that name over the one the session carries.

## Context

Most work now runs through Firstmate, which drives pi in two roles.
The main session opens with a `FIRSTMATE_OP: v1 session-start:` digest, either appended to the first prompt or returned as a message of its own.
A worker opens with a `FIRSTMATE_OP: v1 launch-brief:` prompt that names its steering inbox, `.../state/<task>.inbox`.

Named by its first prompt, the main session wore its opening message in the footer long after the conversation had moved on, and the tab wore a shortened copy of it.
A worker wore the first line of its launch brief, the same operational prefix in every worker, in both places.

## Decision

**A Firstmate main session has no name, and a worker is named after its task.**

- **The main session has no name.** pi then titles its pane `π - <cwd>`, so the tab shows the folder and the footer shows no name.
- **A worker is named after its task**, the `<task>` of its inbox path, which is already short enough for a tab and the footer.
- **A resume applies the role's name.** On `session_start` the extension reads the branch, clears the name of a main session and renames a worker to its task, because a name carried in by a resume was written before this rule and is the stale label it replaces.
- **The name is read from the branch at the first `context` event**, not from `before_agent_start`, because the digest another extension returns from `before_agent_start` reaches the branch only after that event.

Every other session is named as 0036 records: its first prompt on one line, set once, and kept when it already has a name.

## Consequences

- `/name` in a Firstmate session lasts only until the next resume.
- The prefixes the extension matches are Firstmate's wire format, and a change to them on Firstmate's side turns its sessions back into ones named by their first prompt.
