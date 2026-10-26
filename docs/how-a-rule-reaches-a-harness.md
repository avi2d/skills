---
kind: explanation
---
# How a Rule reaches a harness

How does an instruction written once here arrive in a pi, Claude Code or Codex session at the moment it applies?
`bun run generate` builds one Hub and one Dispatcher bundle per harness, `bun run link` points each harness at them, and each Dispatcher puts a Rule into the conversation when its trigger matches.

## The checkout is the install

This repository installs itself, and nothing else holds a path into it.
`src/generate/link.ts` declares every link, and the suite holds the map complete, so a file in the tree that no link reaches fails rather than sits inert.
The working tree is the installed version, and a Hub entry links to the Body rather than to a copy of it, so no Hub holds an edit that has not landed.

Two things are still built.
The Hub changes when a Body is added, removed or reselected.
The dispatch index carries each Rule's prose, so a Rule whose text was edited is injected as it was last built until `bun run generate` runs.
`generated/` is ignored rather than committed, so a change to the source is one diff instead of the same change twice, as [record 0021](adr/0021-the-emitted-tree-reaches-a-clone-through-the-generator.md) records.

`bun run link` writes the bundles, reconciles the Hub, loads pi in a temporary home, and then installs the map, in that order and never another.
Five of the links point into directories a clone does not have, so linking first would leave $HOME holding links to nothing.
A run that stops on a bad Body installs nothing at all.
A run where the installed pi fails to load an extension the map links installs nothing either, as [record 0082](adr/0082-a-link-waits-until-pi-loads-every-extension-in-a-temporary-home.md) records.
The links it leaves still point into the checkout, so the bundles it wrote and an extension already linked reach the harnesses all the same.
A run whose $HOME is the account's own home, as its passwd record names it, installs only from `~/Projects/skills`, and from any other copy it stops before it writes, so a worktree cannot repoint the live harnesses into itself.

The linker repoints links and refuses real files.
The one exception is `~/.pi/agent/settings.json`, which it writes from the checkout as a file of the machine's own, so a change to `harness/pi/settings.json` reaches pi only at the next `bun run link`, as [the link map](links.md#the-files-it-writes) says.
On a machine where home-manager still owns these paths, the previous owner has to let go before the new one takes hold, as [record 0004](adr/0004-the-repo-installs-itself-and-the-contract-stays-hand-written.md) records.
The linker removes only the paths `RETIRED` in `src/generate/link.ts` names, each one only while it is still a link into this checkout.
Dropping an entry from the map says nothing to any machine, so a path leaves the map by moving to `RETIRED`, and every machine that runs the linker again lets go of it, as [record 0020](adr/0020-a-path-home-took-from-here-is-retired-rather-than-forgotten.md) records.

## The Hub

`bun run link` points every skills root at the one Hub, so `~/.agents/skills` and `~/.claude/skills` both resolve to `generated/skills/`.
The link carries the Hub as it stands and parses nothing, because everything about what is in it was decided here.
Both harnesses follow a linked entry into the tree it points at, which is what lets a Hub hold links rather than copies.
The Hub holds Skills and References, which a harness reaches by name.
Rules reach a harness through the dispatch index instead, because a Rule is injected by its trigger, as [record 0039](adr/0039-the-hub-holds-what-a-harness-reaches-by-name-and-there-is-one-of-it.md) records.

Each skills root is a directory another tool may install into as well, so the Hub is reconciled rather than rewritten.
An entry that is a link into this repository is one this repository made and may remove, and everything else is left where it stands, as [record 0029](adr/0029-a-hub-is-links-into-the-tree-and-is-reconciled-rather-than-rewritten.md) records.
The one exception is a per-harness root an earlier build wrote.
The reconcile retires that root, moving what another tool installed there into the Hub and reporting it as `moved`, and refuses when the Hub already holds that name with different bytes.

Codex has no Hub link of its own, because it reads `~/.agents/skills` natively as pi does.
Its own `~/.codex/skills` is not linked, because Codex fills that directory's `.system` with the skills it ships, and a root this repository writes has one writer.

## The Dispatcher bundles

