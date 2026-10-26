# 73. A Profile is a complete model selection

Date: 2026-09-26

## Status

Accepted. Amends 0060, and amends 0072 in its selection and tool decisions while keeping its model identities.
Amended by 0074: a repository switches a Rule under `skills.rules` in its `package.json`.
Amended by 0085: only `profiles.default` names Skills and References, and every Profile shares them.
Amended by 0088: a Profile outside the default names only additions in `add` and removals in `drop`.

## Context

`selection.toml` had four independent choices: Kind switches, Body switches, model-scoped Rules and a provider-wide tool cut.
Their interaction made the effective selection for a model hard to read from the file.
The local cut also applied to any future Ollama model, whether or not it had been tested.

The three harnesses do not offer the same controls.
The installed pi 0.87.1 extension API declares `model_select`, `getActiveTools` and `setActiveTools` in `dist/core/extensions/types.d.ts`.
Pi's `docs/skills.md` says it scans skill locations at startup and lists the discovered skills in the system prompt.
Its `docs/settings.md` names the eight built-in tools, and `docs/extensions.md` confirms that `setActiveTools` changes active tools before the next model request.
The skill loader has no model parameter.
Claude Code 2.1.283 accepts `--tools`, `--allowedTools`, `--disallowedTools` and `--model` as startup options, but its `PostModelSwitch` hook in `harness/claude-code/settings.json` has no tool-list update operation.
Its user skills are read through the shared `~/.claude/skills` link.
Codex reads `~/.agents/skills` as a skill root, as the live-session evidence in 0022 records.
The Codex hook settings in `harness/codex/hooks.json` contain session, prompt and tool events, not an operation to change its available tool list.
Its model identity is recorded in the session rollout, not in a tool-setting callback.
A hook can refuse an individual call, but a refusal does not remove a tool from the model's list.

## Decision

`profiles.default` supplies the complete Body lists for unknown and unreported models.
Each other Profile names exact model aliases and its complete Rules, Skills and References.
A Profile lists tools only when it trims the tools the harness gave the session.
Generation refuses a Body that is not in the tree and a model two Profiles claim.
It does not check a model or a tool against a catalogue, because a pinned catalogue would refuse a newer or custom model.
Unlisted Bodies are inactive.
A repository may still activate an inactive Rule through `agentRules`.

The shared Hub offers one set of Skills and References to all three harnesses.
Generation rejects different Skill or Reference lists between Profiles rather than claiming a per-model Hub it cannot deliver.
Generation rejects tools on the default Profile and on any Profile naming a model outside the `ollama` provider.
The Dispatcher trims the exact configured Ollama model to its four named coding tools and restores what the session opened holding after a switch to a Profile without tools.
Other Profiles have no tools list and leave the harness's starting tools alone.

The local model configured in `~/.pi/agent/models.json` at this decision is `ollama/qwen3.6:35b-a3b-iq3s`.
That exact alias replaces the provider-wide cut.
A future Ollama model uses `profiles.default` and keeps its starting tools until added to a Profile.

## Consequences

One Profile shows the full Rule set a model can receive without adding a scoped Rule to the default implicitly.
The default Profile names no tools and keeps any tools the harness or its extensions enabled.
The shared Hub cannot enforce a Profile that varies Skills or References by model, and Claude Code and Codex cannot enforce one that varies tools.
Their attempted differences stop generation instead of silently falling back.
