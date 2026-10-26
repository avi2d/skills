---
kind: reference
---
# The harness Contracts

A harness's Contract is the settings, hooks and extensions `harness/<name>/` holds for it, and a reader looks one up to find what a harness is set to do.
[The link map](links.md) says where in $HOME each file is linked or written.

## Hand-written settings

Every file in a Contract is written by hand, never generated.
The [firstmate](#firstmate) files are the exception, and `bun run generate` writes them, as their section says.
The [no-mistakes](#no-mistakes) config is not in `harness/` at all, because it names the machine's own home.
A harness rewrites its settings at runtime, and a generated file with a second writer would fail the suite on every launch.

Every file but `harness/pi/settings.json` is linked.
`bun run link` writes `~/.pi/agent/settings.json` from that file instead, keeping the keys pi writes by itself, so pi's writes stay out of the checkout.

## pi

| File | Holds |
| --- | --- |
| `harness/pi/settings.json` | pi's settings |
| `harness/pi/keybindings.json` | pi's key bindings |
| `harness/pi/claude-bridge.json` | the settings of the `claude-bridge` provider |
| `harness/pi/web-search.json` | the settings of the web tools, whose credentials go in as `$ENV_VAR` sources |
| `harness/pi/extensions/session-name.ts` | an extension that names a session after its first prompt, a firstmate worker after its task, and leaves a firstmate main session unnamed |
| `harness/pi/extensions/qwen-tool-calls.ts` | an extension that repairs the tool calls qwen3-coder leaks into its text |
| `harness/pi/extensions/web-tools.ts` | an extension that switches the `pi-web-access` tools for a session |
| `harness/pi/extensions/herdr-model-label.ts` | an extension that shows a session's model, thinking level as one or two letters with nothing shown when thinking is off, context use as a whole percent on a window of 1M tokens or more and as absolute counts on a smaller one, and elapsed time in herdr's agent list, leading a firstmate worker's model token, one started with `FM_TASK_ID`, with `└`, and putting the model family's mark in place of the family name leading the model id: the Nerd Font Claude and OpenAI logos for `claude-bridge`, `openai` and `openai-codex`, and a dolphin and `∞` for DeepSeek and Muse under `opencode-go`, with a trailing `-contributor` on a marked name shown as `-c`, and reporting only from the pi in the pane's foreground job, so a pi started inside it under tmux leaves the pane's row alone |
| `harness/pi/extensions/transcript-style/` | an extension that puts the reply ending a turn on the user message background with an accent edge in the session firstmate launched no pane for, one without `FM_TASK_INBOX`, and leaves pi's own look whenever pi's reply component changes shape, and that colours the command of a bash call by shell syntax in the theme's syntax colours, with its strings in the theme's muted grey, and that folds the result of every tool pi has a definition for, codemode included, until a click on its block in fullscreen, or pi's expand key, opens it, and names in its dim hint the click in fullscreen and the key in regular mode: a long bash or powershell command shows its first three rows and a dim count of the rest, a user message of more than 12 rows shows its first 8 rows and a dim count of the rest on its band, a result shows one dim line with its outcome, its line count, its image count and a codemode script's call count above pi's own warnings and timing, and opened output is coloured by meaning in the theme's error, warning, success, diff and link colours instead of its grey, except a write, an edit and a read of a language pi highlights, which keep pi's own look, and the images a result carries, which pi draws outside the renderer, or which open as pi's text fallback where pi does not draw them, and that, in every session, shows the local hours and minutes pi stored with each user message, dim at the right of the last row of its band, and opens each model call with a full-width rule naming its turn number, a count of the model calls along the current branch of the session, and the context it sent, its output with the thinking share, its cache read and cache write, and its cost when pi reports one, then the stored local time of that answer, which a narrow terminal keeps whole by shortening the rule and then the figures, both times dim, never ticking, and carrying the date only when the day is not today, and puts on the last row of each tool's block, or on a row below the images pi draws, the tokens that result added to the next call, marked `≈` where it is pi's estimate, which it is until that call ends, or a share of growth split by estimate across the other messages that call carries, in the theme's warning colour from 10,000 tokens, with a click still landing on the row pi drew |
| `harness/pi/extensions/copy-selection.ts` | an extension that copies the fullscreen selection on `ctrl+x` and `super+c`, and leaves both keys silent in the editor when nothing is selected |
| `harness/pi/extensions/haiku-compaction.ts` | an extension that summarizes a `claude-bridge` session and an `opencode-go/muse-spark` session with `claude-bridge/claude-haiku-5-5` at compaction and returns nothing when Haiku is missing, fails, is cut off, or returns empty, so pi runs its own compaction, and that tells a Muse session to keep every URL with what it points to |

The `pi-web-access` tools are installed but off.
A session gets them when pi starts with `PI_WEB_TOOLS=1`, or when `/web on` is typed once the session is running.
`compaction.modelOverrides` in `harness/pi/settings.json` sets when pi compacts a session on each model it names, and every other model keeps pi's default.
On a claude-bridge model it also sets how much of the newest conversation a compaction keeps verbatim.
`haikuCompaction.enabled` in the same file turns that Haiku summary off when `false`, and the summary stays on when the key is absent.
`retry.provider` in the same file retries a rate-limited or failed provider request inside the request before the turn fails.
`ctrl+x`, the key herdr sends an agent pane for Cmd+C, and `super+c` copy the fullscreen selection, and do nothing in the editor when there is none.
`harness/pi/keybindings.json` binds both keys to `app.message.copy`, and `harness/pi/extensions/copy-selection.ts` takes them first.
In the editor `app.message.copy` copies the last assistant message when nothing is selected, and shows an error when there is no such message, so the extension swallows both keys there.
Inside `/tree` and the other pickers both keys reach `app.message.copy`, which copies the highlighted entry.
`/copy` still copies the last assistant message.
`fullscreenCopyOnSelect` is `false` in the settings, so a selection reaches the clipboard only on one of these keys.
`defaultTools` adds pi's `codemode` tool to the tools a session starts with, and `codemode.mode` is `only`, so the model sees `codemode` alone in every Profile but `ollama-qwen`.
`ollama-qwen` is the one Profile without `codemode`: its `tools` list keeps `read`, `write`, `edit` and `bash`, so that model sees those four.
A directory opts back to the normal tools with a project `.pi/settings.json` holding `{"codemode": {"mode": "on"}}`.
A `codemode` script calls only the tools the session can call, so the `pi-web-access` tools stay out of reach while they are off.
pi discovers each extension under `~/.pi/agent/extensions/` on its own, so an extension linked there needs no line in the settings.

## Claude Code

`harness/claude-code/settings.json` holds Claude Code's settings and the hooks that run the Dispatcher at `~/.claude/skills-dispatch`.
Claude Code shows the model any one hook's context past 10,000 characters only as a preview, so the prompt hook appears in the Contract more than once.
The first prompt hook cuts the Rules into parts within that limit, and hands each later hook its part.

## Codex

`harness/codex/hooks.json` holds the hooks that run the Dispatcher at `~/.codex/skills-dispatch`.
Codex trusts a hook by its hash, so installing or changing the file also needs one pass through `/hooks` in Codex.

## firstmate

| File | Holds |
| --- | --- |
| `harness/firstmate/crew-dispatch.json` | firstmate's dispatch rules on the Windows machine, which takes the heavy work |
| `harness/firstmate/crew-dispatch.mac.json` | firstmate's dispatch rules on the Mac, which takes small work, open-ended investigations and work only the Mac can reach |
| `harness/firstmate/secondmate-harness` | firstmate's secondmate harness, model and effort pin on the Mac |
| `harness/firstmate/supervision-branch-model` | firstmate's supervision branch model pin on the Mac |
| `harness/firstmate/supervision-branch-effort` | firstmate's supervision branch effort pin on the Mac |

firstmate is not a harness this repository serves, and the files are kept here only so that a file git-ignored in firstmate's own checkout has a history.
`bun run generate` writes each dispatch file from `src/generate/crew-dispatch-config.ts`, which holds each machine's rules.
It writes the three pins from `src/generate/firstmate-pins.ts`.
`src/generate/crew-dispatch.ts` holds the schema, which keeps every harness, model, effort and provider to the values firstmate can run.
It also holds the five task kinds both machines share, each with one fixed `when` and one fixed description.
A shared rule names only its kind and its candidates, and a machine's own rule, such as the Mac's, carries its own `when` and description.
A description says what a rule is for and why, names no model or effort, and stays out of the written file.
Change a rule there and regenerate, because `tests/unit/machine-files.test.ts` and `bun run generate --check` fail on a committed file that differs from what the source writes.
Both files set `array_order` to `preference`, so firstmate takes the first candidate that quota-axi shows usable.
A Haiku 5.5 candidate carries a `floor` on the Claude `all_models` scope, so firstmate skips it while either Claude window holds under 15%.
`bun run link` links the Mac's file on macOS and the other one on every other platform.
It links the three pins on macOS only.
`tests/unit/crew-dispatch.test.ts` fails on a profile whose effort pi would run at another level.
pi silently moves an effort a model does not support to the next level up that it supports, or else down.

## no-mistakes

`bun run generate` writes the no-mistakes global config to `generated/no-mistakes/config.yaml` from `src/generate/no-mistakes-config.ts`, for the machine it runs on and the `$HOME` it runs under, and `bun run link` links `~/.no-mistakes/config.yaml` to it.
The schema knows only the fields no-mistakes reads, because no-mistakes refuses a config file with a field it does not know.
In `reviewer_chain`, the review step tries GPT-6.1 Sol on the Codex $20 account, then Opus 5.5 on the clauth account `second`, then Opus 5.5 on the clauth account `main`.
The review step runs Sol while the Codex five-hour window holds 30% or more.
The second entry has no usage floor, as [record 0101](adr/0101-the-second-claude-reviewer-is-the-max-account-and-loses-its-usage-floor.md) records, so the review step tries it whenever Sol is skipped.
pi names Sol `openai/gpt-6.1-sol` on both machines.
The login folders of `second` and `main` sit under `~/.claude-accounts/`, and the review step skips the `second` entry while its folder holds no Claude Code login.
`minimax_extra_review` adds MiniMax M3.1 Flash as an extra advisory reviewer beside the normal review.
It stays enabled in the generated config and falls back to Muse Spark when MiniMax errors, times out or disappears.
`beam_drafts` holds Beam draft settings for the commit and document steps with one retry on an empty answer and an apply check on every edit.
It stays disabled in the generated config and falls back to Muse Spark when Beam errors, times out or disappears.
Both uses run only in skills, checks, fleet-dash, tui-dash and ru-compliance, and every other repo fails closed.
`review` holds one path instruction over every changed file that reviews added comments against comment discipline as warnings that never fix or block.
It flags a comment that restates its line or carries a measured number that will go stale, and it keeps a comment that gives a reason the code cannot show.
`bun run link` refuses a real `~/.no-mistakes/config.yaml` and leaves it as it was, so a config kept by hand is moved aside before the link replaces it.

## Related topics

- [The link map](links.md)
- [How a Rule reaches a harness](how-a-rule-reaches-a-harness.md)
- [Glossary](glossary.md)
