# 62. A separator in a doc is refused at every write, by the kit's prose matchers

Date: 2026-09-25

## Status

Accepted.
Records the write-time half of D2 and all of D4 of the documentation decisions of 2026-09-24, which took every recommendation.
Amends 0051: `forbid` takes `prose` beside `comments`, and a change's `before` is the file as it stands rather than a reader of its text.
Amended by 0071: `writing-for-people` is switched off, and its refusal stands because a Rule the Selection leaves off keeps its refusal.

## Context

D2 enforces the separator ban on the lines a change adds or edits in a living doc, at merge and again at write time, with records and history docs exempt.
The ban covers the em dash, the en dash, the parenthesis and the hyphen used as a dash, and D3 adds the semicolon.
D4 makes the engine one dependency-free matcher in `@avi2dg/checks`, shared by the merge gate and the write-time refusal, because a Dispatcher bundle ships without `node_modules`.

The merge half shipped as the kit's `checks-docs` gate in 0.15.0.
It runs the prose matchers of `scripts/prose-matchers.ts` on the lines a range adds to a living doc or an agent file.
A living doc takes every rule, one sentence per line among them.
An agent file takes the separator and semicolon ban alone.
A session that writes an em dash into a README finds out when `lint` next runs, a push later.

The matchers decide which reader a file has from its path in the repository: its name, and whether it sits under `docs/` or `docs/adr/`.
A harness hands the Dispatcher the path it was given.
Claude Code gives an absolute path, and pi and Codex give one relative to where the session stands.

## Decision

A Rule's `forbid` takes `prose`, and `writing-for-people` carries it.
The prose matcher is the kit's `scripts/prose-matchers.ts`, which every bundle ships as `prose.ts` and `src/prose.ts` re-exports, as 0051 does for `comments.ts`.

A write is judged by the kit's `proseRefused`, on the file as the write would leave it and on the lines the write adds.
That is the call the gate makes on a range, so the two refuse the same files for the same rules.
The refusal is the kit's words, such as ``docs/guide.md:3 carries `—`, an em dash. End the sentence, or use a comma``.

A change's `before` is the file as it stands, built by `standing` in `src/repo-walk.ts` from the absolute path each adapter already resolves.
Its `text` reads the file, and its `inRepository` gives the file's path from the nearest directory above it that holds a `.git`.
The walk is lexical first, because `git rev-parse --show-toplevel` answers with the real path, which a path through a symlinked directory would not sit under.
When no repository holds the path as named, the walk repeats on its real path, which is how a harness's agent file linked into a repository, such as `~/.claude/CLAUDE.md`, is judged as the file it points at.
A file no repository holds is not judged, because no gate can judge it either.

## What was considered and rejected

Refusing only the separators and the semicolon would let a write through that the gate then fails at merge, such as a second sentence on a line of a README.

`writing-for-agents` covers agent files, but it is switched off, so carrying the refusal there would leave `AGENTS.md` unguarded at write time.
An agent file is refused under the name `writing-for-people`.
0061 keeps `writing-for-people`'s triggers off agent files, and this refusal leaves those triggers as they are.

Each adapter setting a new field on a change is the other place the repository path could come from.
Every adapter is over the size budget in `quality.json`, so a change to one starts by splitting it, and `standing` is already where each of them hands over the path.

Copying the matcher into this repository would give the gate and the refusal two engines to keep in step, which D4 rules out.

## Consequences

`forbid` is frontmatter, so the refusal adds nothing to the Rule text a session is charged for.

A people doc that wraps its sentences across lines, as this repository's README still does, refuses an edit that adds a line inside such a paragraph.
The gate fails the same line at merge.

The lookup costs a walk up the directory tree for each write a `prose` Rule sees, and a file is read only when it is a doc the gate judges.
A path no repository holds as named costs a `realpathSync` and a second walk from its real path.
What reaches a file around the write tools is still unseen until the gate runs.
