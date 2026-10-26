# 94. An eval run queues at a concurrency of 3, and model inference that exits on its own queues in gpu

Date: 2026-10-10

## Status

Accepted.
Extends [record 0086](0086-a-heavy-command-is-queued-by-the-dispatcher-and-the-local-job-queue-rule-goes.md) with a third group.

## Context

On 2026-10-10 the Windows machine froze under an rembg background removal on the CPU and two eval pilots of up to 12 sandboxed agents, started three minutes apart.
The job-queue table named neither, so pueue never saw them.
An eval run starts sandboxed agents whatever it filters, at a harness default concurrency of 4.
A model tool that serves, watches or opens a chat never exits, so a queued one would hold the single `gpu` slot for good.

## Decision

`src/dispatcher/job-queue.ts` sends an eval run, `bun run eval`, `pnpm eval`, `yarn eval` or `vitest run` with `--config evals/vitest.config.ts`, to an `evals` group, and only watch mode runs as it is.
A queued eval's own simple command gets `EVAL_CONCURRENCY` capped at 3: a value above 3 or not a number is rewritten to 3, and a command that sets none gains `EVAL_CONCURRENCY=3`.
Model inference goes to the `gpu` group only in a shape that exits on its own, such as `rembg i` or `rembg p` without a watch option, `whisper`, those tools through `uv run`, `uvx` or `python -m`, and a `.py` script whose `uv run` declares an inference package.
An interactive or serving inference tool, `llama-cli`, `llama-run`, `llama-server` and `rembg s` among them, runs as it is.
A call that mixes an eval with another queued command is refused with a message to run them as separate tool calls, for the reason 0086 refuses one that mixes `tests` and `gpu`.
The table recognises the common spellings, and every other spelling runs as written, with per-group memory caps on the Windows machine as the backstop.

## Consequences

A queued eval command runs at most 3 agents, but evals joined with `&` or `|` in one call share one slot at 3 each.
A machine whose pueue lacks the `evals` group runs an eval as it is, uncapped.
Widening either group to a new spelling is a code change with a test, as 0086 says of the table.
