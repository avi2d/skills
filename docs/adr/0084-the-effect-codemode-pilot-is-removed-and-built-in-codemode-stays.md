# 84. The effect codemode pilot is removed, and built-in codemode stays

Date: 2026-10-05

## Status

Accepted. Retires 0080.
Amended by 0090: `codemode.mode` is `only` in the settings pi's agent directory takes from here.

## Context

0080 piloted `effect_codemode` for two weeks or the first 20 or so aggregation tasks, with first-try correctness, fewer input tokens and no silent wrong answer as its success terms.
Across 164 Pi sessions on both machines since it landed, the tool was called once, so the pilot produced no evidence for its terms either way.

## Decision

The pilot is removed whole: the `effect-codemode` entry in `harness/pi/settings.json`, the extension directory with its committed Effect bundle, the bundle generator and its package script, the pilot's tests and e2e fixture, and the pilot's terms in the Contract.
`esbuild` leaves with it, which only the bundle generator used.
`bun run link` retires the `~/.pi/agent/effect-codemode` link rather than leaving it dangling.
Pi's built-in `codemode`, enabled by `+codemode` in `defaultTools`, stays as it is, with no new codemode configuration added.
