# 80. Effect codemode is piloted on pi's own sandbox, behind one settings entry

Date: 2026-10-03

## Status

Retired by 0084, which removes the pilot after one call in 164 sessions. Built-in `codemode` stays the only codemode.

## Context

Pi's built-in `codemode` tool runs a model-written script in a QuickJS sandbox, so a script can read several large results and hand only a small answer back to the model.
Nothing holds that script to a contract: it can return anything, read a failed `bash` result as if it succeeded, and end on a thrown error the model has to interpret.

An investigation ran a prototype that preloads Effect 4 and Effect Schema into a QuickJS VM and holds three contracts by program.
A script must return an Effect, every tool result is decoded through a Schema before the script reads it, and an unhandled failure becomes a failed tool result instead of a crash.
On a task that counts the failed rows in three 100-row JSON files read through `bash`, a model wrote a correct Effect script on the first try.
The run took 2,220 input tokens and 4.1 seconds, where calling `bash` directly took 12,439 input tokens and 8.8 seconds.

The prototype ran its own worker on its own pin of `quickjs-wasi`, which pi also pins, so every pi upgrade would have to be matched by hand.
`@earendil-works/pi-codemode`'s `CodemodeSandbox` takes no prelude, but it runs whatever async function body it is given.
Pi loads an extension through jiti from the path it was linked at, so a linked extension resolves no package from this checkout's `node_modules`.
jiti also refuses `@earendil-works/pi-codemode` itself, whose `exports` name only an `import` condition.
`@earendil-works/pi-coding-agent` exports `createCodemodeExtension`, and pi hands that package to every extension.

## What was considered and rejected

- **Keeping plain codemode.** It is right when few tasks aggregate, and it holds none of the three contracts.
- **Piloting the standalone prototype.** It starts faster, because it can snapshot a VM after the bundle loads, but it pins a QuickJS build of its own.
- **Importing `CodemodeSandbox` from `@earendil-works/pi-codemode`.** jiti cannot resolve it, as the context says.
- **Decoding tool results in the extension with the `effect` package.** A linked extension cannot resolve `effect`, so the decode runs inside the sandbox on the bundle's own Schema.

## Decision

`harness/pi/extensions/effect-codemode/` registers one tool, `effect_codemode`, with `model-only` exposure, so another script never calls it.
It runs each script through the `codemode` tool that `createCodemodeExtension` registers, caught before it reaches pi, so it uses pi's own sandbox, QuickJS build and worker.
`composeScript` in `prelude.ts` sends that sandbox one body: the model's script closed over on its first line, then the shims for `TextEncoder`, `TextDecoder`, the timer functions and `AbortController`, then the Effect bundle, then the runner.
Pi's sandbox already provides `console`.

The runner holds the three contracts:

- A script whose value is not an Effect fails, and `exit()` fails too, because it ends a script without one.
- A `bash` or `powershell` result decodes through a Schema that requires `exit_code` 0 and `truncated` false, so a failed command rejects its call, and every other tool's value decodes through `Schema.Json`.
- A failed call rejects. Pi's `codemode` hands a script the structured content of a failed call as its value, so the extension drops that content from every failed call before `codemode` reads it.
- The runner runs the Effect with `Effect.runPromiseExit`, and a failure or a defect fails the tool call with the error and its causes.

`src/generate/effect-bundle.ts` builds `effect-bundle.js` from the `effect` this repository pins, with the `esbuild` this repository pins, and `bun run effect-bundle` writes it.
`tests/unit/effect-codemode.test.ts` fails when the committed bundle differs from a fresh build.

`bun run link` links `~/.pi/agent/effect-codemode` to the extension's directory, outside `~/.pi/agent/extensions/`, where pi would load it without asking.
The `effect-codemode` entry in the `extensions` list of `harness/pi/settings.json` is what turns it on.
The built-in `codemode` tool and the ordinary tools stay on.

The pilot's terms:

- **Scope.** Workers doing read-heavy aggregation only, meaning multi-file counts, filters and joins, while small reads, writes, merges and decisions stay on ordinary calls.
- **Length.** Two weeks, or the first 20 or so aggregation tasks, whichever comes first.
- **Success.** First-try correctness at least as good as built-in `codemode` on the same tasks, fewer input tokens than built-in `codemode` on those tasks, and no silent wrong answer.
- **Switch off.** Remove `effect-codemode` from the `extensions` list in `harness/pi/settings.json` and run `bun run link`, and workers fall back to built-in `codemode` with nothing else to undo.

## Consequences

Every call evaluates the 0.29 MB bundle in a fresh VM, because pi's sandbox keeps no snapshot.
A call costs about 0.2 seconds on the Windows machine before the script's own work.

The sandbox has no clock, so `Effect.sleep` and every timeout fail with an error that says so.

The extension reads `createCodemodeExtension` and the codemode tool's `execute` from pi's public exports.
A pi release that changes either breaks the extension, and the unit test, which loads it through pi's own loader, fails on that release.

A pi release that changes its codemode prelude can break the bundle.
The same test runs every Effect case in the sandbox of the pi this repository pins, so bumping that pin runs them against the new release.
