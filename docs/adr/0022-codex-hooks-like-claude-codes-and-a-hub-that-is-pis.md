# 22. Codex's hooks are Claude Code's, and its Hub is pi's

Date: 2026-09-14

## Status

Accepted. Records `src/codex-dispatcher.ts`, `harness/codex/hooks.json`, the
`codex` row of `PROVIDES` in `src/harness.ts`, and the split of `HUBS` from
`DISPATCHERS`. 0029 has since made a Hub links rather than emitted bytes and
moved `HUBS` to `src/hub.ts`. The split stands. 0039 has since made the Hub
one directory every skills root points at, so Codex reads the same Hub as
everything else and the per-harness root this record settled on is gone.
Extends docs/adr/0019, which settled how a Rule reaches a harness made of
hooks, to the third one. docs/adr/0053 has since superseded the consequence
that `requested` is never sent here, reading the arrival back from the rollout
Codex names to every hook. 0066 deletes the `codex` row of `PROVIDES` and the
nagged Workflow run.

## Context

#10 was written before anyone here had established what Codex's extension
model is, and asked for the research first. It was right to: the ticket
assumed a plugin hook model, and what Codex has is a hook model that is
Claude Code's in almost every particular, plus a plugin system that is the
wrong shape for this repository.

Everything below was established against codex-cli 0.153.4, shipped inside
`/Applications/ChatGPT.app/Contents/Resources/codex`, and the official manual
at `https://developers.openai.com/codex/codex-manual.md` - not by analogy
with Claude Code.

## What Codex has

**Twelve lifecycle hook events**, from the binary's own enum and the manual:
`PreToolUse`, `PermissionRequest`, `PostToolUse`, `PreCompact`, `PostCompact`,
`SessionStart`, `SessionEnd`, `UserPromptSubmit`, `SubagentStart`,
`SubagentStop`, `Stop`, `Interrupt`. Six of them carry an event the core has a
word for, and those six are the ones this Dispatcher answers.

**The same wire shape as Claude Code.** Input is one JSON object on stdin with
snake_case keys - `session_id`, `cwd`, `hook_event_name`, `tool_name`,
`tool_input`. Output is camelCase `hookSpecificOutput.hookEventName` plus
`additionalContext`, or `permissionDecision`/`permissionDecisionReason`, or
`{"decision":"block","reason":...}`. Codex even sets `CLAUDE_PLUGIN_ROOT`
alongside its own `PLUGIN_ROOT` for plugin hooks. The adapter is therefore
close to a copy of the Claude one, and the four places it is not are what the
rest of this record is about.

**Config in a file of its own.** `~/.codex/hooks.json`, or an inline `[hooks]`
table in `config.toml`. Both load; a layer holding both merges them and warns.
This repository uses the file, because `config.toml` is rewritten by Codex
constantly - every project trust decision lands in it - and the Contract is
meant to be a reviewable diff rather than a churn log.

## Decisions

### An edit is one `apply_patch` carrying a whole patch

Codex has no per-file write tool. Every edit arrives as `PreToolUse` with
`tool_name: "apply_patch"` and a `tool_input.command` holding a V4A patch,
observed from a real `codex exec`:

```
*** Begin Patch
*** Add File: probe.txt
+hello
*** End Patch
```

One call can name several files, so the core's `writes` became a list of
paths rather than one, and a `file-matches` Rule fires when any of them
matches. Taking the first path instead would make a Rule miss every patch
that happens to lead with a README, which is the silent half-enforcement this
repository exists to avoid - and whether a Rule fires is the core's judgment,
not an adapter's (AGENTS.md). pi and Claude Code pass a one-element list.

The paths come out of the `*** Add|Update|Delete File:` headers. A
`*** Move to:` line renames a file the header above it already named, so it
adds nothing.

### A blocked stop starts the next turn rather than refusing this one

`PROVIDES["codex"]` is `["nagged"]`, for docs/adr/0019's reason: Codex cannot
drive a turn, so a run advances at the only moment it can interrupt.

The primitive is kinder than Claude Code's. On Claude Code, `Stop` returning
`decision: "block"` refuses the turn's end. On Codex the manual is explicit
that "`decision: "block"` doesn't reject the turn. Instead, it tells Codex to
continue and automatically creates a new continuation prompt that acts as a
new user prompt, using your `reason` as that prompt text." That is closer to
what a `nagged` run wants than a refusal is, and it costs the adapter nothing:
the core still says `invoke`, and this file still answers with the same two
keys.

`driven` and `parallel` stay off the row, so Workflows declaring them are
absent from Codex rather than run as something weaker (docs/adr/0016).

### Rules are sent whole, against a default that would preview them

This is the finding that would have shipped a Dispatcher that looked like it
worked. Codex spills any model-visible hook output over roughly 2,500 tokens
to a file on disk and hands the model a head-and-tail preview instead.

