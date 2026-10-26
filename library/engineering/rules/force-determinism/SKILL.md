---
name: force-determinism
description: "Watch a new check go red on a violation, then green without it, before trusting it. Use when adding a test, a lint rule or any other check."
kind: rule
source: local
trigger:
  predicate: repo-contains
  glob: "**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs,py,rb,go,rs,java,kt,swift,scala,c,h,cc,cpp,hpp,cs,php,ex,exs,hs,ml,lua,sh,bash,zsh,nix,sql}"
---

# Force determinism

Before a new check counts for anything, watch it fail. Write the violation, run the check, see it go red, then remove the violation and see it go green. Both runs, in that order.

A check that cannot fail is worse than no check. It reports success forever and nothing ever contradicts it. A test that asserts colour contrast it cannot measure passes over text nobody can read. A guard that scans a tree passes when the tree it scans has become empty. The `prove-it-works` rule asks for the real artifact rather than a proxy; a check is an artifact, and green on its first run is a claim about the future rather than evidence.
