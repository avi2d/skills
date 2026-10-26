---
name: fix-what-you-see
description: "Hold visual and engineering signals to the same bar: a UI that looks off, a failing test, a flaky one. Fix what is in front of you even when it is not what you set out to change. Use during end-to-end testing and whenever a broken signal turns up nearby."
kind: rule
source: local
trigger:
  predicate: always
---

# Fix what you see

When end-to-end testing a product, be picky about the UI. If something looks off, even when it is not what you set out to change, get it fixed along the way.

Hold engineering signals to the same standard: a lint failure, a failing test, a flaky test. Fix it when you see it, even when you did not cause it.
