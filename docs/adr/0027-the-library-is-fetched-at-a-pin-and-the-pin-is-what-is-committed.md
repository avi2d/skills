# 27. The library is fetched at a pin, and the pin is what is committed

Date: 2026-09-15

## Status

Superseded on the three escapes by 0033, which deletes
`scripts/effect-escapes.ts` and `tests/effect-escapes.test.ts` and moves the
check to the oxlint rule in `lint/effect-channel/`. Superseded by 0049 on how
the tree reaches a checkout: `bun install` fetches it, and each Body keeps
only a one-sentence fallback for a checkout that install did not reach. What
this record says about the pin, `src/vendor.ts`, `references/effect-patterns`,
the rest of the Rule's prose and `tests/vendor.test.ts` still holds. Amended by 0060 on the trigger: the Rule
also fires where a repository's `quality.json` declares Effect. Superseded by
0070 on how `repos/effect` is fetched: `checks-vendor` replaces `src/vendor.ts`
and `repos/effect.toml`. Applies 0024, and follows 0021 for the
shape.

## Context

The captain wants Effect used as widely as his repositories allow, starting
with this one and his dotfiles, on v4, with the instructions living here so
they reach every Effect repository the way `force-determinism` does.

No application code is migrated in this change, and the order is the reason.
Agents write bad Effect from documentation. Whatever an agent is going to learn
the idioms from has to exist before it is asked to write a line, or the first
wave of code becomes the thing the next wave imitates.

Two pieces of research set the shape.

The Effect team's own advice is to hand the agent the library's source, in the
project, because agents read code well and documentation badly. `node_modules`
does not serve: it is compiled, and agents are steered away from ignored
directories. Their command is `git subtree add --prefix=repos/effect <url>
<branch> --squash`.

`mikearnaldi/accountability`, a codebase built for agentic Effect work, runs 15
custom `local/*` ESLint rules. Four of them - `no-effect-ignore`,
`no-effect-catchallcause`, `no-effect-asvoid` and `no-silent-error-swallow` -
guard one move: an agent making a typed error disappear to satisfy the
compiler. That is the failure mode of Effect plus agents, and without a guard
Effect produces worse code carrying more confidence. Its agent guide is 267
lines of orientation against 22 error-level lint rules, which is the ratio this
change copies.

The first version of this change followed the Effect team's command exactly.
The captain read the diff and declined it: "i don't like it to be in git? let's
have it git ignored". Merging it as written would have put 903,982 insertions
across 3996 files into this repository's history, permanently, for a tree
nothing here builds, imports or ships.

## Decision

**Effect's source is fetched, not committed.** `repos/*/` is in `.gitignore`.
`repos/effect.toml` is tracked and holds the pin: the repository, the tag, and
the commit that tag meant when it was chosen.

```toml
url = "https://github.com/Effect-TS/effect.git"
ref = "effect@4.0.0-rc.115"
commit = "4a05d4914fa2327a42bd75fe77c22c188becf3b4"
```

Which ref is v4 was read off the upstream repository rather than assumed:
`main` carries `packages/effect/package.json` at version `4.0.0-rc.115`, `v3`
is the 3.x maintenance line at 3.22.2, and `next-major` is stale at 3.11.9. A
tag was pinned rather than the branch, because a branch is not a pin, and the
whole value of a pin is that two agents on two days read the same library.

**`bun run vendor` is the one command.** It reads every `repos/*.toml`, clones
each at its `ref` with `--depth 1`, and then checks what landed against
`commit`. A tag that has been moved fails the fetch by name rather than handing
an agent a library nobody chose. A second run on a tree already at the pin does
nothing and says so; a tree at anything else, including the half-written one an
interrupted run leaves, is removed and re-fetched rather than adopted. Six
seconds, 60 MB on disk, none of it in git.

