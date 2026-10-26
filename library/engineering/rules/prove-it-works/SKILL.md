---
name: prove-it-works
description: "Verification discipline: check the real artifact before saying done, reproduce before fixing, and work in units that each end in a check. Use on any work that ends in a claim about what happened."
kind: rule
source: https://github.com/cursor/plugins@fd6dd6f7276956a532bb78a748a8d2818b6eb5f4
trigger:
  predicate: always
---

# Prove it works

Unverified work has unknown correctness. Before saying something is done, check the real thing.

## Check the artifact, not a proxy

"It compiles" is not evidence that it runs. A file's timestamp is not evidence of its contents. A summary of what a delegate did is not evidence of what it did: read the diff.

- Run the thing and exercise the actual path, input to output.
- Read the real value, not a cached or derived representation of it.
- When a check fails, suspect the way you are observing before you suspect the system.
- The strongest proof is a script that re-runs the same comparison, because it hands the reader something to run instead of something to believe. Keep its output visible.

## Reproduce first, then fix the cause

- If you cannot reproduce it, you cannot know you fixed it. Reproduce it the way an end user meets it, through the same entry point, before changing anything.
- Ask why until you reach the cause. A nil check that silences a crash is a symptom fix, and symptom fixes accumulate until nothing can be reasoned about.
- A workaround that needs a paragraph to justify it means the code is wrong. Fix the code.
- Fix the pattern, not just the instance: search for the same shape elsewhere.
- When stuck, instrument. Read the actual error rather than guessing at it.
- Code does not change between runs. State does. When something fails only after a restart, suspect stale config, caches, lock files and serialised state first.

## Name an independent oracle for every new test

- Take the expected result of every new test from somewhere other than the code under test.
- Name the source of that oracle, such as a specification, a worked example, a published constant, an external contract or an independently justified property, in the commit message that adds the test.
- Name one plausible wrong behavior the test rejects in the test's name, not in a comment above it.

## Work in units that each end in a check

- Pick the smallest unit that ends in something checkable: an edit and its check, or a commit that stands on its own.
- Verify before advancing. Never batch a sweep of similar edits and check once at the end: a break caught at the change that caused it is cheap to localise, and one caught after a batch is buried under everything built on top of it.
- Order the delivery so the sequence proves the work: the reproduction through the real entry point first and the fix on top, the subtraction before the reshape, the groundwork before the feature. A reviewer should see the problem and then the proof.
- Keep that reproduction as a regression test only when its expected result comes from outside the code: the bug report, a person's worked example, a specification or an external contract.
