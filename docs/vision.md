---
kind: explanation
---
# Vision

skills holds the instructions for coding agents, written once and delivered to pi, Claude Code and Codex.

## Purpose

skills exists so that an instruction fires every time its work comes up, in every harness, from one copy.

## Serves

The person who runs coding agents on pi, Claude Code or Codex and wants one set of instructions for all of them.
The agents in those harnesses, which get each Rule when its trigger matches rather than when they remember it.

## Owns

The Bodies under `library/`, and the generator that builds them into a Hub and one Dispatcher per harness.
Its edge is `$HOME`: it links its Hub, Dispatchers and Contracts there, and holds no path into the dotfiles repository.

## Non-goals

- It does not leave a Rule for the model to remember to load.
- It does not keep a Body that nothing invokes.
- It does not state as prose a constraint a program can decide.
- It does not carry Workflows.

## Direction

- Each clause a program can decide leaves its Rule and becomes a lint rule or a check.
- Each Rule is measured by ablation, and a Rule that shows no gain is switched off.

## Constraints

- Source outside the tests, `evals/`, `harness/` and the Dispatcher bundles is Effect v4.
- A Dispatcher bundle loads without `node_modules`, so it cannot import `effect`.
- The Contracts in `harness/` stay hand-written, because each harness rewrites its own settings.
- `generated/` and `repos/` are written by commands and never committed.
