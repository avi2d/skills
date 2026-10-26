---
kind: reference
---
# Glossary

The vocabulary this repository is written in, looked up for what a term means here.
Glossary only: no implementation detail, no decisions.

## Harness

An agent runtime that loads and runs skills.
The harnesses in scope, in priority order: **pi**, **Claude Code** and **Codex**.
**opencode** receives nothing from this repository.

Harnesses differ in how a skill is triggered and what settings it must hold.
They agree on how a skill is written.

## Provider

Where a Harness gets the model it runs a Context on.
Picked at runtime and changed between one run and the next, so nothing about it is settled when a Harness's artifacts are generated.

## Skill

Not one artifact.
A skill is a **Body** plus zero or more **Adapters**.

### Body

The portable part: `SKILL.md` plus its `references/`, `scripts/`, `agents/`, `assets/`.
Conforms to the Agent Skills standard, so every harness in scope reads the same bytes.
Bodies carry the thinking and are the thing worth sharing.

### Adapter

The harness-specific part that makes a Body reachable and enforceable in one harness.
An adapter is a **Trigger** plus a **Contract**.
Two adapters for the same Body in two harnesses are the same feature expressed twice, the way herdr ships `herdr-agent-state.sh` for Claude Code and `herdr-agent-state.ts` for pi.

#### Trigger

How a Body gets into context.
Four modes, in ascending order of reliability:

- **model-invoked**: the harness lists the Body's description and the model decides.
  Best-effort by vendor design.
- **user-invoked**: the human types `/skill:name`.
  Reliable, manual.
- **event-invoked**: a hook or extension loads the Body when something happens, such as a tool call or a prompt submission.
- **always-on**: the Body's content is placed in the system prompt or a memory file every turn.
  Reliable, costs context on every turn.

#### Contract

The harness settings a Body needs before it can run: tool permissions, model or effort level, which bundled features are disabled.
Expressed once per harness in that harness's own format.

## Kinds

Every Body is exactly one Kind.
The Kind selects the Trigger, so it is the most important fact about a Body and is visible from the directory it lives in.

### Rule

An instruction to follow while doing a class of work.
Never invoked and never completed: it is either in force or it is not.
Triggered by a scope condition the dispatcher evaluates.
`typescript-best-practices` and `writing-for-people` are Rules.

A Rule may also **forbid**: name matchers for text no write may add.
That is a standing refusal rather than an instruction, so it is not injected and never wears out: every write that adds what the matchers refuse is refused before it lands, in words that say what to do instead.

### Skill

A single unit of work the user invokes by hand.
A call to action.

### Reference

Material consulted for inspection or vocabulary, not run.
Pulled on demand from inside a Rule or a Skill, never triggered on its own.
Each directory under `library/<domain>/references/` holds one, such as `effect-patterns` or `ui-principles`.

## Context

One conversation a Dispatcher is loaded into, with its own working directory and its own account of what is in force.
A harness's top-level session is one, and so is each in-process sub-agent it spawns.
A harness need not announce the second kind, and pi does not.

The unit a scope condition is asked for.
Two Contexts standing in the same place hold the same Rules, whichever of them the harness named.

## Dispatcher

The per-harness Adapter that evaluates scope conditions and injects Rules.
One implementation per harness, driven by Body frontmatter, loaded once per Context.
Everything it does is written to a dispatch log, because invisible enforcement and a silently broken predicate look identical from the outside.

## Verdict gate

The checks a repository declares for its push gate, run where a session settles.
Saying the work is finished is a claim, and the gate checks it.
A turn that changed the tree is **held** open while the checks fail, with what they printed in front of the model, and **released** once a bounded number of holds has not made them pass.
The failure stays on record.
A repository that declares no checks, or that no-mistakes was not set up for, has no gate, and neither does any linked worktree of one or any checkout that opts out of it.

## Harness-exclusive Body

A Body that targets one harness by nature, not by omission: one that configures Claude Code's hooks means nothing on a harness that has none.
This is a normal, expected case, not a portability failure: such a Body is absent from other harnesses rather than degraded in them.
The `harnesses` field is what declares one.

## Hub

One flat directory of the Bodies a harness reaches by name: the Skills and the References, and no others.
The domains and Kinds are how the library is organised and are not something a Hub shows.