The Rules in force in a code repository here come to about 5,700 tokens. Run
against the real binary before this was known, the model was asked to name the
Rules it had been given and named four of six - the first three and the last -
which is exactly what a head-and-tail preview looks like from the inside.
Nothing failed. The log said six Rules were injected, and six Rules were
injected; the harness quietly delivered a summary of two of them.

`additionalContextLimit: 0` is set on the `UserPromptSubmit` handler, which is
the one handler here that returns `additionalContext`. Zero means send it
whole. The manual warns against zero on a hook without a strict output cap,
and this one has an unusual claim to it: what it sends is the Bodies the
Selection switched on, each at most once per session, chosen by a human. A
Rule that arrives as a preview has not arrived.

The same ceiling applies to tool feedback and continuation prompts and
**cannot** be raised there, so a mid-turn denial and a nagged step are capped
at the default. At the sizes this repository's Rules currently reach, none
spilled - the largest, `technical-writing`, arrived whole through a denial and
was checked for its last line. A Rule that outgrows it would be previewed,
with nothing to say so.

### Codex has no Hub of its own, because it reads pi's

Codex scans three skill roots, read out of a live session's own prompt:

```
r0 = $CODEX_HOME/skills
r1 = $HOME/.agents/skills
r2 = $CODEX_HOME/skills/.system
```

`~/.agents/skills` is `r1`, and it is already pi's Hub - pi reads that path
natively too, because it is the Agent Skills standard's user directory. The
Bodies are portable by design, so both harnesses reading the same bytes is
the standard working rather than failing.

`~/.codex/skills` would have been Codex's own, and it has a second writer:
Codex fills its `.system` subdirectory with the six skills it ships, 60 files,
recreating them in an empty directory on startup. Pointing that path into
`generated/` would mean Codex writing into the emitted tree on every launch,
and `bun run generate` deleting Codex's own skills on every run, since the
generator owns that root wholesale (docs/adr/0021). So `generated/codex/skills`
is not emitted and `.codex/skills` is not linked.

The cost is the honest one, and it is named here rather than papered over:
**a Body exclusive to pi or to Codex cannot be hidden from the other at that
root.** `report-workflow-run` declares `harnesses: [pi]` and is visible to
Codex today. The leak is confined to model-invoked Bodies. Rules and Workflows
are filtered per harness as usual, because the Dispatcher owns them and reads
an index generated for one harness - which is why `PROVIDES` and `receives`
still mean what they say everywhere else.

`HUBS` therefore became one list per skills root and `DISPATCHERS` one per
harness, instead of one list doing both. A harness now joins `DISPATCHERS`
always and `HUBS` only when it brings a root nothing else already writes.

## What was considered and rejected

- **Shipping the Hub and Dispatcher as a Codex plugin.** The tidiest-looking
  option: a plugin root holds both `skills/` and `hooks/hooks.json`, which is
  exactly the pair. Rejected because installing one copies it into
  `~/.codex/plugins/cache/<marketplace>/<name>/<version>/`. The working tree
  would stop being the installed version (docs/adr/0004), and every
  regeneration would need a reinstall and a version bump - Codex ships a
  `update_plugin_cachebuster.py` script for precisely that ritual.
- **Linking `~/.codex/skills` anyway and ignoring `.system`.** The suite reads
  every file under the generated root and reports what the generator did not
  write, so this is red on the first launch. Suppressing it would be teaching
  the one check that catches a stale tree to ignore a directory.
- **Disabling the leaked Bodies with `[[skills.config]]`.** Codex can switch a
  skill off by path. It only lives in `config.toml`, which docs/adr/0004
  settled is hand-written because the harness rewrites it - and this list
  would have to be generated from the Selection, which is the exact
  build-time-versus-runtime ownership conflict that ADR rejected.
- **Raising `additionalContextLimit` to a large number instead of zero.** An
  arbitrary ceiling that silently truncates on the day someone adds a Rule.

## Consequences

- **A hook must be reviewed and trusted before it runs.** Codex hashes each
  hook definition and skips it until the human trusts it in `/hooks`, and the
  hash changes whenever the Contract changes. So installing this Dispatcher is
  `bun run link` **and** one pass through `/hooks`, and so is editing it
  afterwards. Nothing in this repository can do that half.
- **A hook never exits non-zero.** Harder here than on Claude Code: Codex
  reads exit 2 as a blocking refusal with stderr as the reason, so a
  Dispatcher that failed loudly would refuse the very prompt it was only
  meant to observe.
- **`requested` is never sent**, as on Claude Code: Codex offers no moment at
  which the outgoing request can be inspected, so docs/adr/0002's arrival
  check has no counterpart and a Rule's arrival rests on the hook reply being
  honoured.
- **`PermissionRequest`, `PostCompact`, `SubagentStart`, `SubagentStop` and
  `Interrupt` are unused.** None carries something the core has a word for
  that another event does not already carry. `SubagentStart` is the one to
  revisit if Codex subagents ever become a way to run a fan-out.
- **Hosted tools are not covered.** The manual is plain that `WebSearch` and
  its kind do not take the local function-tool hook path, and that tool hooks
  are "a useful guardrail, not a complete enforcement boundary."
