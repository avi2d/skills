# 71. Four Rules the evals found no gain in are switched off, and a Rule left off keeps its refusal

Date: 2026-09-26

## Status

Accepted.
Records the Rule verdicts of 2026-09-25, which the captain accepted in full.
Amends 0060: an inactive Rule still refuses a write, and only a project's `agentRules.off` stands that refusal down.
Changes the premise of 0062: `writing-for-people` is switched off itself, and its prose refusal stands only through this record.
Amended by 0074: the switch that stands a refusal down is `skills.rules.off` in a project's `package.json`.
Amended by 0078: the `release-pointer` case now measures `agents-md-router`, which every Profile switches on despite that case's result for `agent-docs`.

## Context

The committed sweeps under `evals/sweeps/` inject each Rule or withhold it, five runs per arm, on Muse Spark 1.3 high, GPT-6 Luna extra high, GPT-6 Sol high and Opus 5.5 extra high.
Four Rules showed no gain on any of the four models:

- `effect-error-channel` passed `invoice-route` 5 of 5 in both arms on every model, and `scheduled-job` 5 against 4 on Muse and Luna and 5 against 5 on Sol and Opus.
- `right-size-the-work` passed `csv-migration` and `fixture-rename` 5 of 5 in both arms on every model.
- `writing-for-people` passed `readme-sections` 5 of 5 in both arms on Luna, Sol and Opus, and 3 against 5 on Muse with two injected runs unjudged.
- `agent-docs` passed `release-pointer` 5 of 5 in both arms on every model.

An injected Rule spends context in every session it reaches, so a Rule that changes nothing costs something and buys nothing.

`writing-for-people` also carries `forbid: prose`, the write-time refusal 0062 put there.
Under 0060 a Rule the Selection leaves off fires nowhere, so switching it off would also drop that refusal.
The sweeps measured the injected text and not the refusal, and a refusal spends no context until a write trips it.

## Decision

`selection.toml` switches off `effect-error-channel`, `right-size-the-work`, `writing-for-people` and `agent-docs`.
The index still carries each of them as `inactive`, so a project's `agentRules.on` can switch one back on.
The `effect-patterns`, `technical-writing`, `unslop` and `writing-for-agents` References stay offered, and so do the repository's static Effect error-channel checks.
A Reference that any catalogued Rule consults stays offered, because a Rule left off can be switched on in a project and must not point at a Reference the Hub does not offer.

A Rule the Selection leaves off keeps its refusal.
Only a project's own `agentRules.off` stands a refusal down, and the dispatch log records that switch as `switched <rule> off`.

## Consequences

`selection.toml` no longer turns a refusal off for every repository.
To drop a Rule's refusal in one repository, name the Rule under `agentRules.off` in that repository's `quality.json`.

`effect-patterns`, `technical-writing` and `writing-for-agents` cannot be switched off in `selection.toml` while a catalogued Rule consults them, even when that Rule is off.
