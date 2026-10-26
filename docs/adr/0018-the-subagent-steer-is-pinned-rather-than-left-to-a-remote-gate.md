# 18. The subagent steer is pinned, rather than left to a remote gate

Date: 2026-09-14

## Status

Accepted. Records the `env` and `permissions.deny` entries in
`harness/claude-code/settings.json`, and answers the open question #9
carried: which setting injects the system prompt line discouraging
subagent use.

## Context

Claude Code's Contract had `ListAgents` and `SendMessage` denied, which
leaves an orchestration-style Body unable to see or talk to the agents it
starts. Taking them off the deny list is the easy half.

The hard half was a line several of us had seen in Claude Code's system
prompt telling the model that subagents "should not be used excessively",
which argues against every Body in this collection that fans work out. It
had to be traced before a Dispatcher was built on top of it, because a
harness that talks the model out of a primitive is a harness whose
Enforcement claims are not real.

## Decision

**`CLAUDE_CODE_THISTLE_GREBE=no_nudges` is pinned in the Contract, and
`ListAgents` and `SendMessage` come off the deny list.** Plan mode stays
denied: no Body here uses it.

The trace, against the shipped binary at 2.1.236. One resolver answers
"how should this session be steered about subagents" with `default`,
`no_nudges` or `counter_steer`, reading, in order: the environment
variable `CLAUDE_CODE_THISTLE_GREBE`, session client data, the
`tengu_thistle_grebe` growthbook gate, a per-model floor, and otherwise
`default`. Two places spend that answer. Under `default`, the Agent tool's
own guidance carries the sentence "Subagents are valuable for
parallelizing independent queries or for protecting the main context
window from excessive results, but they should not be used excessively
when not needed"; under `counter_steer`, a whole `## Delegating to
subagents` section is appended instead, opening "Subagents multiply cost
and time".

**The environment variable is the highest-priority source, and that is the
whole reason to set it.** Three of the four sources under it are decided
by Anthropic rather than here, so leaving the field empty means the
strength of the steer against this collection's own Bodies can change
without anything in this repository changing. Pinning it is not a claim
that `no_nudges` reads better today. It is the claim that a Contract is
supposed to say what a harness does.

## What was verified, and what was not

Verified from fresh interactive sessions of the real binary, with the
system prompt read off the wire against a stand-in API rather than asked
of the model:

- With this repository's settings and the captain's model, no
  subagent sentence reaches the model at all. The `# Using your tools`
  section that would carry it is absent.
- `CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT=1`, already set here, is what removes
  that section: unset it and the section returns.
- That flag does **not** contain the steer. With
  `CLAUDE_CODE_THISTLE_GREBE=counter_steer` set, the `## Delegating to
  subagents` section arrives in full whether the simple system prompt is
  on or off. The two settings are independent, and only the steer reaches
  the stronger of the two texts.

Not established: which of the two suppresses the short inline sentence on
the captain's model specifically. The control run could not be taken,
because a value in settings.json's own `env` block wins over the process
environment, so the run meant to vary one flag varied nothing. It is moot
for the decision - the pin makes the answer the same either way - and is
recorded here rather than guessed at.

## Consequences

- A Contract that says `no_nudges` is one whose subagent guidance is
  readable here, instead of a question to be re-answered against the next
  binary.
- `CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT` stays set for its own reasons, and is
  no longer load-bearing for this question.
- The same trace has to be redone when Claude Code renames the knob, which
  is what pinning an undocumented environment variable costs.
