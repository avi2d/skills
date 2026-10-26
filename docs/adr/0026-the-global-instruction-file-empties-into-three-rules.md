# 26. The global instruction file empties into three Rules

Date: 2026-09-15

## Status

Accepted. #11, the last step of #1's rollout. Amended by 0064, which retires the empty file and its four links.

## Context

`global/AGENTS.md` held eight bullets and was the old mechanism: a static file
linked into Claude Code and Codex, and into pi as well, alongside pi's own
Dispatcher extension. #11 asked for an inventory before emptying it - not an
impression, an enumeration - and the inventory found only two of the eight
already carried by a Body:

- Never use an em dash: `unslop`'s Style section already forbids em dashes,
  though it forbids the hyphen-as-substitute this file asked for too. The
  practical outcome (no em dash in output) survives either way, so this bullet
  is dropped rather than forked into a second, conflicting rule. Which
  substitute wins is a style call for the next pass on `unslop`, not a reason
  to hold this migration open.
- Reproduce a bug end-to-end before fixing it: `prove-it-works`'s "Reproduce
  first, then fix the cause" section already says this - "reproduce it the way
  an end user meets it, through the same entry point, before changing
  anything" is the same instruction in the vocabulary this repo already uses.

The other six had no home anywhere in the tree:

1. Never add the agent's name as a commit's `Co-Authored-By` trailer.
2. Never hand-edit `CHANGELOG.md` or a file marked auto-generated.
3. Do not weigh development cost heavily against quality, simplicity,
   robustness, scalability, and long-term maintainability.
4. For one-off or infrequent operational work, take the simplest direct path;
   do not build machinery the work has not asked for yet.
5. Be picky about the UI during end-to-end testing, and fix what looks off
   even when it is not what you set out to change.
6. Hold lint failures, test failures, and flaky tests to that same standard:
   fix one you notice, even when you did not cause it.

`docs/harvest.md` names two of these already, from the other direction: the
vendored `principle-build-the-lever` was dropped because it "contradicts the
standing instruction to take the simplest direct path", and
`principle-experience-first` was dropped because "what changes behaviour in
it... is already a standing instruction, and #11 is where that file's content
lands." Both entries point at bullets 3 and 4 above and both defer their
landing to this ticket, which is the finding #11 asked this inventory to
surface.

## Decision

The six unhomed bullets become three new `local`-sourced Rules, grouped by
what predicate can reach them rather than by topic alone:

- **`git-hygiene`** (bullets 1 and 2). Both are mechanically detectable: a
  `tool-call` trigger on `bash` commands matching `**git commit**`, the same
  shape `technical-writing` already uses for its own commit-message trigger,
  and a `file-matches` trigger on `**/CHANGELOG.md`. The general "or a file
  marked auto-generated" clause stays prose inside the Rule body rather than a
  second glob: no glob names every repository's marker for a generated file,
  and this repository's own convention for it already lives in its own
  `AGENTS.md`, which `writing-for-agents`' `file-matches` trigger already
  reaches.
- **`right-size-the-work`** (bullets 3 and 4). Both are decision-making values
  about how much to build, not code shape, so they do not belong in
  `software-design` (which is `repo-contains`-scoped to source files and would
  miss operational work in a repository with none, or work outside a
  repository at all). No predicate expresses "when making a technical
  decision" mechanically, so this is `always`, the same trade
  `guard-the-context-window` already makes for an instruction about the
  session rather than the files in it.
- **`fix-what-you-see`** (bullets 5 and 6). One value split across two
  domains by the source bullets themselves ("apply that same high standard"),
  so kept as one Rule. `always`, for the same reason as above: "during
  end-to-end testing" and "a lint or test failure nearby" are not glob-able
  scopes.

All three are added to `selection.toml` and confirmed against the generated
index rather than against this record: `right-size-the-work` and
`fix-what-you-see` fire on the first prompt of a session on pi, Claude Code
and Codex; `git-hygiene` fires immediately on a `git commit` bash call and on
a `CHANGELOG.md` write, on all three.

`global/AGENTS.md` is emptied to a one-line pointer once these three Rules are
in the generated index for pi, Claude Code and Codex. It is emptied, not
deleted: the links from `~/.pi/agent/AGENTS.md` and the harness config that
reaches Claude Code and Codex live in `avi2d/dotfiles`, outside this
repository, and removing the file would dangle them.

opencode reached no Body through the old mechanism either, has no Dispatcher,
and loses the file's content as #11 said it would: the intended outcome of
this ticket, not a regression this ADR is repairing.

## What was considered and rejected

- **Folding bullets 3 and 4 into `software-design`.** Rejected: `software-design`
  is `repo-contains`-scoped to source files, and both bullets apply to
  operational work a code-scoped predicate would miss.
- **A `file-matches` glob covering every common auto-generated marker**
  (`**/generated/**`, `**/dist/**`, `**/*.generated.*`) for bullet 2's second
  clause. Rejected as guessy: every repository marks a generated file
  differently, and a glob that is wrong is worse than prose that says so and
  asks the reader to look.
- **Rewriting `unslop`'s em-dash clause to match this file's "use a plain
  hyphen instead" wording.** Rejected: `unslop` explicitly bans the
  hyphen-as-dash substitute as its own AI-writing tell, and overriding that
  from a Rule about a different topic is a design decision for `unslop` on its
  own terms, not a side effect of this migration.

## Consequences

- Three new `always`-or-near-always Rules cost a turn's worth of injected text
  on every session across all three harnesses, for good. That is the
  accepted trade every `always` Rule in this tree already makes.
- A commit made with `git commit` or a write to `CHANGELOG.md` now shows
  `git-hygiene` firing in the dispatch log on pi, Claude Code and Codex, where
  before nothing did.
- `global/AGENTS.md` no longer carries content a Dispatcher does not also
  carry. Anyone still reading it directly, on the assumption it is the
  source, is reading a pointer instead.
