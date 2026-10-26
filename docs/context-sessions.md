---
kind: how-to
---
# Read stored session context

Use the reader to compare opening input across pi, Claude Code and Codex sessions without recording new messages inside those tools.

## Before you begin

- Install the repository with `bun install`.
- Install `sqlite3` on the machine that runs the reader.
- Keep the tools' own session stores at `~/.pi/agent/sessions`, `~/.claude/projects` and `~/.codex/sessions`.

## Index sessions

To index stored sessions:

1. Run `bun run context-index`.
1. Check the counts printed by the command: sessions indexed, unchanged, without a provider request and unreadable.
1. Run `bun run context-report`.
1. Open `context-report.html` in the state directory as a file in a browser, or read `context-report.md` beside it.

The state directory is `$XDG_STATE_HOME/skills`, or `~/.local/state/skills` when `XDG_STATE_HOME` is unset, the same directory the Dispatchers write their log to.
The index at `context.sqlite` in the state directory keeps what each session file and the Dispatcher log say about it: part names, character counts, provider usage and the names of the Rules that reached a pi session, but no message text.
The reader skips Claude Code subagent transcripts, because they are not sessions of their own.
On a later run, the reader decodes only session files that are new, changed in size or modification time, or indexed by an older version of the reader.
It stores nothing it takes from this tree: the report sizes each Rule from its current body and picks each session's Profile from the current `selection.toml` every time it runs.
So an edit to a Rule body or a Profile shows in the next report without a new index run, for a session its tool has since deleted as much as for one still on disk.
Deleting an original session does not delete its existing index row.
A row an earlier reader wrote for a subagent transcript is dropped only while the reader still finds that transcript on disk, and once the tool removes the file the row stays like any other.
To discard the index and reread the sessions still available, run `bun run context-index --rebuild`.
The rebuild cannot recover a session that its tool has already removed.

## Interpret the numbers

The opening input is a session's first request's uncached input plus cache reads and cache writes.
A session file with no provider request never sent an opening, so the reader does not index it and counts it apart as without a provider request, and the report leaves it out.
The reader keeps no row for such a file, so it decodes the file again on every run, and it drops the row an earlier reader wrote for one.
pi stores a failed provider call with zero usage, and the reader does not count it as a request.
Codex reports cached input as part of input, so the reader subtracts it before keeping the columns separately.
A part's character percentage describes its share of captured characters, not its share of provider tokens.
The first message has a character count but no independently measured token count.
Some tools do not store their system prompt or built-in tool definitions, so the reader leaves missing content unmeasured instead of distributing its tokens among visible parts.
The report lists input growth and character changes between sessions of the same tool, model, repo and Profile.
The explorer keeps the original provider total when all parts are selected and marks a toggled total unknown.
It shows each selected part's share of the selected characters, recomputed on every toggle, and names the session's unmeasured remainder as a row of unknown size.
A pi session on the `claude-bridge` provider runs a Claude Code session underneath, and both tools store the same provider requests.
The stored Claude Code session carries no field that marks it as a bridge: its `entrypoint` is `sdk-ts`, `sdk-cli` or `cli`, the same values other Claude Code sessions store.
So the report marks a Claude Code session as bridged from a pi session on `claude-bridge` in the same working directory when its first request has the same uncached input, cache reads, cache writes and output as one of that pi session's requests, stored within 30 seconds of it.
It matches on that request, not on the session start or totals, because a pi session can open long before its first request and can run across several Claude Code sessions.
When two pi sessions stored that usage, the one named holds more of the Claude Code session's requests with the same usage, and of those the nearest in time.
A bridged session stays listed with its own parts, and it is left out of Claude Code's comparisons, so the conversation is counted once, under pi.
The reader sizes every Claude Code attachment before the first request from the text the transcript records as shown to the model, whatever its type, wrappers included.
An attachment with no such text is sized from its own text only when that text is known to reach the model, such as the system prompt snapshot or the hook replies, and otherwise stays in the unmeasured remainder.
Claude Code and Codex store the Rules their Dispatcher injected, so the reader sizes those from the session and uses the Dispatcher log only to name the Rules they hold.
When the Rules were too large, Claude Code stores and shows the model only a short preview of them, so the reader sizes that preview, names it as a preview of the carriage for the logged Rules and gives it no share of the Rules, because the text past the preview never reached the model.
When one attachment type holds other text, a preview of Rules or full Rules together, each is its own part, named with what it holds, so other text never takes a share of the Rules and a preview never hides full Rules.
Pi does not store them, so its Rules are joined from the Dispatcher log with the current Rule body's character size, which is not proof of the historical text.
A Rule the log names that the current tree no longer holds is left out of the report.
The report counts Hub pulls from the Dispatcher log the same way.
A pull is a read of a Body's `SKILL.md`, and reads of files under a Body do not count.
The report lists each Body's pulls by Profile and by model.
Each row holds the Body's pulls, the sessions that pulled it, and their share of the Profile's or model's sessions.
A bridged Claude Code session is no session of its own there, and its pulls count under the pi session it carried.
A session that switches model mid-session has its pulls counted under its opening model.
Codex reads a `SKILL.md` through its shell, which the Dispatcher logs no pull for, so Codex sessions show no pulls.

## Troubleshooting

### A session is unreadable

The reader prints its tool, stored version, path and line rather than counting a record it cannot decode.
Pi stores a session format number but not its tool version, so its tool version is reported as unknown.
The tool may still be writing the final line of a live session.
The index holds only what the file says now, so a session that has become unreadable loses the rows an earlier run stored for it.
Run the index command again after the session finishes.
A file that holds no provider request is not unreadable: the command counts it as without a provider request, and re-indexing does not change that until the session sends one.

## Related topics

- [Profile context parts](context-profiles.md)
- [Develop this repository](develop.md)
