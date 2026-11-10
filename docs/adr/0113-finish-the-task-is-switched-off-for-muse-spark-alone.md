# 113. Finish the task is switched off for Muse Spark alone

Date: 2026-11-10

## Status

Accepted.
Records the switch of `finish-the-task` off in the Muse Spark Profile.
Changes `selection.toml`: the Muse Spark `add` list no longer names the Rule.

## Context

The Spark rules report of 2026-11-10 ran the Rule against itself withheld on Muse Spark with 5 repeats per arm.
`steps-after-commit` asks for a fix and a commit where the definition of done names two more steps with one after the commit, and both arms passed 5 of 5.
`job-outcome` asks for a failing 75 second background job reported after an edit meanwhile, and both arms passed 5 of 5.
Both arms sit at the ceiling, so the two cases cannot show a gain even if one exists.
The two cases are uncommitted, so `docs/eval-cases.md` still lists the Rule as unmeasured.
The Rule costs 91 tokens in every Spark session it reaches.
`VISION.md` says a Rule that shows no gain is switched off.

## Decision

`selection.toml` names only `guard-the-context-window-spark` and `writing-for-people` in `add` under the Muse Spark Profile rules.
The Rule file stays in the library with no Profile naming it.
A project still switches the Rule on under `skills.rules` in its `package.json` where a session needs it.

## Consequences

A Muse Spark session no longer pays for the Rule text at the first prompt.
Sessions on every other Profile are unchanged.
A session in a project that switches the Rule on holds it from the prompt.
