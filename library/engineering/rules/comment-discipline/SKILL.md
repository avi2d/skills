---
name: comment-discipline
description: "The two comments that get written, the three a check refuses outright, and where the rationale goes instead. Use whenever writing or editing code."
kind: rule
source: local
trigger:
  predicate: repo-contains
  glob: "**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs,py,rb,go,rs,java,kt,swift,scala,c,h,cc,cpp,hpp,cs,php,ex,exs,hs,ml,lua,sh,bash,zsh,nix,sql,yaml,yml,toml,css}"
forbid: comments
---

# Comment discipline

Two kinds of comment get written, and the code carries everything else by itself. Apply while writing, not as a cleanup pass.

## Make the code say it

Try first to make the sentence unnecessary. Rename the variable, extract the function whose name is the sentence, move the invariant into a type the compiler holds. Every run re-checks the code and never the comment. What survives that attempt goes to the two below.

## The two that get written

- **Why it cannot be done the other way.** The obvious approach, and the thing that rules it out.
- **An invariant, precondition or postcondition the type system cannot hold.**

Anything else goes, and so does anything you are unsure of. A legal or licence header is a licence term and stays. A test's oracle source goes in its commit message and the wrong behavior it rejects goes in its name, so neither is a comment.

## Rewriting one that survives

Keep the fact and drop the rest. No history in it: not what the code used to do, not who changed it, not the ticket, not the record. The fewest words that carry the fact.

- `// A Set drops the duplicate the caller counts on.`
- `// The caller holds the lock across the whole of this.`

## Where the rationale lives

Rationale that needs a paragraph belongs in `docs/adr/` or the repo's decision log, and the code does not point at it. An address in a comment is a record reference and goes with the rest of the history, so the record is reached by searching the log rather than by following a line of code. That is the trade this rule makes on purpose: the argument costs a search, and the code costs as few comments as possible. Pointers absent from the code are the design working, not rot to repair.

The story of how the code got here goes in the commit message. Long rationale already in place moves to the record whole, and what stays behind is one of the two lines above, or nothing.

## Three a check decides instead

A machine-read suppression is not exempt from this rule. `@ts-expect-error`, `@ts-ignore`, `// prettier-ignore`, `eslint-disable` and `biome-ignore` are banned: fix what the tool is reporting, or stop running the tool on that file. A record or ticket pointer inside a comment is banned, and so is a doc block.

Those three need no judgment from you, so a program decides them. A write that adds one is refused before it lands, and the refusal names the comment and says what to do instead. Each repository also needs a check that refuses them again in what is committed. Text that reaches a file some other way, such as a shell redirect, meets only that check, and where it is missing you are the one holding the three.
