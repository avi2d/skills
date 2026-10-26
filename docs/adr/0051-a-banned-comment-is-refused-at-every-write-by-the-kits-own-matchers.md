# 51. A banned comment is refused at every write, by the kit's own matchers

Date: 2026-09-24

## Status

Accepted. Records the `forbid` field on a Rule, `src/forbid.ts`, the core's
`refuse` action, and the checks kit's `scripts/comments.ts` shipping in every
Dispatcher bundle. Amends 0044: `@avi2dg/checks` moves from `devDependencies`
to `dependencies`, because a Dispatcher now ships one of its files. Follows
0025, which made the three banned forms a program, and stands beside 0019,
whose mid-turn refusal fires once per Rule per session.
Amended by 0059, which ships the kit's `scripts/comment-matchers.ts` in
place of its `scripts/comments.ts`, now written in Effect.
Amended by 0062, which adds `prose` to `forbid` and turns `before` from a
reader of the file's text into a `Standing` that also names the file's path in
its repository.

## Context

`comment-discipline` bans three forms in a comment: a machine-read directive, a
record or ticket pointer, and a doc block. A program decides all three, but the
program runs after the write: `checks-comment-gate` over a diff in `lint` and
in CI, and the suite over the whole tree. A session that writes
`@ts-expect-error` finds out when one of those next runs, minutes or a push
later, and by then the line is under whatever was built on it.

The Dispatcher sees every write before it lands, on all three harnesses, and it
already refuses one kind: 0019 turns a mid-turn `deliver` into a denial whose
reason is the Rule. That refusal counts the Rule as injected, so the next write
goes through. It is a way to deliver a Rule, not a guard.

What each harness offers, measured on this tree:

- **pi 0.87.1.** A `tool_call` handler may return `ToolCallEventResult`, whose
  `block` and `reason` the agent loop turns into an error tool result carrying
  `reason` as its text. The handler receives the arguments after pi has prepared
  them, so an `edit` arrives as `edits[]` even when the model sent the older
  single `oldText`.
- **Claude Code and Codex.** `PreToolUse` answering `permissionDecision:
  "deny"` with a `permissionDecisionReason`, which both adapters already emit.

Two copies of the matchers were in use. The suite scanned the tree with
`tests/lib/comments.ts`; `lint` ran the kit's `scripts/comments.ts`, at 0.4.0.
They had drifted: the kit's copy knows a `'` that opens mid-word in JavaScript
and YAML, a `//` that only opens a comment at the start of a word, and an
opening block made only of comments that begin their line, and its `refused`
takes the set of lines to judge. Run against every test the local copy was
written for, the kit's passed all of them but one, which named the file path in
an error message.

## Decision

**A Rule may name the matchers it forbids by, and the Dispatcher refuses every
write that adds what they refuse.** `comment-discipline` carries `forbid:
comments`. The generator refuses a name outside `FORBIDS`, the index carries the
name, and each adapter refuses an index naming one it does not know.

**The refusal stands.** Every tool call that changes a file is judged against
every Rule in the index that forbids, whether or not the Rule is in force yet,
whatever a Profile cut, and without recording anything, so the same write is
refused however often it comes. The three forms are banned wherever the Rule is
active, and the matchers already decide which files they read. A refusal tied
to injection would miss the writes before a session's first prompt and every
write in a session whose `repo-contains` never fired.

**The matchers are the kit's, and nothing holds a copy.** `src/comments.ts`
re-exports the kit's file, and each bundle copies
`node_modules/@avi2dg/checks/scripts/comments.ts` in as `comments.ts`. So
`./comments` reaches the same bytes from `src/` and from a linked Dispatcher,
and the bundle still copies every file verbatim. The suite reads the kit's file
too, and `tests/lib/comments.ts` is deleted. The refusal at the write, the gate
at the push and the scan of the tree are now one program.

**A write is judged on the lines it adds or changes.** An adapter hands the
core a way to read the file as it stands, which the core calls only once a Rule
forbids something and its matcher reads that path, and the write: whole content
for Claude Code's `Write`, pi's `write` and a Codex `Add File`, or replacements
for Claude Code's `Edit` (with `replace_all`), pi's `edits[]` and each hunk of
a Codex `Update File`. A Claude Code `Edit` with an empty `old_string` on a
file that is not there creates it, so its new text is judged as the whole file;
a pi edit or a Codex hunk on a file that is not there is one its harness
refuses. The core places every replacement against the file as it stands, not
against what an earlier replacement made of it. A pi or Claude Code replacement
is placed where its text stands. One whose text stands more than once and that
does not replace every copy, counted as pi counts under its loosest reading and
as Claude Code counts under the reading that placed it, is one its harness
refuses, and so is one with no old text on a file that holds anything, or in pi
on any file. A Codex hunk is placed as Codex's `apply_patch` places it: on
whole lines only, searching from the line after the previous hunk, or after the
`@@` line it names, so text that also stands inside an earlier line, in a
string for instance, is never where it lands. A hunk whose `@@` line is not
there is logged as unjudged, as Codex refuses to apply it. A hunk its patch
closes with `*** End of File` is sought only at the file's last lines, and one
whose old text ends in a blank line that matches nowhere is sought again
without that line, in its old and new text both, as Codex seeks them. A Codex
hunk with no old lines is added at the end of the file, where Codex adds it,
and one with no new lines removes the lines it matched, newlines and all; a
hunk's single blank old line is a line to seek, not no old text. The core
counts a line of a whole-content write as added when the file did not already
hold that many copies of it, whatever its line ending. A line an edit writes is
added when the run of lines the edits replaced around it did not hold that many
copies of it, and a line no edit touches is never added, whatever an identical
line elsewhere in the file holds. A changed line is an added one. The kit's
`refused` then judges the file as the write would leave it, reporting a comment
when any of its lines was added, which is the rule its gate applies to a diff.
So a comment on a line the write leaves alone is never refused, and one on a
line it changes is judged whole, however much of it the file already held.

