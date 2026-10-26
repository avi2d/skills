# 19. A Rule that falls due mid-turn arrives as a refusal

Date: 2026-09-14

## Status

Accepted. Records the design of `src/claude-dispatcher.ts` and the
`claude-code` row of `PROVIDES` in `src/harness.ts`. Extends docs/adr/0002,
which settled how a Rule reaches the model, to a harness whose seams are
nothing like pi's. docs/adr/0053 has since superseded the consequence that
`requested` is never sent: the transcript Claude Code names to every hook is
the moment this record found missing, and the arrival is read back from it.
0066 deletes the `claude-code` row of `PROVIDES` and the nagged Workflow run
this record advanced by refusing the stop. A Rule that falls due mid-turn
still arrives as a refusal.

## Context

pi hands its Dispatcher a `context` event before every model call, so the
Rules in force are rebuilt and re-sent on each one and nothing about
delivery is ever in doubt. Claude Code has no such moment. It has hooks,
each a process, each with one reply, and the reply shapes are fixed:

- `UserPromptSubmit` can add context to the turn about to start.
- `PreToolUse` can allow, ask, or **deny** the call that is waiting, with a
  reason that goes back to the model.
- `Stop` can **block** the turn from ending, with a reason.
- The rest can say nothing the model reads.

The core already produces the right distinction. A Rule that matches
`always` or `repo-contains` falls due at a prompt and the core says
`inject`; a Rule that matches `file-matches` or `tool-call` falls due
inside a running turn and the core says `deliver`, because "the turn it
fell due in is the one making the writes it governs". On pi both are the
same gesture. On Claude Code, `inject` has an obvious home and `deliver`
does not: there is no way to put a message into a turn already running.

## Decision

**`deliver` becomes a denial, and the Rule is the reason.**

`PreToolUse` returning `permissionDecision: "deny"` is the only primitive
Claude Code has that does both things a mid-turn delivery must do: it puts
the Rule's text in front of the model now, and it stops the write the Rule
governs from landing before the Rule arrives. The model reads the Body and
retries. Because the core counts the Rule as injected from that point, the
next matching call is not denied - the refusal costs one tool call per
Rule per session, and buys the guarantee that no governed write ever
happens un-governed.

The alternative, holding the Rule until the next prompt, is a Rule that
arrives after the writes it was about. That is not a weaker version of
enforcement; it is enforcement pointed at the wrong turn.

**A `nagged` run advances by refusing the stop.** `PROVIDES["claude-code"]`
is `["nagged"]` and nothing more. Claude Code cannot drive a turn, so a run
here advances at the only moment it can interrupt: the model tries to
finish, the `Stop` hook asks the core what is outstanding, and a run still
asking refuses the stop and hands over the step as the block reason. A run
that has finished says nothing and the turn ends. `driven` and `parallel`
stay off the row, so those Workflows are absent from this Hub rather than
run as something weaker (docs/adr/0016).

**The choice of primitive is the adapter's and the core's business
stops at the word.** The core says `inject`, `deliver`, `invoke`, `ask`;
this file decides that those become context, a denial, or a block,
according to which hook is running. That is translation, not judgment: a
condition about *whether* a Rule fires still belongs in `dispatch.ts`.

## Consequences

- A hook is a process, so the whole `RunState` is written to disk after
  every event and read back before the next. The core being a pure
  function of it is what makes that possible, and `RunState` was already
  plain JSON for the resumability reason.
- A hook never exits non-zero. A broken Dispatcher that failed the turn
  would be worse than one that says so in the log and gets out of the way.
- The `requested` event is never sent. Claude Code offers no moment at
  which the outgoing request can be inspected, so the check docs/adr/0002
  added for pi has no counterpart here, and a Rule's arrival on Claude
  Code rests on the hook reply being honoured. Absent rather than faked.
- A Body that is heavy on `file-matches` will cost a denied tool call the
  first time it matches, which reads as a refused edit in the transcript.
  The reason says which Rule did it.

## What was considered and rejected

- **Delivering mid-turn Rules at the next prompt.** One turn of writes
  happen before the Rule the author wrote for exactly those writes.
- **A `PostToolUse` note instead of a denial.** The write has already
  landed; the Rule arrives to comment on it.
- **Claiming `driven` by chaining stop-blocks.** Blocking the stop over
  and over does move a run forward, but it is not the level `driven`
  describes - the work is not happening in the turn the user is in, it is
  happening in turns the Dispatcher keeps refusing to end. Claiming it
  would be what `PROVIDES` exists to prevent.