pi's Dispatcher is `generated/pi/extension`, linked into `~/.pi/agent/extensions/`, where pi discovers `<dir>/index.ts` on its own.
Claude Code's is `generated/claude-code/dispatcher`, linked at `~/.claude/skills-dispatch` and run by the hooks its Contract registers.
Codex's is `generated/codex/dispatcher`, linked at `~/.codex/skills-dispatch` and run by the hooks in `harness/codex/hooks.json`.

Each bundle is a directory because pi loads extensions with jiti, which resolves a relative import from the path it was handed rather than from what that path points at.
A single linked file cannot see its own siblings, so the generator gathers the adapter, the dispatch core and the index of Rules into one flat directory, and the suite fails if any module in it reaches outside.
`src/dispatcher/pi-dispatcher.ts` sits beside `src/dispatcher/dispatch.ts` for the same reason, because a source laid out the way the bundle is needs no rewriting when it is copied.
The two modules not taken from `src/` are `comments.ts` and `prose.ts`, the checks kit's own files under the names `src/dispatcher/comments.ts` and `src/dispatcher/prose.ts` re-export them by, so a Dispatcher refuses exactly what the kit's comment and docs gates refuse.

## Where dispatch logic goes

Two seams, and no third.
The core is `src/dispatcher/dispatch.ts`, a pure function of the generated index, one event and the run state, with the verdict gate's judgment in `src/dispatcher/verdict.ts`, the Profile judgment in `src/dispatcher/model-scope.ts`, and each action's log line in `src/dispatcher/dispatch-log.ts`.
Every decision about what fires lives in the core and is tested in `tests/unit/dispatch.test.ts` and its `tests/unit/dispatch-*.test.ts` siblings without starting a harness.

