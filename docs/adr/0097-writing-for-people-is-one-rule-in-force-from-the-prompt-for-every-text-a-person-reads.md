# 97. Writing for people is one Rule in force from the prompt, for every text a person reads

Date: 2026-10-11

## Status

Accepted.
Records the captain's answer of 2026-10-11 on how writing guidance reaches a session that writes prose for people, and the review ruling that followed it.
Amends 0061: `writing-for-people` fires at every prompt rather than on a write to a README or a page under `docs/`, and carries a short core of `technical-writing` and `unslop` rather than a pointer.
Amends 0087: `writing-for-people` restates a short core of principles `technical-writing` and `unslop` hold, as the one exception to stating each principle once, and its text, trigger and pointers change.
Amends 0063: the default cap follows the largest Rule's plan at 5 repeats, which is now 80 runs.
Amended by 0098: the Rule is measured on twelve cases, and the default cap is 120.

## Context

The writing References change what a session writes when they are in its context, and sessions rarely load them.
On the Windows machine 4 of 58 sessions that wrote prose for people had a writing Reference loaded first.
On the Mac 60 of 1,185 kept sessions loaded `technical-writing`.

`writing-for-people` fired only on a write to a README or a page under `docs/`, and so never reached a PR description, a commit message, site copy or UI messages.
A Rule a write or a tool call fires is in force from the next model call.
On pi the write or the command that fired it has already run by then, so the first commit message or PR body a session wrote never met it.
A second Rule fired by `git commit` and `gh pr` commands had that flaw, and copied the same core a second time.

## Decision

One Rule, `writing-for-people`, holds every text a person reads: a README, a page under `docs/`, site copy, UI messages, a PR description and a commit message, in any language.
Its trigger is `always`, so it is in force at the prompt, before the session writes anything it governs.
Its text is a short core of the two References, and it points at both for the rest.
It keeps `forbid: prose`.

It is measured on the eight Ledger writing cases, the README, PR description, site paragraph and messages in English and in Russian, injected against withheld.
The default `EVAL_MAX_RUNS` is 80, the plan of those eight cases in both arms at 5 repeats, so a bare sweep of it is not refused.
`selection.toml` places it from that measurement: in the default Profile when Muse and Opus both gain, in the Profile of the model that gains when one does, and left off when neither does.
The sweeps of 2026-10-11 at `c964b22` found no gain on either model, so `selection.toml` leaves it off and a project switches it on.
Muse passed 26 of 26 judged runs injected and 33 of 33 withheld, and Opus 16 of 16 injected and 15 of 15 withheld.
The fact readers that left the other runs unjudged were then widened to the paraphrases those runs used, and the same outputs judged again pass 39 of 39 against 40 of 40 on Muse and 16 of 16 against 16 of 16 on Opus.
The page cases alone had shown no gain on either model in the earlier sweep of two separate Rules.

## Consequences

A session where a Profile switches the Rule on pays for its text at the first prompt, whether or not it goes on to write prose for people.
An AGENTS.md, a CLAUDE.md or a SKILL.md stays with `agents-md-router` and `agent-docs`, and the Rule's text says so rather than a glob.