This is 0021's shape, applied again. `generated/` is load-bearing, in no clone,
and produced on demand; the lesson recorded there is that untracking something
four links pointed into broke a clone until `link` was made to generate first.
Nothing links into `repos/`, so there is no equivalent to wire, but the two
places that describe what a clone carries both had to learn about it.

**The Rule's trigger is the pin, not the tree.** `repo-contains` is evaluated
against `git ls-files`, and a git-ignored directory is in no index, so a glob
over `repos/effect/**` would have been a Rule that could never fire. The
trigger is `repos/effect.toml`, which is tracked, which is present in a fresh
clone before anything has been fetched, and which is the repository's actual
declaration that it works with Effect. `tests/dispatch.test.ts` pins all three
halves of that: it fires on the pin, it does not fire on TypeScript alone, and
it does not fire on the fetched tree.

**`references/effect-patterns` is the pattern file**, a Reference rather than
prose in the Rule, because it is consulted while writing and not in force. Its
examples are adapted from `repos/effect/ai-docs/`, which the Effect team wrote
for exactly this purpose, and every section names the path in the fetched tree
that holds the long version. It opens with the v3-to-v4 renames, because a
model's recall of Effect is a recall of v3.

**`rules/effect-error-channel` is the Rule.** Its subject is the failure mode
above and nothing else. What it carries as prose is the judgment: the five
things to do with an error you do not want, including `Effect.orDie`, which is
a claim that a failure is impossible and is right exactly when the writer can
say why. Both Bodies open by saying the tree may not be on disk and how to get
it, because every path they name is inside it.

**The three escapes are a check, not a sentence.** 0024 asks for the program
where a program can decide, and each of these is a shape in the source:

- `Effect.ignore` and `Effect.ignoreCause`, which drop the failure and the
  success together.
- `Effect.catchCause` and its `If` and `Filter` variants, which take defects
  and interruption along with the typed error.
- `Effect.catch` with a handler that cannot see its argument - `() =>`,
  `(_) =>` - which collapses every error in the channel into one fallback.

`scripts/effect-escapes.ts` inside the Rule Body is that program. It ships
there, the way `show-me-your-work` ships `scripts/log.sh`, because a check that
only ran here would reach none of the repositories the Rule reaches. It uses
two node builtins and nothing else, so bun or node runs it. It reads `git
ls-files`, skips `repos/`, and prints the file, the line, the token and what to
reach for instead. On a clean tree it still prints how many files it read, so a
run over nothing is visible rather than silent.

## Which guards changed meaning when the tree left git

The first version excluded the committed tree from two checks. Untracking it
made one of those exclusions decide nothing, and made two other things start
mattering. Each is stated here because an exclusion that quietly stops
excluding is the failure 0024 was drawn from.

- **The comment checks.** They read `git ls-files`, so the fetched tree is out
  by construction and the `authoredFiles` filter written for the committed
  version is deleted rather than kept. A filter that can only ever remove
  nothing is worse than no filter, because the test beside it reports a
  protection nobody has.
- **The stand-in clone in `tests/link.test.ts`.** This one walks the
  filesystem, not the index, so it was the exclusion that started mattering.
  It copies the working tree to stand in for a fresh clone, and a fresh clone
  has `repos/effect.toml` and no `repos/effect`. The filter now mirrors
  `.gitignore` exactly, and a unit test over the predicate pins both sides of
  it: a buried `.toml` inside the fetched tree is out, and the pin beside it is
  in.
- **`repos/` being ignored at all.** Nothing held that before, and a
  `git add -f` would have put the 41 MB back with nothing objecting. A test now
  asks `git check-ignore` whether a path inside the tree would be ignored, and
  asserts no tracked path sits below `repos/` while the pin itself is tracked.
  It decides something whether or not the tree has been fetched, which is what
  makes it worth having on a runner that never fetches.
- **`scannable` in the shipped script.** Still skips `repos/`, and still needs
  to: the Effect team's own advice is to commit the tree, so a repository that
  took their advice rather than ours has 1800 tracked library files that
  implement the very combinators this check refuses. Its test builds a scratch
  repository with the tree tracked, which is the arrangement where the filter
  fires.

