# 54. Claude Code carries a prompt's Rules in parts, one per prompt hook

Date: 2026-09-24

## Status

Accepted. Settles what 0053 set aside: the 10,000-character spill it measured
on Claude Code.

## Context

0053's check found that Claude Code shows the model any hook context longer
than 10,000 characters only as a 2KB preview and a file path. The Rules in
force in a TypeScript repository here come to about 13.4KB. Of 1,508
prompt-time injections logged since 2026-09-14, 1,043 reached the model only
as that preview. Most of the Rules in force were never read.

Whether splitting the injection helps depends on what the limit counts: each
hook, each hook entry, or the event as a whole. This was read from Claude
Code 2.1.280, the version this machine's CLI and Agent SDK both ship, and then
measured against it.

**The limit counts each hook command's own context.** The hook runner loops
over the results of the hooks it matched for an event. For each result it
passes that hook's `additionalContext` through the function that persists
output, with a threshold of `1e4`. Past that threshold the text is written to
disk and replaced by the preview. Nothing raises the threshold. The runner
passes none, the constant has no setting or environment variable behind it,
and Claude Code has nothing like Codex's `additionalContextLimit` (0022). Each
hook's context is recorded as its own `hook_additional_context` entry. What
the model sees is those entries joined, with no cap of its own.

**Hooks for one event run together, and finish in any order.** Command hooks
are deduplicated by command string, so two entries running the same command
run once. Entries whose commands differ all run, at the same time. Their
results are taken as they finish, so their order in the transcript and the
request is the order they finished in.

**The prompt hook knows which prompt it is for.** Every `UserPromptSubmit`
payload carries a `prompt_id`. It is the same for every hook fired by one
prompt, and different for the next prompt.

**Measured.** `claude -p` ran against a local stand-in for the model API that
saved each request body, with plain hooks that each printed a context of a
given size:

```
hooks and their context sizes      in the request
one of 13,000                      a preview
one of 10,000, one of 10,001       the first whole, the second a preview
two of 7,000                       both whole
three of 9,900 (29,700 in all)     all three whole
```

So splitting across hook commands is a real fix, not the same preview cut into
pieces. Every Rule selected here is under 2.6KB, so a split between Rules keeps
each part within the limit and leaves every Rule as written.

## Decision

**The prompt hook's reply is cut between Rules into parts within 10,000
characters.** The core's `carriages` takes the Rules in force in declared
order. It fills each part while the next Rule still fits, and each part is the
core's own `carriage` of the Rules it holds. So each part opens with the
preamble and makes sense on its own, whatever order the parts land in. A
single hook reply that fits is exactly what it was before. The limit is the
adapter's `CONTEXT_LIMIT`.

**Claude Code runs the Dispatcher's prompt hook `PROMPT_HOOKS` times.** In
`harness/claude-code/settings.json`, the first entry is the Dispatcher as
before. Entries 2 to `PROMPT_HOOKS` name the part they carry in the hook
argument (`UserPromptSubmit/2`, `UserPromptSubmit/3`). Only the first reads and writes
the session's state, logs, and records where the check will look. It keeps the
first part and writes the rest to one file named for the `prompt_id`, under the
session's state. Each later hook holds no state. It waits for that file, prints
its own part if there is one, and exits. The first hook always leaves a file
for its prompt, an empty one if it has nothing to hand on or if it failed, so
the later hooks never wait out their deadline behind a hook that has already
finished. The file is written whole and then renamed into place, so a later
hook never reads half of it. A prompt clears the files earlier prompts left,
and `SessionEnd` removes them.

**A later hook's argument is not a hook name.** The settings are a link into
the checkout, so they change when it is pulled. The bundle changes only when
`bun run generate` runs. A Dispatcher built before this change ignores any
argument after the hook name. Given `UserPromptSubmit 2`, it would dispatch the
prompt once per entry, at the same time, all writing the same state.
`UserPromptSubmit/2` is no hook it knows, so it does nothing. Between the pull
and the generate, a prompt then goes out as it did before, previewed.

**Where it cannot split, the log says so.** With no `prompt_id` there is no
file to share, so the first hook sends everything as before and logs a
`broken dispatcher:` line if that goes past the limit. With more parts than
prompt hooks, the overflow goes out with the last part and the log says so.
Either way the check then reports each Rule the preview cut.

**Programs hold the agreement, not this record.** `tests/claude-dispatcher.test.ts`
refuses:

- settings whose Dispatcher prompt hooks are not exactly the first plus hooks 2
  to `PROMPT_HOOKS`, or whose later hooks pass a bare hook name;
- a later hook whose timeout does not exceed its wait, or a wait that does not
  exceed the first hook's timeout;
- a Selection whose Rules, all due at one prompt, need more parts than there
  are prompt hooks, or hold a Rule too long for any part.

`tests/e2e/claude-code-delivery.test.ts` runs real `claude -p` against a
stand-in API. It pins `CONTEXT_LIMIT` to what Claude Code actually does:
10,000 arrives whole and 10,001 is previewed. It also shows the check reporting
each Rule of a previewed injection, and reporting nothing once the shipped
prompt hooks carry the parts. The request is checked to hold every Rule whole.
It skips where `claude` is not installed, and says so.

## What was considered and rejected

- **Shortening, moving or dropping Rule text to fit.** The Rules are the
  content. Changing them to suit a transport is not this adapter's decision to
  make.
- **A setting that raises the limit.** Claude Code 2.1.280 has none.
- **Every prompt hook runs the Dispatcher and keeps its own slice.** They run
  at once, so each would read and write the same session state. Each would also
  walk the repository and log every `inject` again.
- **Letting a Rule be cut mid-text across parts.** The parts land in any order,
  and a Rule read in two halves, possibly backwards, is not the Rule.
- **Only the first part carries the preamble.** A part that lands first would
  then open with a Rule and no word on what it is.

## Consequences

- **A Rule longer than 10,000 characters still arrives as a preview.** No part
  can hold it, and it is never cut. The Selection test refuses it before it
  ships.
- **A prompt costs `PROMPT_HOOKS - 1` more processes.** Each later hook
  finishes as soon as the first hands on, so the prompt waits no longer than it
  did.
- **A first hook killed by its timeout holds the prompt for the others'
  wait.** They wait `HAND_OFF_WAIT_SECONDS`, longer than the first hook's own
  timeout, then log that nothing came. The check reports the Rules they would
  have carried.
- **Growing the Selection past what the prompt hooks hold fails the suite.**
  The fix is another entry in the settings and a higher `PROMPT_HOOKS`, not a
  shorter Rule.
- **This changes Claude Code only.** Codex sends the context whole under
  0022's setting, and pi hands over the request itself. `carriage` means what
  it always meant, and their tests pass unchanged.
