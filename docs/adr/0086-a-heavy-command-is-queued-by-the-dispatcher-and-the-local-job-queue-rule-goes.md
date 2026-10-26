# 86. A heavy command is queued by the Dispatcher, and the local-job-queue Rule goes

Date: 2026-10-07

## Status

Accepted.

## Context

The `local-job-queue` Rule told every session in prose to send a whole test suite to the pueue group `tests` and a GPU or model benchmark to the group `gpu`, to run a quick targeted test directly, and to run directly where pueue or the group is missing.
Each machine runs pueue with those groups, so sessions on one machine take turns at the heavy work.
Whether a command is a whole suite, whether pueue has the group and how to wrap the command are all questions a program can answer.
The Rule spent context in every session to ask the model them instead, which [record 0024](0024-a-constraint-a-program-can-decide-is-written-as-a-program.md) says a program does.
All three harnesses let a hook change a shell command before it runs: pi through the `tool_call` event, and Claude Code and Codex through `updatedInput` in a PreToolUse reply.

## Decision

`src/dispatcher/job-queue.ts` classifies each shell command against a small table and wraps a heavy one as `pueue add --print-task-id --group <group> -- '<command>'`, a wait on that task and the end of its log.
Every Dispatcher bundles it and applies its answer at the shell call, so no Rule carries it and the `local-job-queue` Rule is removed from the library and from every Profile.
A command runs as it is when the table does not name it, or when pueue is missing, its daemon is down or it lacks the group.
The classifier is a guard over ordinary agent commands, not a shell parser, so a shape it does not recognise runs as it would without the hook.
A shell call that needs both the `tests` and the `gpu` group is never queued as one job, because one job holds one group's slot: it is refused with a message to run the tests and the GPU command as separate tool calls, and runs as it is when pueue lacks either group.
A call to pueue is no entry in the table, so the queued command, which hands its work to pueue as one quoted word, is never queued twice.
A mutation run is always heavy, and a test run is targeted only when it names a file, directory or glob that exists, or carries a test-name filter.
The table lists only each runner's options whose value is a path, and every other option is a flag, so the table never has to know every option a runner takes.
Claude Code gets the rewrite with no permission decision, so its own permission check still runs on the queued command.
Codex gets it beside an `allow`, which it requires, and only in a full-access turn, because a queued job runs outside the sandbox and the Dispatcher never overrides a restricted one, whatever its network setting.
A restricted Codex turn is left entirely alone, a call mixing tests and GPU work included: the hook neither queues nor refuses anything there, because each command it would split out would run unchanged anyway.
The dispatch log records the group and the action, never the command, which can carry a credential.

## Consequences

The decision costs no context in any session, and a test pins each table entry and its reason.
A command the table misses runs directly, as it did before the Rule, and widening the table is a code change with a test.
A queued job runs under the pueue daemon rather than in the harness's sandbox.
A Codex session in any restricted sandbox runs heavy commands directly.