Each of the three refusals was watched failing on a real violation appended to
`src/dispatch.ts`, then watched going green with it removed. So was every guard
above, and the four from the first version that survive: the two spellings of
the vendored root diverging, the Rule's glob widened to `**/*.ts`, the Rule
switched off in `selection.toml`, and the Rule's glob put back on the ignored
tree.

## What was considered and rejected

- **Committing the subtree, which is what the Effect team advise.** 903,982
  insertions across 3996 files, in history forever, for a tree nothing here
  builds. The captain declined it, and the reasoning generalises: a repository
  should carry what it is, and fetch what it reads.
- **Layering a deletion commit on top of the subtree.** The weight lands in
  history either way, which is the entire point of the change. The subtree
  commits are gone from the branch instead. Their objects are unreachable in
  the shared object store until a `gc`, and are in nothing this branch pushes.
- **Keeping the tag out of the Bodies and naming only the pin file.** The
  Reference is more useful for saying which release it was written against. Two
  hand-written copies of a string is 0024's generator case, and the answer here
  is the cheaper rung: a test reads the release out of every Body that names
  one and holds it to `repos/effect.toml`.
- **A second trigger condition for a repository that did commit its tree.** One
  convention, not two. A repository that commits the tree should still commit
  the pin, because the pin is what makes what an agent reads reproducible, and
  with the pin there the one trigger already fires.
- **Vendoring a subdirectory of the monorepo.** `packages/effect` alone would
  drop `ai-docs/`, `LLMS.md` and `migration/v3-to-v4.md`, which are three of
  the five things worth reading. Now that none of it is committed, its size is
  a download rather than a liability.
- **Porting `no-effect-asvoid`.** In v4 `Effect.asVoid` is
  `Effect<A, E, R> => Effect<void, E, R>`: the error channel survives it
  untouched. Discarding a success value is a question for `software-design`,
  not for this Rule, and a check that fired on it would be enforcing a v3
  signature.
- **Refusing `Effect.orDie`.** It appears 151 times in Effect's own `src` and
  14 times in the teaching examples the Effect team wrote. A check that fights
  the library's own idiom is a check somebody turns off, and with it the three
  that were right. Whether a failure is genuinely impossible is a judgment,
  which is the case 0024 says belongs in prose.
- **Matching the escapes against raw file text.** A token inside a string, a
  comment or a regex literal is not a call. The script blanks all four in place
  before matching, which keeps a match index pointing at the original line. The
  concept is the one `tests/lib/comments.ts` already implements, and the
  duplication is deliberate: a shipped script cannot import out of the tree it
  ships in.
- **Scanning this repository for escapes as the whole of the proof.** There is
  no Effect here to scan yet, so that check would have been green forever
  without ever having been able to fail, which is the second of the three
  failures 0024 was drawn from. The planted fixtures are what prove the script
  bites; the repository scan is wired up alongside them and starts meaning
  something the day Effect code lands.

## Consequences

- **A fresh clone has `repos/effect.toml` and no library.** `bun test` is green
  without fetching, and the one check that reads the tree skips and says so.
  `bun run vendor` is six seconds away, and both Bodies say to run it.
- **The Rule fires in a fresh clone**, before anything is fetched, because the
  pin is tracked. That is deliberate: the Rule is what tells an agent the tree
  is missing and how to get it.
- **The pin will go stale.** It is a release candidate. v4's final release
  wants an edited `repos/effect.toml`, a `bun run vendor`, and a re-read of the
  pattern file against whatever changed. The suite catches the half of that
  which is mechanical: a Body naming a release the pin does not.
- **Nothing runs `effect-escapes.ts` in another repository yet.** The Rule
  tells the reader to wire it in, which is an instruction and therefore exactly
  the kind of thing 0024 distrusts. It stays an instruction until a repository
  has Effect in it to check.