An entry is a link to the Body, not a copy of it, so a Hub holds no bytes of its own and there is no second version to fall behind.
What a Hub decides is membership: which Bodies are offered by name at all.

A Hub is shared ground.
The root a harness reads is a directory any tool may install into, so a Hub is reconciled rather than rewritten: the entries this repository made are its to move or remove, and a Body some other tool put there is left alone.

One Hub, and every skills root points at it.
`~/.agents/skills` is the Agent Skills standard's user directory, which pi and Codex both read natively, and Claude Code reaches its own at `~/.claude/skills`.
All of them resolve to the same directory.
So a Body cannot be offered to one harness and hidden from another by name.
A Body one harness has no use for is visible to the rest, and `harnesses` filters what a Dispatcher injects rather than what a Hub holds.

A Rule is in no Hub.
It is never invoked, so offering it by name would let a model reach past the scope condition that decides whether it applies, and would spend a description on every session for a Body the Dispatcher already carries whole.
It reaches a harness through its Dispatcher instead.

## Selection

The Profiles in `selection.toml`, the default for which Bodies are active.
A Body no Profile names is off.
Only the default Profile lists Skills and References, and every other Profile shares them, because the Hub cannot filter by model.
The default Profile holds the full Rules list, and every other Profile names only additions in `add` and removals in `drop` against it.
Rules absent from every Profile remain in the Dispatcher catalogue for repository switches.
`default_models` names the models that run the default Profile on purpose, and no model can appear both there and in a Profile.
`tests/unit/selection-models.test.ts` fails on a model that a generated crew-dispatch or no-mistakes config names when neither a Profile nor `default_models` lists it.

A repository can override that default for itself, switching a catalogued Rule on or off in the `skills.rules` of its `package.json`.
A switch changes whether a Rule is active there, not when it fires: its trigger still decides that.
A switched-off Rule reaches no session there, and its refusal does not stand.
That switch is the only one that stands a refusal down, so a Rule the Selection leaves off still refuses.

## Profile

Additions to and removals from the default Profile's Rules for the exact model IDs it names, which shares the default Profile's Skills and References.
When a Profile lists tools, they are the exact tools the session keeps from those its harness gave it.
Without a tools list, the Profile leaves the harness's tools alone.
`profiles.default` has no model list and covers every other model, including an unreported model.
The Rules a Profile leaves out do not fire there, except one a repository switches on.
A switch to another model withdraws Rules its new Profile drops.
A Profile does not change write refusals.

Only pi can change its active tools in a running session.
An exact pi Profile with tools trims to that list, then restores the session's starting tools when the model moves to a Profile without tools.
The default Profile has no tools list.
Generation refuses a tools list on the default Profile or on a Profile naming a model outside the `ollama` provider.

## Pin

A library this repository reads, held at the version it installs.
The pin is a `checks-vendor` library in the `prepare` script of `package.json`, and it is committed.
The library itself is not: `checks-vendor`, which `bun install` runs through `prepare`, clones it once into a shared cache and links `repos/<name>` to it, and `repos/<name>` is git-ignored.

An entry is an npm package, its git remote and a tag template.
`checks-vendor` resolves the tag from the installed version, and bumping the dependency moves the pin with it.
It refuses a clone whose `package.json` holds another version.
It records the commit it cloned in a `<dir>.commit` file beside the clone in the shared cache, and a later run on that machine refuses a tag that has moved off that commit.
The lockfile names only the npm version, and the record is per machine, so two machines can hold different commits if the tag moved between their first fetches.

A scope condition sees only what is committed, since an ignored link is in no index.
A repository that keeps the older form of a pin, a committed `repos/<name>.toml`, is a repository working with that library.
So the file is one way a Rule about the library finds the repositories it belongs in, and it is there in a fresh clone before anything has been fetched.
A Declaration is the other.

## Declaration

Something a repository says about itself in its `package.json` that a Rule can fire on: that it depends on Effect.
The Dispatcher reads only that, leaving every other key to its own tool, so a Rule scoped by a declaration reaches exactly the repositories that say it.
It does not depend on a file that happens to be there.

## Provenance

Where a Body came from, recorded on the Body itself: an origin repository at the commit it was taken at, or `local` for one written here.
Recorded on the Body because it has to survive the tree the Body was carried out of, and those trees are gone.
