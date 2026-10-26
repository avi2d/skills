# 53. A hook harness reads a Rule's arrival back from its transcript

Date: 2026-09-24

## Status

Accepted. Supersedes the consequence of 0019, repeated in 0022, that
`requested` is never sent on Claude Code or Codex. Neither harness offers a
moment to inspect the outgoing request, and that still holds. Both record the
conversation in a transcript they name to every hook, and that record is the
moment this decision uses. Also amends 0002: a Rule is now held to its whole
text rather than to its first 200 letters and digits.
docs/adr/0054 has since split Claude Code's prompt-time Rules across several
prompt hooks, so the spill this check first reported no longer happens there.

## Context

On pi, the Dispatcher tells the core what it is handing over, and a Rule in
force with no trace in those bytes reads as `broken` (0002). On Claude Code and
Codex nothing was checked. Their dispatch log said `inject` or `deliver`, and
that was the only account of whether a Rule arrived.

Every hook on both harnesses receives `transcript_path`. What that file holds
was measured on Claude Code 2.1.280 and codex-cli 0.155.0-alpha.16. Each ran
for real (`claude -p`, `codex exec`) against a local stand-in for the model API
that saved every request body. The Dispatcher bundle was the only hook, and
`CLAUDE_CONFIG_DIR`, `CODEX_HOME` and `XDG_STATE_HOME` pointed into a scratch
directory.

**Where each harness writes a hook's reply.** Claude Code writes a prompt
hook's context as an `attachment` entry of type `hook_additional_context`. It
writes a denial's reason as the `tool_result` of a `user` entry that carries
`toolDenialKind`. Codex writes hook context as a `developer` message whose
content is marked `hooks.additional_context`. It writes a denial as a tool
output that starts `Command blocked by PreToolUse hook:` or
`Tool call blocked by PreToolUse hook:`.

**Those entries hold what the request held.** For every Rule the log named, the
comparison below checked whether its whole text was in the hook's entries and
whether it was in the request bytes. The two agreed in every case:

```
run                                         transcript   request
Claude Code, 4 Rules, 3.8KB                 whole x4     whole x4
Claude Code, prompt hook timed out          none x4      none x4
Claude Code, 8 Rules, 13.3KB                start x1     start x1
                                            none x7      none x7
Claude Code, a denial inside a sub-agent    whole        whole
Codex, 4 Rules                              whole x4     whole x4
Codex, prompt hook timed out                none x4      none x4
Codex, 8 Rules and a denial                 whole x9     whole x9
```

The report that proposed this counted matches of the preamble anywhere in a
transcript. The matches it counted were the prompt a supervising agent had
pasted, not the hook's entry. A prompt that quotes a Rule is not the Rule being
delivered, and neither is a tool that prints one. That is 0002's point about
`cat` on a Body, and it applies to the transcript unchanged.

**The first thing the comparison found.** Claude Code saves any hook context
over 10,000 characters to a file and gives the model a 2KB preview of it. The
Rules in force in a TypeScript repository here come to 13.3KB. So the request
carried the first ~1,900 characters of `comment-discipline` and nothing of the
other seven, while the log said `inject` for all eight. Across this machine's
transcripts since the Claude Code Dispatcher went live on 2026-09-14, 1,043 of
1,508 prompt-time injections were previews. That is 706 of 1,061 sessions.
Codex's version of the spill was already turned off by 0022's
`additionalContextLimit: 0`, and its run carried all eight whole.

**The transcript lags the conversation.** Under `claude -p`, the file did not
exist yet at the first `PreToolUse`. At `Stop` it ended at the model's tool
call, before the tool result and the reply. At `SessionEnd` it was complete.
Codex writes its rollout out before handing a hook the path.

**A sub-agent's denial lands in a transcript of its own.** A hook that runs
inside a Claude Code sub-agent gets the main session's `transcript_path` and
an `agent_id`. The denial is written to
`<session>/subagents/agent-<agent_id>.jsonl`.

## Decision

**A hook harness sends `requested` from its transcript.** When a hook injects
or delivers, the adapter notes three things: the transcript the reply will be
written to, the time the hook ran, and the Rules it sent. A later hook reads
that transcript. It keeps only entries written after that time, and of those,
only entries the harness writes for a hook's reply. It hands their text to the
core as `requested`, with `read: "transcript"` and those Rules. The verdict is
still the core's. The shared reading lives in `src/transcript.ts`, and each
adapter supplies a reader for its harness's entry shapes.

