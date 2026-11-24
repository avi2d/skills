---
governs: [src/generate/no-mistakes-config.ts, tests/unit/no-mistakes-config.test.ts]
---
# 117. Sonnet runs the no-mistakes pipeline steps in place of Muse Spark

Date: 2026-11-24

## Status

Accepted.

## Context

`agent_config.pi` names the model for every no-mistakes step that `reviewer_chain` and `review_agents` do not name, and it named Muse Spark.
Asked what replaces Muse Spark there, the captain chose Sonnet.
The captain kept Muse in the firstmate worker dispatch rules, which live in the dotfiles repository, as 0112 records.
no-mistakes reads only `model`, `effort` and `quota_provider` from an `agent_config` entry, so the entry cannot set `CLAUDE_CONFIG_DIR` the way a `reviewer_chain` entry can.
The claude-bridge provider takes its Claude account from the `CLAUDE_CONFIG_DIR` of the pi process, which inherits it from the no-mistakes daemon.

## Decision

`agent_config.pi` runs `claude-bridge/claude-sonnet-5-5` at high.
The entry carries no environment, so the steps it covers run on the daemon's Claude account.

## Consequences

With `claudeConfigDirs` empty, the Opus reviewer also inherits the daemon's account, so the reviewer and the pipeline steps share one account.
With `claudeConfigDirs` set, the Opus reviewer runs on its first directory and the pipeline steps stay on the daemon's account, until no-mistakes accepts an environment in `agent_config`.
The eval default model, the pi compaction settings for Muse and the firstmate dispatch rules keep Muse.
