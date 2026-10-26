---
name: writing-for-agents
description: "How to write a document an agent consumes: context pointers, the information hierarchy, completion criteria, leading words, pruning. Pull before creating or editing a SKILL.md, an AGENTS.md or a CLAUDE.md."
kind: reference
source: https://github.com/mattpocock/skills@885e2ca4d842d139e9aef4e48d366c63cb1b8013
---
# Writing for agents

Each heading is one principle for a document an agent consumes: a `SKILL.md`, an `AGENTS.md`, a `CLAUDE.md` or a doc reached by a pointer.

## Sharpen a pointer's wording before inlining its target

A **context pointer** is a reference held in the agent's context that names some out-of-context material and encodes the condition for reaching it.
A `SKILL.md` description is one, and a line in `AGENTS.md` naming a doc is the same object.
The pointer's _wording_, not its target, decides when the agent reaches the material, and how reliably.
A must-have target behind a weakly worded pointer is a variance bug: sharpen the wording first, and inline the material only if sharpening fails.

## State what the material is, with one trigger per branch

A pointer states what the material is, and lists the **branches** that should trigger reaching it.
A branch is a distinct case the document handles, so different runs take different paths through it.
Synonyms that rename a single branch are one branch written twice, so collapse them and keep only genuinely distinct branches.
Every word of an always-loaded pointer costs on every turn, so it earns even harder pruning than the body.

## Front-load the leading word in a pointer

The pointer is where the leading word does its triggering work, so it comes first.

## Cut from a pointer the identity the body carries

What the body already says about itself stays out of the pointer.

## Spend context load and cognitive load on purpose

Every document and pointer you add spends one of two budgets.

- **Context load** is the cost of always-loaded material on the agent's window: an `AGENTS.md` line, a `SKILL.md` description, anything sitting in context every turn, spending tokens and attention whether or not it fires.
- **Cognitive load** is the cost on the human, who is the index of which documents exist and when to reach for each, and it is the price of human agency, so spend it where human judgement matters and remove it where it does not.

Material reached only through a pointer escapes context load at the price of the pointer's own line.
Material with no pointer at all rides entirely on cognitive load.

## Place each piece on the information hierarchy

A document is built from **steps**, the ordered actions the agent performs, and **reference**, the definitions, rules and facts consulted on demand.
The two mix freely: all steps in a recipe, all reference in a review's rules, or both.
The core decision is where each piece sits on the **information hierarchy**, a ladder ranked by how immediately the agent needs the material:

1. **In-file step** is the primary tier: what the agent does, in order.
1. **In-file reference** is consulted on demand, and a legitimately flat peer-set, such as every rule of a review on one rung, is a fine arrangement, not a smell.
1. **Disclosed reference** is pushed out into a sibling file or a fully external one, reached by a context pointer and loaded only when the pointer fires.

Push too little down and the top bloats.
Push too much and you hide material the agent actually needs.
That tension is the whole decision.

## Inline what every branch needs, and disclose what only some reach

**Progressive disclosure** is the move down the ladder, out of the main file and behind a pointer, so the top stays legible.
It is how the hierarchy is protected, more than a token optimisation.
When a document has steps, in-file reference that should be disclosed buries them and turns attending to them into a coin-flip, so disclosure is a variance lever as well as a legibility one.

## Co-locate a concept's definition, rules and caveats

Where the ladder decides _how far down_ a piece sits, **co-location** decides _what sits beside it_.
Keep a concept's definition, rules and caveats under one heading, so reading one part brings its neighbours with it.
The test is that the document reads like documentation written for the agent.
Scattering fragments one meaning across many places, which differs from duplication.

## Split a sprawling document by branch or by sequence

**Sprawl** is a document simply too long, even when every line is live and unique: attention thins across the excess, and every extra line is one more to keep relevant.
Splitting spends one of the two loads, so split only when the cut earns it.
Split by branch through progressive disclosure, and split a run of steps by sequence only under the conditions of the completion criterion below.

