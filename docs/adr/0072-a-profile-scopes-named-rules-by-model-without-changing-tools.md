# 72. A Profile scopes named Rules by model without changing tools

Date: 2026-09-26

## Status

Accepted. Amends 0060: a Profile scopes only its named Rules by exact model identity and never changes the session's tools, and the opening cut for local models moves to a Cut.
Amended by 0073: a Profile lists every Rule, Skill and Reference its models receive, the Cut is gone, and a Profile's own tools list trims pi's tools.
The model identity each harness reports still stands as this record spells it.

## Context

A Profile in `selection.toml` matched a provider, replaced the Rules a session opened with, and reduced its active tools to a hard allowlist.
A Profile meant to target Rule text could therefore remove web and MCP tools from a pi session.
The one Profile in use, `local`, cut what an `ollama` worker opens with from 6,058 tokens to 3,452 before the task: Rules from 1,901 to 668, and tools from 6 to 4.

The accepted eval results are case-specific.
The watched-red instruction moved from 0/5 withheld to 5/5 injected on GPT-6 Luna and GPT-6 Sol.
The co-author instruction moved from 0/5 withheld to 5/5 injected on Opus 5.5.
The changelog instruction moved from 0/5 withheld to 5/5 injected on GPT-6 Luna, and from 2/5 to 5/5 on GPT-6 Sol.
The log-reading instruction moved from 0/5 withheld to 5/5 injected on Muse Spark.
The `git-hygiene` cases measure separate instructions, so one Rule Body cannot target them independently.

Pi reports both a model provider and ID.
Claude Code names the model in an interactive session's SessionStart payload, and names the new one in `to_model` when a PostModelSwitch hook fires.
In print mode, `claude -p`, no hook payload names a model.
It names no provider.
Codex names no model in a hook payload, but the session record at `transcript_path` holds a `session_meta` line with the session's `id` and `model_provider`, and a `turn_context` line per turn with its `model`.

## What was considered and rejected

**Keep a provider Profile as a Rule and tool allowlist.**
A tool allowlist can remove web or MCP tools, and a provider name cannot distinguish models that share that provider.

**Treat the Profile's Rule list as a replacement set.**
That would suppress every Rule not named by a matching Profile.

**Drop the local cut along with the provider Profile.**
Local workers would open with every Rule and every tool again, and lose the measured saving.

**Keep a scoped Rule in force after a switch to a model outside its Profiles.**
The request would go on carrying a Rule the evals found no gain in for that model.

## Decision

A Profile names exact `models` and the `rules` it scopes.
A model identifier is the one each harness reports, and a Profile lists one alias per harness.
From pi it is the provider and model ID joined by `/`.
From Codex it is the recorded `model_provider` and the latest `turn_context` model, joined by `/`, read only from a record whose `session_meta` names the hook's session.
From Claude Code it is `claude-code/` and the model it names, with a trailing context annotation such as `[1m]` dropped, because Claude Code names no provider and the Dispatcher does not guess one.

A Rule named by any Profile is scoped.
When the Dispatcher knows the model identity, the Rule fires only if a Profile names both that model and the Rule.
A Rule no Profile names keeps its existing behavior.
The hook adapters keep the last identity they read in the session's state, so a prompt that names no model is judged by it.
A hook that reveals a model other than the one kept is a model switch.
A session whose identity is absent, malformed or unreadable leaves all scoped Rules open.

Profiles do not change tools or Rules they do not name.
They gate prompt injection and tool-triggered delivery.
Write refusals still follow Selection and project switches.
When the session switches to a model outside a scoped Rule's Profiles, the core withdraws that Rule, and the pi Dispatcher stops carrying it.
A hook harness cannot take back what it already injected, so there the withdrawal keeps a compaction from putting the Rule back.

The local cut moves to a Cut, a separate `[cuts.<name>]` table naming `providers`, `rules` and `tools`.
A session on a claimed provider opens with only the Cut's Rules and holds only the Cut's tools among those it opened holding.
A Rule the Cut names opens there even when a Profile scopes it to other models.
A switch away from a claimed provider hands back what the session opened holding.

`force-determinism` keeps the Body the sweeps measured and is scoped to GPT-6 Luna and GPT-6 Sol.
`git-hygiene` holds only the changelog instruction and is scoped to GPT-6 Luna and GPT-6 Sol.
`git-hygiene-co-author` holds the co-author instruction and is scoped to Opus 5.5.
`guard-the-context-window` keeps its narrow log-reading instruction and is scoped to Muse Spark.
The `co-author` eval case moves to `git-hygiene-co-author`, the Rule that now holds its instruction.

## Consequences

`selection.toml` Profiles use `models` and `rules`; `providers` and `tools` are Cut fields.
The generated index carries the Profiles and the Cuts.
Pi supplies the current provider and model ID at session start, prompt, and model switch.
Claude Code supplies its model at session start and at a PostModelSwitch hook, which its settings now run.
Codex supplies its model through the session record, read at every hook.
The Opus 5.5 Profile names `claude-code/claude-opus-5-5`, and the GPT-6 Luna and Sol Profiles name `openai/gpt-6-luna` and `openai/gpt-6-sol`, beside their pi aliases.
A known model outside every matching Profile receives no Profile-scoped Rule.
A harness that supplies no model identity, such as Claude Code in print mode, receives them as before.
A local worker on `ollama` opens with the same two Rules and four tools as before.
