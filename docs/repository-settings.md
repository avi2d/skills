---
kind: reference
---
# Repository settings

The Dispatcher reads `.skills.json` at the repository root for Rule switches and agent test settings.
The file is optional.
It holds JSON because the Dispatcher reads it on shell calls without running repository code.

## Keys

| Key | Type | Default | What it does |
| --- | --- | --- | --- |
| `$schema` | string | none | Gives your editor a path or URL to the JSON Schema. |
| `agentTests` | object | `{}` | Groups settings for test commands. |
| `agentTests.allowLocal` | boolean | `false` | Lets agents run recognised test commands locally when `true`. |
| `agentTests.testCommands` | array of strings | `[]` | Adds runner executable names to recognise in commands, wrappers, and package scripts. |
| `agentTests.testScripts` | array of strings | `[]` | Lists globs for script paths that start tests and enter the test queue. |
| `agentTests.notTestCommands` | array of strings | `[]` | Names checks that do not run tests, so a test-named package script that runs only those checks can run. |
| `agentTests.evalConfigs` | array of strings | `[]` | Lists globs for Vitest config paths that run evaluations and enter the eval queue. |
| `rules` | object | `{}` | Groups switches for catalogued Rules. |
| `rules.on` | array of strings | `[]` | Activates Rules the session's Profile leaves out, without changing their triggers. |
| `rules.off` | array of strings | `[]` | Deactivates Rules and their write refusals. |

## Test commands

Without an opt-in, the Dispatcher refuses recognised test commands in agent sessions.
With `CI=true`, the Dispatcher does not apply the local test block.
The Dispatcher does not see commands people run outside an agent session.

The Dispatcher recognises common runners and follows scripts in `package.json`.
Build, lint, and typecheck commands can run unless they start a recognised test command.
The Dispatcher allows `bun run eval` and Vitest runs that use a listed eval config.
A command that mentions cd, pushd, popd, -C, --chdir or --dir anywhere gets no repository test settings, so a Vitest eval run that passes its own --dir to the runner queues as ordinary tests without its concurrency cap.
It does not inspect arbitrary scripts or computed shell commands.

In a glob, `*` matches characters within one path component, not across a `/`.
The glob matches the end of the path as typed, so `evals/vitest.config.ts` matches `./evals/vitest.config.ts` too.
The Dispatcher ignores invalid globs.

## Errors

The Dispatcher rejects unknown keys, incorrect value types, and a Rule listed both on and off.
A shell refusal of a recognised test command names the file and the error, and every other shell command runs.
A settings file the Dispatcher cannot read still refuses the configured test commands and script paths.
The Dispatcher logs a settings file it cannot read at a prompt, keeps the declarations it read from `package.json`, and applies no switches from it.
When `package.json` cannot be read, the Dispatcher still applies the Rule switches from `.skills.json` and reports the `package.json` problem separately.
If `package.json` contains a `skills` key, the Dispatcher's log names `.skills.json` as the place for the Rule lists.
The log also names the replacement keys when the Dispatcher reads a legacy test setting on a shell call.

## Example

This repository adds a runner and a script to the commands the Dispatcher refuses, and switches off one Rule:

```json
{
  "$schema": "https://raw.githubusercontent.com/avi2d/skills/main/schema/skills.schema.json",
  "agentTests": {
    "testCommands": ["example-test"],
    "testScripts": ["scripts/*.test.sh"]
  },
  "rules": { "off": ["fix-what-you-see"] }
}
```

## Related topics

- [How a Rule reaches a harness](how-a-rule-reaches-a-harness.md)
- [Troubleshoot skills](troubleshooting.md)
