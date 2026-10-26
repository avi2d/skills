# 91. A fix starts from a reproduction, kept as a test only when its expected result comes from outside the code

Date: 2026-10-09

## Status

Accepted.
Records the captain's answer of 2026-10-09 to the agent-written tests investigation, which took its recommended option.

## Context

`prove-it-works` named "an edit and its test" as the smallest unit that ends in a check, and ordered a delivery with "the failing test first and the fix on top".
So a fix began from a test the agent wrote for itself, with an expected result taken from its own reading of the task.

The investigation found that such a test helps only when its expected result comes from somewhere other than the agent's own reading: a bug report, a captain's example, a specification or an external contract.
In this fleet's own validation history every real bug came from live end-to-end scenarios, and the unit baseline caught none.

The Rule's reproduce-first section is measured by the `reproduce-first` case, which counts a reproduction as 0068 defines it: a command on the reported input whose output shows the defect.
Since 0068, that case passed 5 of 5 injected against 0 of 5 withheld on each of the four models swept.

## Decision

In `prove-it-works` the smallest checkable unit is "an edit and its check".
A delivery starts from a reproduction through the real entry point, with the fix on top.
That reproduction is kept as a regression test only when its expected result comes from outside the code: the bug report, a person's worked example, a specification or an external contract.
The Rule says a person where the investigation said the captain, since Rules reach every agent in every project and name a person rather than a role.
The reproduce-first section stays as it was.

## Consequences

Fewer fixed bugs leave a regression test behind, so a bug fixed once can return unseen where no end-to-end scenario covers it.
An agent no longer keeps a test whose expected result it took from its own reading of the code it fixed.
The `reproduce-first` and `verify-the-fix` cases and their judges are unchanged, because neither requires a test written before the fix, and neither judges whether a reproduction is kept.
