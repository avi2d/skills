# 99. Writing for people is switched on for Muse Spark alone

Date: 2026-10-12

## Status

Accepted.
Records the captain's call of 2026-10-12 that kept facts count as the Rule helping Muse.
Amends 0098: `selection.toml` switches `writing-for-people` on in the Muse Spark Profile and leaves it off elsewhere.

## Context

The board the captain picked promised the Rule switches on by default for each model the new test shows it helps.
Firstmate asked whether keeping the given facts counts as helping Muse.
The captain answered 2026-10-12: "rule for muse: yes, turn on only for muse".

The harder-cases measurement found, on Opus 5.5, identical arms at 20 pass and 4 fail with no dropped facts.
On Muse Spark the plain-prose checks cannot tell, 1 fail with the Rule against 2 without.
With the Rule Muse keeps the facts the task gave: a fact dropped in 1 run against 10 after re-judging, p 0.004, and by hand 0 real drops against 9, p 0.001.

## Decision

`selection.toml` names `writing-for-people` in `add` under the Muse Spark Profile's rules.
Every other Profile leaves it out, Opus 5.5 included.
Kept facts are the help the Rule gives Muse, and the plain-prose checks staying even is not held against it.
A project switch still names the Rule on where the session's Profile leaves it off.
The switch used to reach only Rules no Profile named, so the core now scopes a switched-on Rule in whatever the session's Profile says.

## Consequences

A Muse Spark session pays for the Rule's text at the first prompt, whether or not it goes on to write prose for people.
Sessions on every other model are unchanged, and a default-Profile session in a project that switches the Rule on keeps holding it from the prompt.
