---
name: build-and-review-motion
description: "Build an animation or a transition that earns its place, or review existing motion by exercising it live, with verified Before, After and Why findings, a Block or Approve verdict, and a self-contained fix plan on request. Use when a person asks to animate something, add or fix a transition, or review, audit or plan fixes for an interface's motion."
kind: skill
source: https://github.com/emilkowalski/skills@e8a175de22ae1e49370fc144c1f3bb9aeedf988d
consults:
  - motion
  - mobile-web
  - motion-vocabulary
---
# Build and review motion

Pull the `motion` reference first, because the gate, the ingredients and the feel checks live there.
When a person describes an effect without its name, pull the `motion-vocabulary` reference to name it.
A person asks either to build motion or to review motion that exists, and a review that ends in fixes builds them through the build steps.
The answer "this should not move" is a result, delivered with its reason.

## Recon

Before either branch, find the stack, the motion library if any, the existing easing and duration tokens, the product's personality, and the visitor's job on the surface.
Build a frequency map of the surfaces in scope: what a person hits a hundred times a day, what they meet occasionally, what they see once.

**Done when** each surface in scope has a frequency tier, and the tokens a change must extend are named.

## Build

1. Run each requested motion through the gate in the `motion` reference: its frequency tier, then its purpose in one word.
   A request that fails gets the answer without motion and the gate question that rejected it, and the branch ends there for that motion.
1. Choose the ingredients: the cheapest tool, the properties, the curve and duration or the spring, the interruption behaviour and the exit path.
   Extend the product's tokens rather than adding a parallel set.
1. Write the code with its `prefers-reduced-motion` path and its hover gating in the same change.
1. Exercise it live as the review below does, and fix what it shows.
1. Answer in a few lines: the tier and purpose, each ingredient on one line, and what still needs a feel check on a device or in slow playback.

**Done when** the motion runs in the browser through every path in the review's list, with reduced motion on and off.

## Review

1. Exercise each animation in the running interface rather than reading code alone: open it, close it, toggle it repeatedly, reverse it mid-flight, operate it by keyboard, dismiss it, and run it with reduced motion on.
   On touch surfaces, run the gesture on a physical phone before claiming anything about how it feels, as the `mobile-web` reference describes.
1. Check accessibility first and treat a failure as blocking: keyboard operation, focus that lands somewhere sensible and returns to the trigger on close, and a reduced-motion path that keeps feedback.
1. Play each animation at 10 % speed and step it frame by frame where the feel is uncertain, and look again on a later pass when doubt remains.
1. Record each finding as a row with Before, After and Why, citing the interaction, the `file:line` and the visible failure.
   Keep only findings confirmed in the rendered interface, and drop what is deliberate or exempt, such as a centred modal or a long duration on a marketing page.
1. Order the fixes by preference: delete the animation, reduce it, fix the easing, fix the origin, make it interruptible, use cheaper properties, make the timing asymmetric, then polish.
1. Close with a verdict.
   **Block** when accessibility fails, when motion delays a frequent action, when an entrance starts from `scale(0)` or uses `ease-in`, or when an animation stutters with an easy fix.
   **Approve** when none of those remain, durations and easing sit within the recipes or name their reason, interruption is handled where a person can retrigger, and reduced motion is honoured.
1. List the motion considered and rejected, each with the gate question that rejected it.

Where the project runs browser tests, turn behaviour a program can decide into assertions on the known components: focus returns to the trigger, Escape dismisses, actions stay reachable during and after the animation, and a reversed animation continues from where it was.
See each assertion fail on the broken behaviour before it passes on the fix.

**Done when** every animation in scope has been exercised through every path above, and each finding carries its rendered evidence.

## A fix plan for another session

When the person asks for a plan rather than a fix, write one plan per finding that a session with no context could carry out:

- **Problem:** what is wrong and why it matters to the feel, with the current code quoted at its `file:line` and the commit the plan was written at.
- **Target:** the exact end state, with every curve, duration, spring and media query spelled out.
- **Conventions:** where the project keeps its motion tokens, and one existing `file:line` that does it right.
- **Steps:** one concrete edit per step.
- **Boundaries:** what not to touch, and an instruction to stop and report when the code no longer matches the quote.
- **Verification:** the typecheck, lint and test commands with their expected result, the live paths to exercise, what to watch at 10 % speed, and the reduced-motion check.

## Sources

This Skill adapts and changes text from `skills/animate`, `skills/find-animation-opportunities`, `skills/review-animations`, `skills/improve-animations` and `skills/apple-design` in Emil Kowalski's skills at `https://github.com/emilkowalski/skills@e8a175de22ae1e49370fc144c1f3bb9aeedf988d`, under the MIT licence in `LICENSE`.
The text here is rewritten, shortened and merged, and is not the upstream wording.
