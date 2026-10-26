# 90. Pi sessions see codemode alone, and a supervising session opts back

Date: 2026-10-08

## Status

Accepted. Amends 0084: built-in `codemode` gains one setting, `codemode.mode` set to `only`.

## Context

0084 kept pi's built-in `codemode`, enabled by `+codemode` in `defaultTools`, with no codemode configuration beside it.
With `codemode.mode` at its default `on`, the model sees `read`, `bash`, `edit` and `write` declared next to `codemode`, and can call either.
With `codemode.mode` set to `only`, Muse Spark sent every tool call through `codemode` on 18 of 18 runs, with correctness unchanged and about 19 percent fewer tokens.
Pi reads the key only nested as `"codemode": {"mode": "only"}`, and a flat dotted `"codemode.mode"` key loads without error and does nothing.
A project's `.pi/settings.json` overrides the agent directory's settings.

## Decision

`harness/pi/settings.json` holds `"codemode": {"mode": "only"}` beside `"defaultTools": ["+codemode"]`.
Workers, scouts and the no-mistakes pi steps run with `codemode` alone for every model whose Profile keeps `codemode`.
A supervising session opts back to `on` through a `.pi/settings.json` in its own project.

## Consequences

The model in a session under the agent directory's settings sees `codemode` alone, and calls the ordinary tools from a script.
The `ollama-qwen` Profile names `read`, `write`, `edit` and `bash` as its tools, so that model keeps the four and has no `codemode`.
The Dispatcher still sees each tool a script calls, because pi passes those calls through the `tool_call` and `tool_result` handlers.
`tests/unit/link.test.ts` fails when the nested key is missing or holds another mode.