## End every step on a clear completion criterion

Every step ends on a **completion criterion**, the condition that tells the agent the work is done.
A vague bound such as "understanding reached" invites **premature completion**: ending the step before it is genuinely done, attention slipping to _being done_.
The visible steps still ahead, the **post-completion steps**, supply the pull, and the criterion's clarity is the resistance.
Sharpen the bound first, which is local and cheap.
Only if it is irreducibly fuzzy _and_ you observe the rush, hide the later steps by splitting the sequence, which drives more legwork on the step in front of them.
Hiding only works across a real context boundary, a hand-off or a subagent dispatch, since an inline call leaves the later steps in context.
Merging sequences does the reverse, exposing each step to the steps that follow it.

## Make the criterion checkable and exhaustive

**Demand** is how much a criterion requires.
"Every modified model accounted for" forces thorough work where "produce a change list" does not.
Demand drives **legwork**, the digging the agent does within the work, latent in the wording rather than written as its own step.
It is not step-bound: "every rule applied" binds a body of flat reference just as "every step done" binds a sequence.
The strongest criteria are both checkable and exhaustive.

## Anchor behaviour on a leading word

A **leading word** is a compact concept already living in the model's pretraining that the agent thinks with while running the document, such as _lesson_, _fog of war_ or _tracer bullets_.
Repeated as a token, never as a sentence, it accumulates a distributed definition and anchors a whole region of behaviour in the fewest tokens.
A made-up word recruits no priors, so you pay in definition tokens what a pretrained word gives free, and an existing word comes first.

It anchors twice.
In the body it anchors _execution_: the agent reaches for the same behaviour every time the word appears, and inside flat reference it focuses attention on a class of thing to look for.
In a pointer it anchors _invocation_: when the same word lives in your prompts, your docs and your codebase, the agent links that shared language to the material and reaches it more reliably.

Hunt for restatements a leading word retires, such as a triad spelled out at three sites, or a pointer spending a sentence to gesture at one idea:

- "fast, deterministic, low-overhead" becomes _tight_, a _tight_ loop.
- "a loop you believe in" becomes _red_, turning a fuzzy gate into a binary observable state: the loop goes _red_ on the bug, or it doesn't.

## Prompt the positive

Steering by prohibition drags the forbidden behaviour into context and makes it _more_ available.
The negation is a weak modifier the strongly activated concept overruns, so the ban half-reads as an instruction to do the thing.
State the target behaviour, such as "write one-line comments", so the banned one is never spoken.
A prohibition earns its place only as a hard guardrail you cannot phrase positively, and even then it sits beside the positive target.

## Keep each meaning in one place

Keep each meaning in a **single source of truth**, so changing the behaviour is a one-place edit.
**Duplication**, the same meaning in more than one place, costs maintenance and tokens, and inflates a meaning's prominence on the ladder past its real rank.

## Leave a cheap lookup to the environment

The **environment** is a source of truth too: `package.json` scripts, config files, the directory layout, `--help` output.
A document that restates it is a **cache**, which earns its load only when the lookup is expensive.
Cache what the agent cannot find by looking: the unwritten convention, the reason behind a choice, the gotcha no config confesses.

## Prune the lines that lost relevance

Check every line for **relevance**: does it still bear on what the document does?
A line loses relevance by never bearing on the task, as mere exposition or a branch that should be disclosed, or by going stale as the behaviour or world it describes changes.
Without a pruning discipline the default fate is **sediment**: stale layers that settle because adding feels safe and removing feels risky.

## Delete a no-op sentence whole

A **no-op** is an instruction the model already obeys by default, which pays load to say nothing.
The test, whether it changes behaviour against the default, is model-relative, so settle a disagreement by running the document rather than by debate.
When a sentence fails, delete the whole sentence rather than trim words from it.
A leading word too weak to beat the default, such as _be thorough_ when the agent is already thorough-ish, is a no-op too, and the fix is a stronger word such as _relentless_.
