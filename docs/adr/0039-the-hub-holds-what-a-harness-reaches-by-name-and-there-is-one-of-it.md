# 39. The Hub holds what a harness reaches by name, and there is one of it

Date: 2026-09-22

## Status

Accepted. Narrows 0029, which made a Hub links into the tree and is unchanged
in that. Retires the per-harness root 0022 worked around for Codex, by making
the leak it accepted the rule rather than the exception. 0066 deletes the
Workflow Kind, so no Workflow shares a name with a Skill and `src/hub.ts` drops
the exemption.

## Context

A Hub held Rules, Skills and References, one Hub per skills root, and both
halves of that had stopped paying.

**Rules were reaching a session twice.** A Dispatcher injects a Rule's prose
from the dispatch index when its trigger fires. The Hub then also offered the
same Body by name, so every harness listed all eight active Rules as loadable
skills at session start. `CONTEXT.md` defines a Rule as "never invoked and
never completed: it is either in force or it is not", and the tree was
contradicting its own vocabulary. The second copy is not free: the eight
descriptions come to 2,037 bytes, about 509 tokens charged to every session for
Bodies a program has already decided about.

It is also a way past the decision. A scope condition is what says whether a
Rule applies here; a model that can load `effect-error-channel` by name in a
repository with no Effect in it has reached around the one mechanism that was
meant to answer that.

**The two roots distinguished nothing.** `hubs/pi` and `hubs/claude-code` held
the same nine entries on the day this was written. Two of the fifty-two Bodies
declare a `harnesses` field at all - `git-guardrails-claude-code` and
`report-workflow-run` - and `selection.toml` has both switched off. So the
per-harness filter had no members, and 0022 had already conceded the shape of
the answer: `~/.agents/skills` is read natively by pi and by Codex, so "a Body
exclusive to pi or to Codex cannot be hidden from the other at that root".

## Decision

**The Hub is the Bodies a harness reaches by name**, which is `REACHABLE` -
Skills and References. `HUBBED` is gone rather than held equal to it by hand,
because the two lists agreeing was the decision rather than a coincidence.

**There is one Hub**, `hubs/`, and `~/.agents/skills` and `~/.claude/skills`
both point at it. `HUBS`, the `Hub` type and the per-Hub `tally` go with the
second root.

Two guards the per-harness Hub was providing quietly are now written down,
because losing them was the real risk in this change and neither is visible
from the diff that removes the filter:

- A Body may consult one a harness does not receive. The old Hub caught this by
  building pi's membership and failing on a name that was not in it. `consultable`
  now asks it directly: for every harness the consulting Body reaches, the
  consulted Body has to be received there too, and the failure names the
  harnesses.
- A Body may consult one the Selection switched off. That was caught because
  `hub()` ran over the active Bodies only. It still is, and the check now runs
  over every active Body rather than only the Hubbed ones - a Rule consulting a
  Reference is exactly the case the narrowed membership would otherwise have
  stopped covering, and `effect-error-channel` consults `effect-patterns`
  today.

Names stay unique across Rules, Skills and References, which is more than the
Hub now needs. A Workflow may still share its name with the Skill it wraps.

## What was considered and rejected

- **Keeping Rules in the Hub for the harness that has no Dispatcher.** There is
  no such harness: opencode receives `AGENTS.md` and loads no skills, and the
  other three all have one.
- **Keeping the two roots for the two Bodies that declare a harness.** Both are
  switched off, and 0022 had already accepted the same leak between pi and
  Codex. A filter that works for one pair and not the other is worse than none,
  because it reads as a guarantee.
- **Filtering per harness inside one root.** A Hub is a directory, and a
  directory shows the same entries to everything that opens it.
- **Deleting `harnesses` as a field.** It still decides what a Dispatcher
  injects, which is where it works: a Rule or a Workflow a harness does not
  receive is in no index for it.
- **Pointing `$HOME` at the tracked tree instead**, which would remove the Hub
  entirely. Refused on the firebreak: `no-mistakes` installs a real directory
  into both skills roots, and `hubs/` being ignored is the only reason that
  file is not in this repository's index.

## Consequences

- **A session lists one Body from here instead of nine.** `effect-patterns` is
  the only active Body a harness reaches by name today, every Skill being
  switched off. Pruning has not happened yet; this is what the Selection
  already said.
- **A Rule cannot be pulled by hand.** In a repository whose trigger does not
  fire, a Rule is unreachable. That is the point, and it is a real capability
  given up: reading one now means opening the file in this repository.
- **`harnesses` no longer hides a Skill from a harness.** It narrows what a
  Dispatcher injects and nothing else. A Body that means nothing elsewhere,
  like `git-guardrails-claude-code`, is listed everywhere and says so in its
  own description.
- **A machine that linked before this needs `bun run link` again**, because
  `~/.agents/skills` and `~/.claude/skills` pointed at `hubs/pi` and
  `hubs/claude-code`, which this change stops writing. The reconcile retires
  those two roots itself, so the tally ends at zero left rather than reading
  `2 left` on every run. A directory under `hubs/` is an old root when it holds
  a symlink into this repository, which is the one mark only an earlier build
  of this repository leaves; a directory holding none is somebody else's Body
  and is left alone, as 0029 requires.
- **What another tool put in an old root is moved into the Hub**, and the
  tally reports it as `moved`. This is an exception to 0029, which says a Body
  another tool installed is not this repository's to adopt, move or delete.
  The root it sits in is one this repository is removing, so the choice is
  between moving the Body and deleting the path out from under the tool that
  installed it; moving it is the lesser harm, and it keeps `no-mistakes`
  offered to both harnesses across the retirement. Two old roots that hold the
  same Body byte for byte contribute one move, and the duplicate goes with its
  root. A name the Hub already holds with different bytes is refused, naming
  both paths, because neither copy is this repository's to choose between.
