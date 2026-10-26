---
name: right-size-the-work
description: "How much to build for the decision in front of you: prefer quality over saving development cost, and prefer the simplest direct path over machinery a one-off task does not need. Use whenever choosing between technical approaches or scoping operational work."
kind: rule
source: local
trigger:
  predicate: always
---

# Right-size the work

When choosing between technical approaches, do not give much weight to development cost. Prefer quality, simplicity, robustness, scalability, and long-term maintainability.

For one-off or infrequent operational work, start with the simplest direct end-to-end path. Do not build wrappers, control planes, policy layers, custom verifiers, or automation, unless the direct path exposes a concrete blocker or a repeated need justifies the added machinery.