`src/dispatcher/pi-dispatcher.ts` and `src/dispatcher/claude-dispatcher.ts` translate their harness's events into that function's inputs and its actions back into that harness's primitives, and hold no judgment of their own.
A condition about whether a Rule should fire belongs in the core even when it is easier to write in the adapter, and a difference between harnesses the core can absorb belongs there rather than in each adapter.
The index also carries the Rules `selection.toml` leaves off, marked `inactive`, so a repository's `package.json` can switch them on.
A new place in the core that fires a Rule asks `switchedOn` first, as `tests/unit/dispatch.test.ts` holds.
A refusal is the exception on purpose.
A `forbid` spends no context, so it stands unless a project switches the Rule off, as [Frontmatter fields](frontmatter.md#forbid) describes.

Reading a hook's reply back from a harness's transcript is translation the two hook adapters share, so it is `src/dispatcher/transcript.ts`, bundled into both.
The rest the two hook adapters share is `src/dispatcher/hook-harness.ts`, also bundled into both, so an adapter hands it a `HookAdapter` holding only what its harness does differently.
The index check all three adapters share is `src/dispatcher/read-index.ts`.
Which shell command goes to the job queue is decided in `src/dispatcher/job-queue.ts`, which reads a command's words through `src/dispatcher/shell-words.ts`, and each adapter hands it the command and applies what it returns, as [Heavy commands go to the job queue](#heavy-commands-go-to-the-job-queue) describes.
`src/dispatcher/gate.ts` is I/O the three adapters share for the verdict gate, reading `.no-mistakes.yaml` through `src/dispatcher/gate-config.ts`, and whether a settle is checked, held or let go is decided in `src/dispatcher/verdict.ts`, as [record 0048](adr/0048-a-session-that-changed-the-tree-settles-past-the-checks-its-push-gate-runs.md) records.

A Profile is declared in `selection.toml` and nowhere else.
`bun run generate` resolves each Profile's additions and removals against the default into the dispatch index, and `dispatch.ts` withdraws Rules a model's Profile drops.
The [Glossary](glossary.md#profile) holds what a Profile is.
An adapter reports the model identity its harness gives, as [record 0072](adr/0072-a-profile-scopes-named-rules-by-model-without-changing-tools.md) spells it per harness, and the tools the session opened holding, then does as the core says.
A name that belongs in a Profile does not belong in an extension.

Holding no judgment does not make an adapter free of mistakes the core cannot see.
The dispatch log reports the right action asking the harness for the wrong thing as having happened.
`tests/unit/pi-dispatcher.test.ts` drives the bundle's own bytes under a stub of the few members of pi's API it calls.
`tests/e2e/claude-dispatcher.test.ts` runs the Claude bundle as the process Claude Code runs, payload on stdin and reply parsed off stdout.

`src/dispatcher/comments.ts` and `src/dispatcher/prose.ts` stand in for the checks kit's matchers, which every bundle ships as `comments.ts` and `prose.ts`, so bundle those files and never the re-export itself, as [record 0051](adr/0051-a-banned-comment-is-refused-at-every-write-by-the-kits-own-matchers.md) and [record 0062](adr/0062-a-separator-in-a-doc-is-refused-at-every-write-by-the-kits-prose-matchers.md) record.

## Rules ride the conversation

The pi Dispatcher puts every Rule in force into one message at the front of what pi is about to send, at `context`, on every call the model is asked to make.
A Rule is injected once and the dispatch log says so once, and pi is handed the Rule on every call after that, because what is returned at `context` is used for that call and never written to the session.

The system prompt was the carrier once, and on the `claude-bridge` provider no Rule arrived, because that provider rebuilds the prompt from structured fields the Rule text is in none of.
The conversation is the one carrier no provider rebuilds, because the conversation is the request, as [record 0002](adr/0002-a-rule-reaches-the-model-in-the-conversation.md) records.
One carrier covers both moments a Rule can fall due, since `context` runs before every model call and not once a turn.

The Dispatcher asks the predicates that describe the context at the prompt, because the prompt is the one moment every Context reaches.
pi does not announce a sub-agent, so a predicate asked at a session start is a predicate a sub-agent is never asked, as [record 0001](adr/0001-a-sub-agent-holds-the-rules-its-own-context-earns.md) records.
A Rule that a write or a tool call fires is delivered into the turn that matched, because a Rule that lands after the writes it governs is the cleanup pass it was meant to replace.

## Claude Code and Codex

Claude Code's Dispatcher is a bundle the hooks in its Contract run, one process per event, so the whole RunState goes to disk between them.
Rules arrive as context on prompt submission.
A Rule that falls due at a tool call denies the call and rides back as the reason, which is the one primitive that both stops the write it governs and reaches the model mid-turn, as [record 0019](adr/0019-a-rule-that-falls-due-mid-turn-arrives-as-a-refusal.md) records.
Claude Code shows the model any one hook's context past 10,000 characters only as a preview, so the prompt hook is in the Contract more than once.
The first prompt hook cuts the Rules into parts between Rules, each within the limit, and hands each later hook its part, as [record 0054](adr/0054-claude-code-carries-a-prompts-rules-in-parts-one-per-prompt-hook.md) records.

Codex's hook model is Claude Code's in almost every particular, with the same events, the same JSON on stdin and the same keys on the way out.
The Codex adapter is close to a copy of Claude Code's, and differs in the places [record 0022](adr/0022-codex-hooks-like-claude-codes-and-a-hub-that-is-pis.md) lists.
An edit arrives as one `apply_patch` carrying a whole patch rather than as a call per file, so a `file-matches` Rule is asked about every path in it.
Blocking the stop starts the next turn with the reason as its prompt, instead of refusing to end this one.
Rules are sent with `additionalContextLimit: 0`, because by default Codex replaces anything over about 2,500 tokens with a preview of its head and tail, which is a Rule that did not arrive.

## The hand-off is checked

The pi Dispatcher tells the core what it is contributing, and a Rule the core has in force that is not whole in those bytes reads as `broken` in the dispatch log, naming the Rule.
That check reaches as far as pi and no further.
It catches the core and the adapter disagreeing, and it cannot see what a provider does next.

Claude Code and Codex check their hand-off against a different record, because neither lets a hook see the request.
Both name a transcript to every hook, so the Dispatcher reads the reply back from it at a later hook.
It reads only the entries each harness writes for a hook's reply after that hook ran, and waits until the model has answered after them.
A Rule that is not there whole reads as `broken`, and a transcript the Dispatcher could not read says so in the log, as [record 0053](adr/0053-a-hook-harness-reads-a-rules-arrival-back-from-its-transcript.md) records.

## Heavy commands go to the job queue

A whole test suite, an eval run, or a GPU benchmark or model inference an agent starts goes through pueue, so sessions on one machine take turns at it.
Every Dispatcher asks `src/dispatcher/job-queue.ts` about each shell command before it runs.
That module is no Rule, so it costs the model no context.
Its table sends a whole test suite, such as `bun test` with no path or `bun run test` with no filter, and every mutation run to the `tests` group.
A test run counts as targeted only when it names something that exists, carries a test-name filter, such as `-t`, `-k` or `--grep`, or runs only what `--changed` affects.
The table lists, for each runner, only the options whose value is a path, such as `--config`, `-c`, `--root`, `--dir` or `--preload`, and each of those takes the next word unless it starts with `-`.
Every other option is a flag that takes nothing.
A word left over names a target only when it is a file or directory, or a glob that matches one, relative to the hook's working directory or any directory the command names through `cd`, `--cwd` or `env -C`.
Only an enabled watch mode, `--watch`, `-w` or `--watchAll` with no value or `=true`, runs as it is, because a queued job would hold its slot forever, so `--watch=false` and `--no-watch` are still the whole suite.
So `bun test --timeout 20000` and `vitest run --reporters dot` are the whole suite because `20000` and `dot` are no paths, and `bun run test -- --randomize tests/unit/a.test.ts` is targeted because that file exists.
A package script's runner is unknown, so it takes the path options and filters of Bun and Vitest together.
A mutation run is heavy whatever it names.
A prefix such as `env`, `nice`, `timeout`, `npx` or `pnpm exec` is skipped with its own options and operands before the table is read.
It sends an eval run, `bun run eval`, `pnpm eval`, `yarn eval` or `vitest run` with `--config evals/vitest.config.ts`, to the `evals` group whatever it filters, since every run starts sandboxed agents, and only watch mode runs as it is.
An eval run queues with its concurrency capped at 3 rather than refused: in the eval's own simple command, an `EVAL_CONCURRENCY` assignment above 3 or not a number is rewritten to 3, and a command that assigns none gains `EVAL_CONCURRENCY=3`, since the harness default is 4.
The cap holds for each eval command, so evals joined with `&` or `|` in one call share one slot at 3 each.
It sends model inference to the `gpu` group only in a shape that exits on its own: `rembg i` and `rembg p` without a watch option, and `whisper`, `whisper-cli` or `whisper-cpp`.
The same holds for those tools run through `uv run` or `uvx` and for `python -m rembg` or `python -m whisper`, so a server such as `llama-server` or `rembg s` runs as it is, and so do `llama-cli` and `llama-run`, which can open a chat that waits on input whether or not they carry a prompt.
A python script queues when its `uv run` declares an inference package through `--with` or `--from`, such as `rembg`, `onnxruntime`, `torch`, `transformers`, `diffusers`, `llama-cpp-python`, `faster-whisper` or `openai-whisper`.
A declared package counts only for a `.py` script, so `-m` and `-c` with declared packages, a GPU distribution such as `onnxruntime-gpu`, and an interpreter flag ahead of `-m` or the script are left alone and run as they are.
A plain `python script.py` declares nothing, so it runs as it is, because the table never reads a script.
`tests/unit/job-queue.test.ts` names the reason for each entry.
A command the table does not name runs as it is.
The table recognises the common spellings listed here, and other spellings, such as uv option aliases, uvx package specs, `uv tool run`, and commands joined with `&` or `|`, run as written, with the per-group memory caps on the Windows machine as the backstop.
A call that needs the `tests` and the `gpu` group, such as `bun test && llama-bench -m model.gguf`, is refused with a message to run the tests and the GPU command as separate tool calls, since one queued job holds one group's slot.
A call that mixes an eval with another queued command is refused with a message to run the eval and the other command as separate tool calls.
A command that already calls pueue hands its work over as one quoted word, which the table never names, so the queued command is never queued twice.

A queued command becomes `pueue add --print-task-id --group <group> -- '<command>'`, then a wait on that task and the last 40 lines of its log.
The agent sees the task's output, and the command fails when the task fails.
pi rewrites the call's input at `tool_call`.
Claude Code and Codex rewrite it through `updatedInput` in their PreToolUse reply.
Codex applies a rewrite only beside an `allow`.
Claude Code applies it bare, so its own permission check still runs on the queued command.
When `pueue` is not installed, its daemon is down, or it lacks a group the command needs, the command runs as it is.
A queued job runs under the pueue daemon, outside any sandbox, so Codex queues or refuses a command only in a full-access turn and never overrides a restricted sandbox, whatever its network setting.
The Dispatcher reads that sandbox from the latest `turn_context` in the rollout, and runs the command as it is under any other sandbox or a rollout it cannot read.
Each queued or refused call is a `job-queue` line in the dispatch log naming its groups, and never the command, which can carry a credential.

## The dispatch log

Everything a Dispatcher does is appended to `~/.local/state/skills/dispatch.log`, including a Rule whose predicate could not be asked.
A Rule still due when the session ends is written down too, because a queue with nothing after it reads exactly like a Rule that arrived.
A switch under `skills.rules` in a repository's `package.json` that changes something is logged once a session, and a switch naming a Rule the index does not carry is logged as the Dispatcher's problem.
A read of a Body's `SKILL.md` is logged as a `pull` naming the Body once the read has succeeded, so a read that was denied or failed is no pull.
pi reports it at `tool_result`, and Claude Code at `PostToolUse`.
Codex reads a `SKILL.md` through its shell, and the Dispatcher does not parse shell commands, so a Codex read is no pull and Codex pulls are not counted.
The line holds neither the file's text nor the request that led to the read.
A read of another file under the same Body is not a pull.

Every Context a Dispatcher loads into is named in the log.
A top-level session is named for its session file.
A Context pi gives no session file for, such as an in-process sub-agent, is given a minted name, so two sub-agents running at once can be told apart.
A minted name is new every time, so a Context that has one cannot be resumed under it.
A start that carries the session on, such as pi's reload or Claude Code's and Codex's resume, keeps what the session has already injected, so a resumed session is not sent the whole rule set again at its next prompt.

## The verdict gate

A repository's primary working tree with a `no-mistakes` remote, whose `.no-mistakes.yaml` declares checks for its push gate, gets those checks at the end of a turn as well.
A linked worktree does not.
A checkout with `skills.verdictGate` set to `off` in its local git config has no gate either.
Run `git config --local skills.verdictGate off` there to opt out.
When a session there settles on a tree that differs from the tree the human handed it, the Dispatcher runs `commands.test` and `commands.lint`, read from `origin/HEAD` the way no-mistakes reads them.
A failure holds the turn open with the command and the last of its output.
Claude Code and Codex block the stop, and pi continues the run from `agent_before_settle`.
The gate holds twice a prompt at most, then lets the session go and tells the human.
Every check shares one budget of two minutes, and a tree already judged is not checked again.
A check still running when the budget ends is killed with every process still under it, and a job whose parent already exited is out of reach.
Each check runs with `SKILLS_CHANGED_FILES` holding the files the settle changed, one repo-root-relative path per line: what landed since the prompt's commit and what the working tree changed, less anything that is no longer a file or symlink.
A command that does not read it sees no difference, and a lint that takes paths opts in by naming it in its own declaration.
A listing past 64 KiB leaves the variable unset, so an opted-in lint gets no paths and walks its full set.
The check runs under `sh`, so the declaration splits the variable on newlines alone and turns globbing off, to pass each path as one argument even when it holds a space or a `*`:

```sh
set -f; IFS=$(printf '\n_'); IFS=${IFS%_}; bin/fm-lint.sh $SKILLS_CHANGED_FILES
```

Records [0076](adr/0076-the-verdict-gate-hands-each-check-the-files-the-settle-changed.md) and [0077](adr/0077-the-verdict-gate-diffs-against-the-settle-baseline-commit.md) hold why.
The log carries `verify`, `passed`, `hold` and `release` lines for each, and [record 0048](adr/0048-a-session-that-changed-the-tree-settles-past-the-checks-its-push-gate-runs.md) holds the bounds and the reasons for them.

## Related topics

- [Trigger predicates](triggers.md)
- [The link map](links.md)
- [The harness Contracts](contracts.md)
- [Why this repository exists](why.md)
- [Glossary](glossary.md)
