# 31. A leaked tool call is repaired in the harness rather than waited on upstream

Date: 2026-09-19

## Status

Accepted.

## Context

pi reaches the Windows GPU through an `ollama` provider whose api is
`openai-completions`. Under pi's real system prompt, `qwen3-coder:30b` writes a
sentence and then emits its tool call as a bare block:

```
<function=read>
<parameter=path>
notes.txt
</parameter>
</function>
</tool_call>
```

The opening `<tool_call>` is missing and a `</tool_call>` closer is left behind.
Ollama's qwen3-coder parser only enters its tool-collecting state on the opening
tag, so the whole block stays content. It reaches pi as assistant text, pi's
loop finds no `toolCall` in the message, and the turn ends with nothing
executed. Measured on this machine against Ollama 0.34.2: 6 of 10 runs clean on
a read-a-file prompt, and every one of the 4 failures was that block.

This is ollama/ollama#17353, closed with no fix, and the open PR 16398 tolerates
exactly this drift. The gap is real and unfixed in the version on that box, and
waiting on an upstream maintainer is not a plan.

## Decision

A pi extension, `harness/pi/extensions/qwen-tool-calls.ts`, handles `message_end`
and returns a replacement assistant message with the leaked block converted into
a `toolCall` content block.

That hook is the earliest one that lets the agent loop continue as if the
provider had returned a structured call. The loop awaits `message_end` before it
reads `message.content` for tool calls, and pi applies an extension's
replacement by mutating the message object the loop is holding, so a call added
there is executed, its result is appended, and the turn continues. Nothing
downstream can tell the difference.

The two hooks that sit earlier cannot do it. `before_provider_request` runs
before the response exists. `after_provider_response` carries the status and
headers only, and fires before the stream body is consumed rather than handing
it over, so there is no stream to repair there.

A pi-side provider shim was the alternative: a custom provider, or a local proxy
the `ollama` provider's baseUrl points at, re-framing the SSE stream so pi's
`openai-completions` parser sees `tool_calls` deltas. Rejected on two counts.
It puts a second long-lived process between pi and the model for every session,
including the ones that never touch this model, and it has to reassemble a
streaming protocol correctly to fix a problem that is not about the protocol.
The extension needs no process, sees the finished message rather than a
half-parsed stream, and is off by a string test on every other model.

Arguments are typed against the registered tool's JSON schema, which pi hands
over through `pi.getAllTools()`, by the same rules Ollama's own parser uses:
one leading and one trailing newline stripped, `null` ahead of every declared
type, then boolean, integer, number, array, object, string in that order, with
its single-declared-type fallbacks. A value whose parameter is untyped, or whose
tool is not registered, stays the raw string.

The repair fails closed. A block with no complete opener, no `</function>`, or a
parameter that does not close leaves the whole message exactly as the model
wrote it, because guessing at a tool invocation is worse than dropping a turn.
It is also skipped entirely when the message already carries a parsed tool call,
which is the case where the provider read the turn correctly and no repair is
owed.

It installs through the map in `src/link.ts`, the same entry shape
`harness/pi/extensions/session-name.ts` uses, and pi auto-discovers it from
`~/.pi/agent/extensions/*.ts`. `bun run generate && bun run link` is the whole
install.

## Consequences

Measured against the live model, ten runs each from a scratch directory: 6 of 10
clean without the extension, 10 of 10 with it. Three of those ten runs leaked
and were repaired, which the session transcripts tell apart because a synthesized
call carries a UUID where Ollama's own carries a short id.

`tsconfig.json` now includes `harness/**/*.ts`. The parser is code with
branches, so it is typechecked and unit-tested like the rest of `src/`, and
`harness/pi/extensions/session-name.ts` comes along with it.

Two cases are left open rather than handled. A message that carries both a
parsed call and a leaked one keeps only the parsed call. And the repair is
gated on the model name matching qwen-coder, so a second model that drifts the
same way needs that test widened.