**An edit is placed where its harness would land it, and one that cannot be
placed is logged, not guessed at.** When an edit's old text is not in the file
exactly, the core retries it with the same looser readings its harness tries
next, in that harness's order. For pi's `edit`, that is NFKC, then trailing
whitespace stripped from every line, then smart quotes, dashes and odd spaces
turned into ASCII. For Codex's `apply_patch`, lines trimmed at the end, then at
both ends, then the same punctuation turned into ASCII. For Claude Code's
`Edit`, the four curly quotes made straight. pi and Claude Code apply a reading
to the whole write, as pi does, and the first that places every edit is the one
used. Codex tries each hunk with every pass in turn, over every line from where
it searches, before the next pass, as its `seek_sequence` does. A reading
decides only where each edit lands. The write is judged as its harness leaves
the file, against the file as it stands: every line an edit does not touch
keeps its own bytes, because a curly quote made straight on such a line can
open a string that hides an added comment. pi writes the lines an edit touches
as its reading made them, and Codex replaces the lines it matched with the
hunk's new lines. Claude Code's reading maps each character to one, so its
`Edit` writes in the file's own bytes, and curls the straight quotes in its new
text when the text it matched was curled, as the core does too. Which lines
were added is counted through the reading that placed the write, the loosest
pass any Codex hunk needed, on both the file as it stands and the file it
leaves, so a line the edit only carries over is not counted as added because
its harness rewrote its trailing space or its quotes. If no reading places an
edit, its harness would refuse it, two edits overlap, or the file cannot be
read, the core logs `unjudged <rule>: ... so what it adds went unread` and
refuses nothing. The verb is its own, not `broken`, because the Rule was not
lost: the dispatch report reads a `broken <rule>` line as a session losing that
Rule, and a write the core could not place says nothing about whether the Rule
arrived. Judging the fragment by itself would name the wrong line, and would
misread a fragment that starts inside a string or a block comment. Refusing a
write on a guess blocks the session for nothing, and the gate at the push still
judges it.

**Each harness refuses with the primitive it has.** The core says `refuse` with
the text: the Rule's name, then the matchers' own lines, each naming the file,
the line, the token and what to do instead. Claude Code and Codex deny the
call with that text as the reason; pi returns it as `block` and `reason`.

**The kit is a dependency.** With it in `devDependencies`, `lint:deps` fails:
`not-to-dev-dep: src/comments.ts → node_modules/@avi2dg/checks/scripts/comments.ts`.
Source a Dispatcher ships relies on it, which is the case the rule describes.

## Consequences

- The Rule's text says the writes are refused, and leaves the agent to hold only
  what reaches a file around the write tools, such as a shell redirect, which
  no Dispatcher sees.
- Generating needs `node_modules`, because a bundle reads the kit's file from
  there. A clone runs `bun install` before `bun run link` or `generate`
  already, and the suite's stand-in clones now carry the installed tree the
  same way.
- Copies of lines are counted, not diffed. A line that only moved within what
  an edit replaced, or anywhere in a whole-content write, is not added. When a
  whole-content write adds one more copy of a line the file already held, the
  copy counted as added is the last one, so the line a verdict names can be the
  older copy, and an older copy in a string can hide the new one.
- Claude Code's `Edit` also decodes `\uXXXX` escapes in the old text, and this
  core does not. Such an edit lands, and the log says it went unread.
- Codex is not installed on the machine this was built on. The patch shape the
  adapter reads is the one 0022 recorded from a real `codex exec`.
- Claude Code 2.1.280 still names `MultiEdit`, but only in its permission tables,
  beside the retired `LS` and `NotebookRead`. The adapter reads `Write` and
  `Edit`, the tools its `writes` already reads. `NotebookEdit` writes notebooks,
  which the matchers do not read.
- A second set of matchers is a name in `FORBIDS`, an entry in `MATCHERS`, and
  its module in every bundle.

## What was considered and rejected

- **A `file-matches` trigger on the Rule.** That is 0019's delivery. It refuses
  the first write and lets the second through, whatever it carries.
- **Moving `tests/lib/comments.ts` into `src/`.** One copy fewer in the suite,
  but the Dispatcher would refuse by a program the gate no longer runs, and the
  two would keep drifting.
- **Rewriting the kit's specifier inside the bundle.** A bundle that edits
  source is a second place the shipped code can go wrong. The re-export keeps
  the copy verbatim.
- **Resolving the kit through module resolution at bundle time.** That reads
  the generator's own install rather than the repository's, and every other
  entry in a bundle is a path in the repository.
- **Refusing only while the Rule is in force.** See the standing refusal above.