**The record counts once the model has answered after the hook.** The harness
writes a hook's reply before the model's next entry, so a model entry written
after the hook shows the reply is on disk too. A tool call streamed beside the
hooked one is written after the hook as well, and before the reply, so it does
not count. On Claude Code, an answer counts only if no entry of the same
`message.id` was written at or before the hook. On Codex, whose items carry no
such id, a model item counts only after a tool output or a hook's context
written after the hook. Until an answer counts, the check waits for a later
hook. `SessionEnd` reads the transcript as it stands, since nothing is written
after it.

**A Rule is held to its whole text, on every harness.** The first 200 letters
and digits are exactly what a preview keeps. A Rule that is only partly there
reads as `broken ...: it was injected, and the transcript that followed recorded
only the start of it`. A Rule with no trace keeps the wording 0002 gave it,
naming what was read. On pi the carriage is the Rules themselves, so a healthy
session is unaffected.

**Each record answers for its own Rules.** `requested` can name the Rules it is
evidence for. A second hook's lost reply is then not blamed on the first, and a
Rule injected before this change, with nothing recorded about where to look, is
never asked about.

**Where the check cannot look, the log says so.** Each case gets a
`broken dispatcher:` line naming the Rules:

- the harness named no transcript;
- the transcript was never written by the time the session ended;
- the transcript could not be read;
- a compaction or a fresh start put the Rules back in question before the
  record caught up.

So silence after an `inject` means the same on all three harnesses: the Rule
was checked and it arrived.

## What was considered and rejected

- **Searching the whole transcript for the Rule's text.** A pasted prompt, a
  printed file, or the delivery before a compaction would each stand in for
  the one being checked.
- **Checking at the very next hook.** In the lagging `claude -p` run, that
  reports a loss for a reply that is already on its way.
- **Checking only at `SessionEnd`.** A session killed without one never checks.
  The rest report hours after the fact.
- **A byte offset instead of a time.** The harness writes entries it created
  before the hook after that offset, so an older reply would count.
- **Matching the reply by an id.** Claude Code's context attachment carries
  neither the prompt id nor the tool id. A time works the same way on both
  harnesses.
- **Fixing the 10,000-character spill here.** How Rules travel on Claude Code
  is its own decision. This record is the check that measures it.

## Consequences

- **The log now reports the spill.** From the first session after `bun run
  link`, every Claude Code session whose Rules exceed 10,000 characters logs
  `broken` for each Rule the preview cut. That is the delivery defect, not a
  false alarm, and it stays until the carrier changes.
- **The transcript is the harness's record, not the request.** They were equal
  in every run measured, and a harness that records one thing and sends another
  would pass. Codex writes a tool output to the rollout whole, and cuts it to
  the model's limit only in the history it sends. That limit is 10,000 tokens
  for every model Codex lists, far above one Rule.
- **The check follows a sub-agent's denial to the sub-agent's transcript.** The
  state is still per session, so a Rule delivered to a sub-agent counts as
  delivered to the main conversation too, and the main model is never told.
  That is a gap in what the state tracks, not in delivery, and this check does
  not report it.
- **A lost write loses a check.** A background agent's hooks run alongside the
  main session's, and the state file is read, changed and written back. A place
  lost with the rest of a write is a check that never happens.
- **A lost prompt reply on Codex can wait for the session's end.** A turn in
  which the model only writes text feeds nothing back to it, so nothing there
  counts as an answer. The loss is reported at the next tool output, or at
  `SessionEnd`.
- **Where to look is state.** It goes to disk as `awaiting` beside the RunState
  in the adapter's session file, and leaves with it at `SessionEnd`.

## Reproducing the measurement

Run a stand-in API on localhost that appends each request body to a file and
answers one tool call, then a closing message. Claude Code needs the Messages
streaming events. Codex needs the Responses API events.

- **Claude Code:** set `CLAUDE_CONFIG_DIR` to an empty directory,
  `ANTHROPIC_BASE_URL` to the stand-in and `ANTHROPIC_API_KEY` to anything.
  Pass `--settings` with the bundle's six hooks.
- **Codex:** use a `CODEX_HOME` holding a `config.toml` whose
  `model_provider` points at the stand-in with `wire_api = "responses"`, and a
  `hooks.json` naming the bundle. Pass `--dangerously-bypass-hook-trust`.

Point `XDG_STATE_HOME` at the same scratch directory, so the dispatch log and
state go there. To lose a reply, wrap the prompt hook in a script that runs the
bundle and then sleeps past a 3-second timeout. For each Rule the log names,
compare its text, letters and digits only, against the hook's entries in the
transcript and against the saved request bodies.
