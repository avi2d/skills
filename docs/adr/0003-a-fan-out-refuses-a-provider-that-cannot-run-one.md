# 3. A fan-out refuses a provider that cannot run one

Date: 2026-08-28

## Status

Superseded by `0006-a-fan-out-asks-nothing-of-its-provider.md`, which measured
the branches running under `claude-bridge` and deleted the refusal. What follows
is left as it was written: the reasoning for refusing over routing is what a
reopening would start from.

## Context

`claude-bridge` is `defaultProvider` in `~/.pi/agent/settings.json`, so it is
what a fan-out started on this machine inherits. Every branch spawned as an
isolated sub-agent under it dies before its first command:

```
prompt-capture: no capture for this 17785-char system prompt, and it embeds
none of the 1 known. Claude Code would receive none of this turn's context
files, skills or custom instructions.
```

`pi-claude-bridge` replays a captured Claude Code system prompt: it resolves the
prompt pi assembled against the captures it recorded, and sends Claude Code that
capture's own parts. An isolated sub-agent is a fresh pi process assembling a
prompt nothing recorded, so nothing resolves and
`prompt-capture.ts:resolveOrDerive` throws. Throwing is right, and the bridge
says why in its own comment: a turn that quietly ignored the user's context
files and skills is worse than a turn that failed.

### The finding

Session `01a0471d-6f88-79a7-be26-d0facd35666c`, the review step of #23. Both
branches failed with the message above and posted nothing. They ran only after
being respawned by hand on `openai-codex/gpt-5.6-terra`.

The defect is not the abort. It is where the abort lands. The fan-out is the
second-to-last thing `implement` does, so the run had already cut a worktree,
implemented a ticket and opened a pull request; it then spawned two branches
that were certain to fail, and found out one branch at a time, after they were
spawned. Nothing before that moment had asked whether the branches could run at
all.

### The two answers

**Route.** Send the branches to a provider that accepts them. The run continues,
and a review of someone's code happens on a model they did not pick.

**Refuse.** Stop before spawning, naming the provider and what to change. The
run stops for something a one-line setting would have fixed, and nothing happens
behind the user's back.

## Decision

**A Workflow that fans out does not start under a provider that cannot run an
isolated sub-agent. It refuses at the start, in one message naming the
provider.**

Mechanically, four small pieces:

- A `Provider` is what a Context is running on: its name, and whether it can run
  an isolated sub-agent. It rides the three events a harness can attach it to -
  a session starting, a prompt, and a run being asked for - and the state keeps
  the last thing it was told, because the moment it matters is not a moment the
  harness is necessarily saying anything at. The pi adapter reads it off
  `ctx.model` and says nothing where pi reports no model.
- The core refuses in `onWorkflowStart`, before the run exists. A Workflow
  asking for `parallel` enforcement is exactly a Workflow that fans out -
  `parseWorkflow` holds both directions of that - so the tree needs no walking
  and no second account of what a fan-out is.
- It refuses again where the branches would actually be spawned. The start is
  not the only road to a fan-out: a run restored in a new process, or one whose
  model changed under it, arrives there without passing the first gate. Both
  refusals ask one function, so they cannot come to disagree.
- Each is an `abort`, like a Workflow no index holds and like a second run asked
  for over a live one. One dispatch log line, one banner, no run.

Which model a branch runs on is what makes reading `ctx.model` the right
question. The generated script calls `agent()` with no model, pi-subagentura
passes `defaultModel: ctx.model` from the session (`workflow-tool.ts`), and
`resolveModel` returns that default when no id is named (`helpers.ts`). So a
branch runs on the session's model, and `/model` really is the fix the refusal
tells the reader to reach for.

### Measured

