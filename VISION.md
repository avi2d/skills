# Vision

`skills` exists so that an instruction fires every time its work comes up, in every harness, from one copy.
It serves the person who runs agents on pi, Claude Code and Codex and keeps one set of instructions for all of them, and the agents that receive each Rule when its trigger matches instead of remembering to load it.
It owns exactly one thing: the Bodies under `library/` and the generator that builds them into a Hub and one Dispatcher per harness.

## Fired by trigger, never left to memory

A Rule ships only with a trigger that fires it when its work comes up, and no Rule is left for a model to remember to load.
A Body that nothing invokes is removed, which trades a shelf of possibly useful text for a library where everything present earns its delivery.

## One copy feeds every harness

One copy under `library/` feeds pi, Claude Code and Codex through a Dispatcher built per harness, and no harness keeps its own fork of an instruction.
What differs per harness lives in its Dispatcher, which trades one more bundle to build for never patching the same instruction twice.

## Decidable clauses leave the prose

A clause a program can decide leaves its Rule and becomes a lint rule or a check, which trades a reminder the model might ignore for enforcement that runs without it.
Each Rule is measured by ablation and a Rule that shows no gain is switched off, which trades coverage for proof that every Rule earns its place.

## Shipped bundles carry nothing to install

Source outside the tests, `evals/`, `harness/` and the Dispatcher bundles is Effect v4, and a Dispatcher bundle loads without `node_modules`, so it cannot import `effect`.
The Contracts in `harness/` stay hand-written because each harness rewrites its own settings, which trades generated uniformity for settings that survive the harness's own writes.

## Scope

skills is the instruction library, not shared CI plumbing: reusable workflows and composite actions belong to the avi2d/workflows repository that this repository's own CI calls.
It carries no Workflows and holds no path into another repository: its edge is `$HOME`, where it links its Hub, Dispatchers and Contracts.
`generated/` and `repos/` are written by commands and never committed.

A change aligns when it delivers an instruction closer to the moment its work comes up, removes a Body nothing invokes, turns a decidable clause into a check, measures a Rule, or keeps the bundle dependency-free.
A change should be resisted when it leaves a Rule for a model to remember, forks an instruction per harness, states in prose what a program could decide, commits `generated/` or `repos/`, carries a Workflow, or reaches past `$HOME` into another repository.
