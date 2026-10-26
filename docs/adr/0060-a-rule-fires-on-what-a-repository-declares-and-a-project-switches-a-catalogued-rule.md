# 60. A Rule fires on what a repository declares, and a project switches a catalogued Rule

Date: 2026-09-24

## Status

Accepted. Records R1 from the quality-config decision of 2026-09-24 as it
reaches the Dispatcher. Amends the Selection in `CONTEXT.md`, which was the
whole account of what fires and is now the catalogue and its default. Amends 0027,
whose pin is no longer the Rule's only trigger. Amends
0038: the dispatch index is no longer filtered by the Selection, because it
also carries the Rules the Selection leaves off, marked `inactive`. Amends
0052: the dispatch report measures against the index without the inactive Rules,
and an inactive Rule that reached a session may be one a project switched on.
0066 deletes the Workflow start, so the prompt is the one place a Dispatcher
reads `quality.json`. Amended by 0070: skills no longer tracks `repos/effect.toml`,
so `effect-error-channel` fires there on `declares matched effect` alone.
Amended by 0071: an inactive Rule still refuses a write, and only a project's
`agentRules.off` stands that refusal down.
Amended by 0072: a Profile scopes only the Rules it names, by exact model.
Amended by 0073: a Profile lists every Rule its models receive, and a Rule no
Profile names is inactive.
Amended by 0074: a project declares Effect and switches a Rule in its
`package.json`, under `skills.rules`, and `quality.json` is gone.

## Context

`effect-error-channel` fired on one path, `repos/effect.toml`, the pin 0027
commits. A repository that pins Effect is working with it, but not every
repository working with Effect pins it. checks and career require Effect and
hold it through oxlint and tsc, and pin no library, so the Rule reached
neither. The pin answered a question nobody had asked it.

On 2026-09-24 the captain chose L1, M1 and R1 on the quality-config scout's
board. Each repository gets one `quality.json` at its root. The file holds only
declarations, and is validated by the schema `@avi2dg/checks` publishes
(0.11.0 and after). Agent Rules fire on what the file declares, with a switch
per project, and `selection.toml` stays the global catalogue and default. By
that day checks declared `sources.effect`, and career did the same during this
change.

## Decision

**A fifth predicate, `declares`, names a declaration by `key`.** `effect` is
`sources.effect`, and `features` is a non-empty `features`. The list is closed
in `src/quality-file.ts`. A key outside it fails generation, the same as an
unknown predicate. A Rule names what a repository declares, not where in the
file that sits, so the file's layout is written down once, in the reader. Adding
a declaration is one entry in that list and one line that reads it.

**It is asked at the prompt, beside `repo-contains`.** Each Dispatcher reads
`quality.json` at `git rev-parse --show-toplevel` of the directory the prompt
stands in, and reads it the same way where a Workflow starts. In Claude Code
and Codex a `/workflow:` prompt stands in for that turn's prompt, and pi runs
its workflow command at once, even mid-turn. Those are the only two places it
is read. It reads at the prompt for the reason 0001 gives: the prompt is the
one moment every Context reaches, and pi does not announce a sub-agent. It reads
at the root and not the working directory, because the file lives at the root
and a session often stands below it. It reads at every prompt rather than once a
session, so a session that writes or edits the file is heard at its next
prompt. That costs one git process and one file read, beside the several git
processes the verdict gate already runs there.

**The Dispatcher decodes only what it reads, by hand.** A bundle carries no
package (0028), so the kit's Effect `Schema` cannot come with it. The kit's
`checks-quality` already holds the whole file to that schema in each
repository's lint. The Dispatcher reads `sources.effect`, `features` and
`agentRules`, and passes over every other key. So a kit release that adds a key
does not turn the file unreadable in every session of every repository that
adopts it. A missing file declares nothing, and so does a directory in no
repository, and neither is a problem to report. A file the Dispatcher cannot
read also declares nothing and switches nothing. That covers a file that is not
JSON, a key it reads in a shape it cannot read, and a Rule switched both on and
off, where no order anybody wrote decides between the two. The core logs it
once a session, where the Dispatcher's other problems go:
`broken dispatcher: <path> <what is wrong>, so no Rule fires on what it declares
and none of its switches apply`. The session carries on.

**A switch overrides the Selection's default, and the trigger still decides
when.** `agentRules.off` switches a Rule off in that repository. No trigger
fires it, at the prompt or mid-turn, and its refusal does not stand either.
`agentRules.on` switches on a Rule the Selection leaves off, and the Rule then
fires on its own trigger. So the index carries every catalogued Rule, and marks
the ones the Selection leaves off `inactive`. An inactive Rule fires nowhere
that has not switched it on. Rules are ordered by name in the index, the order
the tree declares them in, so several Rules that fall due at once still arrive
in that order. A switch that changes something is logged as `switched <rule>
on|off: <path> switches it on|off`, once per session and per project. A switch
that names a Rule the index does not carry is logged as the Dispatcher's
problem. A Profile still cuts what a session opens with, whatever a project
switched on.

**The core keeps the project in its run state.** Claude Code and Codex run each
hook as a process of its own. The prompt hook reads the file, and so does a
Workflow's start, and a tool-call hook does not, so the switches travel to the
tool call in the state. The same
state decides whether a switch or a problem has already been said.

**`effect-error-channel` fires on `declares: effect` or on the pin.** skills
and dotfiles still mark Effect with `repos/effect.toml`, and adopt
`quality.json` only after this change. Keeping both triggers means no repository
loses the Rule in between.

## What was considered and rejected

- **A key that is a path into the file, such as `sources.effect`.** Every Rule
  would then repeat the kit's layout. A move in the schema would silently stop
  it firing, where a closed list fails the generator.
- **Checking the file against the kit's JSON Schema in the Dispatcher.** That
  needs a validator the bundle cannot carry. It would also report every file a
  newer kit wrote as unreadable.
- **`on` meaning "fire whatever the trigger says".** That turns a
  `file-matches` Rule into an `always` Rule in that repository, and charges
  every session there for the Rule's text. It would also break the parallel with
  the Selection's toggle, which only makes a Rule active. A repository that
  wants a Rule to fire where its trigger does not reach makes the declaration
  the trigger reads.
- **Reading the file once, at the session start.** A sub-agent in pi has no
  session start, so it would never ask.

## Consequences

Which Rules reach a session's first prompt, computed from the generated index
and each repository on this machine. The only difference is
`effect-error-channel`, and it is the same in pi, Claude Code and Codex:

| Repository | Before | After |
|---|---|---|
| checks | not reached | `declares matched effect` |
| career | not reached | `declares matched effect` |
| skills | `repo-contains matched repos/effect.toml` | unchanged |
| dotfiles | `repo-contains matched repos/effect.toml` | unchanged |

That adds 693 tokens to what a session in checks or career opens with, by the
four-characters-a-token count 0038 sets.

The index grows by the three Rules the Selection leaves off: `technical-writing`,
`unslop` and `writing-for-agents`. `tests/budget.test.ts` still measures the
Rules the Selection has on, through `indexFor` without the inactive Rules,
because that is what a session with no switches pays. A repository that switches a Rule on has chosen to pay for it.
`bun run dispatch-report` lists such a Rule among the inactive Rules that still
reached a session.

The pin trigger on `effect-error-channel` goes once skills and dotfiles declare
Effect. A Rule about feature owners can fire on `declares: features`.