Both halves, in a real pi process running the generated Dispatcher, with the
same probe extension sending `/workflow:implement` the way the Dispatcher sends
its own steps - as a command pi runs rather than text a model reads, because
print mode never expands one typed as a prompt (#25). No tools, no session, and
a working directory outside any repository.

On `claude-bridge`, with `pi-claude-bridge` loaded so the provider is the real
one and not a silent fallback to `anthropic`:

```
PROBE provider=claude-bridge model=claude-haiku-4-5
abort implement at the start: it fans out, and claude-bridge cannot run an
isolated sub-agent, so choose a provider that can and start it again
```

One line, and nothing before it: no step invoked, no script saved, no branch
spawned. On `openai-codex`, the same command through the same probe:

```
PROBE provider=openai-codex model=gpt-5.6-terra
invoke implement at 1/5: worktree
```

So the refusal is about the provider and not about the Workflow.

### Why refuse rather than route

Choosing which model reviews someone's code is not a decision to leave to
whichever provider an adapter could reach. Routing keeps the run moving by
substituting a model nobody picked, in the one step where "it ran" and "it ran
well" are different claims, and it would do so silently: the log would say the
branches came back, because they would have.

It is also the rule this design already has. A harness that cannot hold a
Workflow to its declared Enforcement does not receive that Workflow at all,
because a Workflow that quietly stopped enforcing looks exactly like one that is
working. A harness standing on a provider that cannot run branches is that same
sentence one level in: `src/harness.ts` answers for the harness at generation,
and this answers for the provider at the start of a run, because a provider is
picked at runtime and generation cannot see it.

### Why at the start rather than at the fan-out

The fan-out is where the failure happens and the start is where saying so is
free. A refusal at the fan-out would be accurate and useless: it would stop a
run that had already done the work, correctly, and leave it unreviewed and
unmerged with no way to resume. Refusing before the first step costs one line
and one `/model` away from being fixed.

### Why the harness reports and the core decides

Which of pi's providers can run an isolated sub-agent is a fact about pi's
runtime, in the same class as which of pi's tools put bytes on disk, and it
lives in the adapter as a list of one. What to do about it is a judgment, and
judgments are the core's, where the dispatch log already records every other
one.

The list holds the measured rather than the permitted. A provider nobody has
tried drives its branches and they report for themselves; only one measured to
fail stops a run before it starts. An allow-list would refuse every provider
that works and has not been written down yet, which is the same silent breakage
pointed the other way.

### Why the start is not the only gate

The first draft of this refused at the start and nowhere else, and the Spec
review of it found the hole: `onSessionStart` restores an interrupted run and
advances it, so a `parallel` run that came back in a process defaulting to
`claude-bridge` - which is what this machine defaults to - would have walked
into its fan-out unchecked and failed one branch at a time. A reload is not a
user changing their mind, and the resumability three paragraphs up the README
makes that path ordinary rather than theoretical.

Refusing the whole restored run at the session start would have been the wrong
shape: it would kill runs standing past their fan-out, which need nothing of the
provider at all. So the second gate is at the spawn itself, where the question
is exactly "are these branches about to run somewhere they cannot". That gate
also catches the mid-run `/model` switch, because the provider rides the prompt
and a step's turn always begins with one.

## Consequences

- `/workflow:implement` refuses to start on `claude-bridge`, which is the
  default provider on this machine. Running it means picking another provider
  first, with `/model` or in `~/.pi/agent/settings.json`. That is the cost of
  this decision, and it is deliberate: the alternative is a review that happened
  somewhere nobody chose.
- A fan-out that spawns has been told twice that its branches can run: once
  before the run started, and once in the moment before they exist. What happens
  to a branch that fails anyway is unchanged: it comes back null, and the
  Workflow's own `failure` says whether that stops the run.
- A run restored under a provider that cannot spawn stops at its fan-out rather
  than resuming into it. Its work is where it left it - the worktree, the branch,
  the pull request - and re-running it under a provider that can is the way
  forward, as it is for any other abort.
- Only Workflows asking for `parallel` are refused. A `driven` Workflow runs on
  `claude-bridge` as before, because nothing in it is spawned.
- #29 asks for an `implement` run whose review step fired with nobody driving
  it. It has to be run under a provider that isolates, and now the run says so
  itself rather than failing two branches to find out.
