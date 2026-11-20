---
governs: [.skills.json, schema/skills.schema.json, harness/local-tests/project-settings.ts, src/dispatcher/project.ts]
---
# 116. Repository settings live in .skills.json and local tests stay refused by default

Date: 2026-11-20

## Status

Accepted. Amends 0074 (and through it 0060, 0071 and 0073) and 0113: a project switches a catalogued Rule under `rules` in its `.skills.json`, not under `skills.rules` in its `package.json`, and agents run recognised test commands locally only when `agentTests.allowLocal` is true.

## Context

The settings-format report recommended one settings file per tool, and the skills settings file stays JSON because the Dispatcher reads it on shell calls without running repository code. The Rule lists lived at `package.json` `skills.rules.on` and `skills.rules.off`, beside the scripts, dependencies and release version that file owns. The local test settings lived under several names across checks and skills, with no shared default. The 2026-11-20 decision moves the Rule lists to `.skills.json` `rules.on` and `rules.off`, refuses the old `package.json` `skills` key with a line naming `.skills.json`, and names `agentTests.allowLocal` as the one boolean, default false, beside `testCommands`, `testScripts`, `notTestCommands` and `evalConfigs`, with the legacy `localTests` shape read and a migration naming the replacement keys.

## Decision

`.skills.json` at the repository root holds the Rule switches and the agent test settings, validated against `schema/skills.schema.json`. A `package.json` holding a `skills` key is unreadable, and the message names `.skills.json` as the place for the Rule lists. Without an opt-in the Dispatcher refuses recognised test commands in agent sessions, and with `CI=true` it does not apply the local test block. A settings file the Dispatcher cannot read keeps the declarations read from `package.json`, applies no switches, and is logged at the prompt. A shell refusal of a recognised test command names the file and the error, and every other shell command runs.

## Consequences

A repository switches a Rule on or off under `rules` in `.skills.json`, and the dispatch log, the glossary, the frontmatter page and the troubleshooting page point there instead of at `package.json`. Agent sessions run only recognised test commands past the block, and only with `agentTests.allowLocal` set true. Older Dispatcher bundles keep refusing on the previous keys, and newer schemas stay readable to the readers that ignore keys they do not know, which no session here relies on.
