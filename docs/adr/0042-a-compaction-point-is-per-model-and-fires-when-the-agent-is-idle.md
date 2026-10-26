# 42. A compaction point is per model, and fires when the agent is idle

Date: 2026-09-22

## Status

Superseded by 0043, which moves the points into pi's native
`compaction.modelOverrides` and deletes the extension. Records
`harness/pi/extensions/compaction-points.ts`, and replaces the
`compaction.reserveTokens` setting that stood in `harness/pi/settings.json`
before it.

## Context

A session reasons worse long before its window fills, and firstmate's durable
records make a compaction a non-event, so the captain's sessions are compacted
early on purpose: fable once real context nears 300k, opus once it nears 400k.

pi has one lever for that, and it is global. `shouldCompact` is
`contextTokens > contextWindow - reserveTokens`, with `reserveTokens` a single
number for every model, defaulting to 16384: a bridge model's window is
1,000,000, so out of the box it compacts at 984k. Reserving 700000 does move a
fable session to 300k, which is the first half of the ask. It also gives every
200k-window model a negative threshold, so those sessions compact after every
turn; the local-model benchmark runs were the case affected. And one number
cannot say 300k for fable, 400k for opus, and pi's own default for everything
else.

## Decision

**The points live in a pi extension, keyed by model.**
`harness/pi/extensions/compaction-points.ts` maps `provider/id` to a point -
`claude-bridge/claude-fable-5-1` to 300k, `claude-bridge/claude-opus-5` to
400k - and calls `ctx.compact()` once the session's context usage passes it. A
model with no entry has no point and keeps pi's own threshold;
`compaction.reserveTokens` is gone from `harness/pi/settings.json`, so nothing
here reaches a model the map does not name.

**The check runs only while the agent is idle.** `ctx.compact()` reaches
`AgentSession.compact()`, whose first statement is `await this.abort()`: a
compaction started mid-run cancels that run, and pi resumes only after an
overflow compaction, never a threshold one. A check on `turn_end`, which fires
after each LLM response *inside* a run, would therefore abandon the task the
moment the point was crossed and leave the user to prompt again. pi runs its
own threshold check on the post-run path, after the agent has stopped.

So the triggers are the idle ones: `agent_settled`, which pi emits after
clearing `_isAgentRunActive`; `session_start`; and `model_select` behind an
explicit `ctx.isIdle()` guard, because `/model` and Ctrl+P switch models
without waiting for the run to finish. Without that guard, cycling from opus to
fable at 350k would cancel whatever was in flight. With it, the session
compacts at the next settle instead.

A `compacting` flag, cleared from both `onComplete` and `onError`, keeps a
second trigger from starting a second compaction over the first.

## Consequences

- A model that wants its own point is one line in `POINTS`, keyed by the
  provider and id the bridge registers. Opus 4.x answers to other ids and falls
  to pi's default deliberately.
- A session that crosses its point mid-run compacts a little past the point,
  at the next settle. That overshoot is the price of not killing a live run.
- The extension is reached through the link map and pi's auto-discovery of
  `~/.pi/agent/extensions/*.ts`, like every other extension here, so it has no
  entry in `harness/pi/settings.json`.
- The logic is exported as `compactionPointFor` and `pastPoint`, which is how
  `tests/compaction-points.test.ts` holds the two numbers and the idle rule
  without starting pi.

## Alternatives

Keeping a global reserve was rejected by the arithmetic above: it cannot hold
two points, and any value large enough for a 1M window breaks every smaller
one.

Waiting for pi to grow a per-model reserve was rejected because the sessions
being fixed are the captain's daily ones, and an extension reaching the same
setting per model costs thirty lines.
