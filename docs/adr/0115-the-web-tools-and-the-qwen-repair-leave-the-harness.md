---
governs: [src/generate/link.ts, harness/pi/settings.json, tests/e2e/extension-preflight.test.ts]
---
# 115. The web tools and the qwen repair leave the harness

Date: 2026-11-11

## Status

Accepted. Supersedes [0031](0031-a-leaked-tool-call-is-repaired-in-the-harness-rather-than-waited-on-upstream.md) and [0032](0032-the-web-tools-are-off-until-a-session-asks-for-them.md).

## Context

The Pi extensions cost investigation measured `pi-web-access` at 0.39 s of start-up and 83 MB of peak memory in every pi process while its tools were off. Its last call was on 2026-09-19, and none was made on the second machine. `web-tools.ts` existed only to keep those tools off, and no session has switched them on since October. `qwen-tool-calls.ts` acts only on a qwen coder model, and no such model is installed or configured on either machine.

## Decision

Remove `pi-web-access` from `harness/pi/settings.json`, with its settings file `harness/pi/web-search.json`. Remove `harness/pi/extensions/web-tools.ts` and `harness/pi/extensions/qwen-tool-calls.ts`, with their tests. Each of the three paths joins `RETIRED` in `src/generate/link.ts`, so a link removes it from $HOME.

## Alternatives

Keeping the package with its tools off costs the start-up and memory above in every process for no use. Keeping `qwen-tool-calls.ts` costs nothing at run time, but it would stay in the tree and its tests for a model no machine runs.
