# 43. A compaction point is a per-model reserve in pi's settings

Date: 2026-09-23

## Status

Accepted. Supersedes 0042: the extension that held its points is deleted, and
the points are the ones below.

## Context

0042 put the captain's compaction points, fable near 300k and opus near 400k,
in `harness/pi/extensions/compaction-points.ts`, and rejected waiting for pi to
grow a per-model reserve. pi has since grown one. `CompactionSettings` carries
`modelOverrides`, a record keyed by exactly `<provider>/<id>` whose entries
hold `reserveTokens` and `keepRecentTokens`. The resolver takes the override,
then the ordinary `compaction` setting, then the built-in default of 16384.

The extension had to be linked into `~/.pi/agent/extensions/` and loaded every
session. It called `ctx.compact()` from outside on three events and needed a
flag to stop one compaction starting over another. pi runs its own threshold
check in two places. The first is between turns inside a run, before the next
assistant request, where it compacts and then carries on with the run. The
second is after the run ends. 0042 waited for the agent to go idle because
`ctx.compact()` aborts the live run. pi's own threshold compaction aborts
nothing, so that reason for waiting does not apply to it.

## Decision

**The points are `compaction.modelOverrides` in `harness/pi/settings.json`.**
pi compacts once `contextTokens > contextWindow - reserveTokens`, so a point
is reached by reserving the window minus the point. Each claude-bridge model
uses the window pi's own catalog lists for it under `anthropic`, which is the
window the Claude bridge registers, and each worker model uses the window pi's
own catalog registers for it under its provider. Every model re-reads its whole
conversation every turn. A worker model pays for that per token, and a Claude
model pays for it out of the plan's five-hour window, so both compact near
150,000:

| key | point | reserveTokens |
| --- | --- | --- |
| `claude-bridge/claude-fable-5-1` | 150,000 | 1,000,000 - 150,000 = 850,000 |
| `claude-bridge/claude-opus-5` | 150,000 | 1,000,000 - 150,000 = 850,000 |
| `claude-bridge/claude-opus-5-5` | 150,000 | 1,000,000 - 150,000 = 850,000 |
| `claude-bridge/claude-sonnet-5` | 150,000 | 1,000,000 - 150,000 = 850,000 |
| `claude-bridge/claude-sonnet-5-5` | 150,000 | 1,000,000 - 150,000 = 850,000 |
| `claude-bridge/claude-haiku-5-5` | 150,000 | 1,000,000 - 150,000 = 850,000 |
| `opencode-go/muse-spark-1.3-contributor` | 150,000 | 1,048,576 - 150,000 = 898,576 |
| `opencode-go/deepseek-v4-pro` | 150,000 | 1,000,000 - 150,000 = 850,000 |
| `opencode-go/glm-5.3` | 150,000 | 1,000,000 - 150,000 = 850,000 |
| `openrouter/deepseek/deepseek-v4-pro-0813` | 150,000 | 1,048,576 - 150,000 = 898,576 |
| `openrouter/z-ai/glm-5.3` | 150,000 | 1,048,575 - 150,000 = 898,575 |

Both opus ids are keyed because the bridge registers both at 1M and the lookup
is exact; firstmate's crew dispatches `claude-opus-5-5`, `claude-sonnet-5-5`
and `claude-haiku-5-5`.
An id with no key would fall to the 16384 default and compact near 984k.

There is still no global `compaction.reserveTokens`, so a model with no
override keeps pi's default, as under 0042.

**Each claude-bridge model keeps a 10,000-token tail.** `keepRecentTokens` is
the share of the newest conversation pi keeps verbatim through a compaction,
counted by pi's estimate of four characters a token, and pi's default is
20,000. A replay of pi 1.2.0's own `prepareCompaction` over the 93
claude-bridge compactions recorded in `~/.pi/agent/sessions` up to 2026-10-20
reproduced every recorded cut. The kept tail's real cost was read from the
usage of the assistant turns on either side of the cut. The first call after
a compaction came back at:

| sessions | keepRecentTokens | median | p90 | max |
| --- | --- | --- | --- | --- |
| 60 crew and other | 20,000 | 46,961 | 55,724 | 65,430 |
| 60 crew and other | 10,000 | 27,067 | 36,232 | 44,865 |
| 33 firstmate second mates | 20,000 | 97,527 | 120,245 | 124,740 |
| 33 firstmate second mates | 10,000 | 81,479 | 99,680 | 103,041 |
| 33 firstmate second mates | 0 | 60,942 | 79,060 | 83,313 |

A 20,000-token estimate costs about 40,000 real tokens on Claude. The summary
was 2,000 to 9,000 tokens in every one of them, well under its cap. What a
second mate keeps past the tail is Claude Code's own prompt and the session-start
note firstmate injects again after each compaction, which this file cannot
shrink.

## Consequences

- A point is a reserve, not a threshold. It holds only while the window it
  was worked out from stays registered: if the bridge's 1M window or a window
  pi's catalog registers for a worker model changes, that reserve has to be
  recomputed from it, or the point moves with the window.
- A session can compact mid-run, at the first turn boundary past its point,
  and the run then continues. 0042's rule of compacting only when idle is gone,
  and so is its overshoot to the next settle.
- A model that wants its own point is one entry, keyed by the provider and id
  pi resolves it under, with the reserve worked out as above.
- A compacted claude-bridge session keeps less of its last few turns verbatim,
  and leans on the summary for the rest.
- `harness/pi/extensions/compaction-points.ts` and
  `tests/compaction-points.test.ts` are gone, and the link to the extension is
  retired, so `bun run link` removes it from a machine that has it.

## Alternatives

Keeping the extension was rejected: it reimplemented, in thirty lines and
three event handlers, a setting pi now resolves itself.
