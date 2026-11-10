---
governs: [src/generate/crew-dispatch-config.ts, src/generate/crew-dispatch.ts, selection.toml, harness/firstmate/crew-dispatch.json, harness/firstmate/crew-dispatch.mac.json, tests/unit/crew-dispatch.test.ts, harness/pi/settings.json]
---
# 110. Fable 5.2 leads the ambiguous, investigation and unknown-cause dispatch rules

Date: 2026-11-10

## Status

Accepted. Amends 0109: the ambiguous, bounded investigation and unknown-cause rules list Fable 5.2 at high ahead of the Opus 5.5 pair.

## Context

The hard work, which needs design judgment, a diagnosis or a cause not yet known, has led with Opus 5.5 on both Claude accounts.
Fable 5.2 runs through the bridge v0.11.0+avi2d.1 on pi 1.5.1, and a main-account turn on it passed on both machines on 2026-11-10.

## Decision

In the ambiguous, bounded investigation and unknown-cause rules, the candidates are Fable 5.2 at high on the account main, then Fable 5.2 at high on the account second, then the existing Opus 5.5 at high pair.
Opus 5.5 stays as the fallback in each.
The trivial, small and large rules, the Mac's live configuration rule and both defaults keep their candidates.

## Consequences

Firstmate reaches Fable 5.2 for these three kinds of work whenever an account is usable, and reaches Opus 5.5 only when neither Fable account is usable.
Routine work never names Fable 5.2.
Fable 5.2 has no floor and runs only at high, as Opus 5.5 does here.
`selection.toml` gains a profile for the model, because `tests/unit/selection-models.test.ts` requires every model a generated config names to run from a profile.
`harness/pi/settings.json` gains the Fable 5.2 override, so its crew sessions compact at 150,000 and keep a 10,000-token tail.
