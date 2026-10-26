# 6. A fan-out asks nothing of its provider

Date: 2026-08-28

## Status

Superseded by 0066, which deletes the fan-out along with the rest of the
Workflow machinery. What follows is left as it was written. Supersedes
`0003-a-fan-out-refuses-a-provider-that-cannot-run-one.md`.

## Context

0003 refused a Workflow that fans out under `claude-bridge`, and it refused on a
measurement: every branch spawned as an isolated sub-agent under that provider
died before its first command, with

```
prompt-capture: no capture for this 17785-char system prompt, and it embeds
none of the 1 known.
```

That does not reproduce. Measured in this repository's own pinned configuration
- `pi-claude-bridge` 0.7.0 and `pi-subagentura` 3.3.1 from
`harness/pi/settings.json`, with `claude-bridge` as `defaultProvider`:

```
subagent_isolated("Reply with exactly: PONG")   -> PONG
parallel([agent("...BRANCH-A"), agent("...BRANCH-B")])
  -> ["BRANCH-A","BRANCH-B"], 2 agents, 0 errors
```

The second is the path a run actually takes. `src/subagentura.ts` writes
`agent(branch.prompt, { label })` with no isolation named, and the Dispatcher
hands that script to the `workflows` command in the session it is already in.
The probe called the same helper the same way from the same kind of session, so
what was measured is a fan-out and not a stand-in for one.

And the refusal itself is gone from the run, measured the way 0003 measured it
there: a real pi process with the generated Dispatcher discovered as pi
discovers it, a probe extension asking for `/workflow:implement` as a command pi
runs, no tools, and a working directory outside any repository.

```
PROBE provider=claude-bridge model=claude-haiku-4-5
invoke implement at 1/5: worktree
```

0003 recorded `abort implement at the start` from that same probe on that same
provider. The run now starts, and stops later at the step that reported no
worktree, because a probe with no tools cannot cut one.

### What this does not establish

Why it failed on 2026-08-27 and passes on 2026-08-28. Two explanations suggest
themselves and neither survives its own dates. `pi-subagentura` 3.3.1 was
published on 2026-08-25, so the pin it is running under today is the pin it
failed under. 0002 stopped this Dispatcher rewriting pi's system prompt, which
is the cause `pi-claude-bridge` names first in that error message, and 0002
landed before the failing session rather than after it.

So the mechanism is worth writing down, because it says where this can come
back. `prompt-capture.ts` keeps its captures in a `Map` built in the process, as
the process assembles prompts. An in-process sub-agent assembles its prompt in
the same process that recorded the session's, so a sub-agent prompt that wraps
what pi assembled resolves through `findInheritedPrompts`, and one that rebuilds
it from parts resolves through nothing and throws. Whether a given sub-agent
wraps or rebuilds is pi-subagentura's business and can change under a pin.

One path stays unmeasured. This machine has neither `tmux` nor `zellij`, so
pi-subagentura's process isolation falls back to in-process and every branch
above ran in this session's process. A machine with a multiplexer spawns a child
pi process whose capture map starts empty, and nothing here says what happens
there.

## Decision

**A fan-out asks nothing of its provider. Branches are spawned, and a branch
that cannot run reports for itself.**

The `Provider` type, its `isolates` field, the field it occupied on `RunState`,
the provider riding three events, and both gates go, rather than a
`CANNOT_ISOLATE` list left standing with nothing in it.

0003 held that list to the measured rather than the permitted, and its own
consequence follows: with nothing measured to fail, there is nothing to list. A
list of none refuses nothing on any input, so what would remain is a question
asked at two gates whose answer is fixed, a field carried through the state that
saves it, and three events carrying a fact no branch reads. That is reader load
with no run behind it.

What the refusal was protecting is still protected one layer out. A branch that
fails comes back null, the Workflow's `failure` decides what that does to the
run, and `workflows/implement` declares `abort`. The cost 0003 was avoiding was
never the failure itself - it was finding out one branch at a time, after the
run had cut a worktree and opened a pull request. That cost is real again, and
it is the price of not refusing runs that work.

## Consequences

- `/workflow:implement` runs on `claude-bridge`, which is this machine's default
  provider. #29 can be run without picking another provider first, which is what
  it was blocked on.
- A provider that does reject isolated sub-agents fails one branch at a time
  again, which is exactly the defect #27 reported. Reopening this decision is
  cheap: the gates were one function asked in two places, and 0003 records the
  shape they had. What it costs is a session where it happens, because that is
  what put the first list there and nothing weaker should put back the second.
- The dispatch core no longer knows what it is running on. `dispatch` is a
  function of the index, the event and the run state, and the runtime the
  session sits on is not among its inputs.
- A run's saved position is unaffected. The provider lived on `RunState` and
  never on `Run`, and a Dispatcher restores the run.
