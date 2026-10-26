---
name: effect-error-channel
description: "The error channel is what you are paying Effect for, and erasing it to satisfy the compiler is the one move that throws it away. Use whenever writing or editing Effect code."
kind: rule
source: local
consults:
  - effect-patterns
trigger:
  - predicate: declares
    key: effect
  - predicate: repo-contains
    glob: "repos/effect.toml"
---

# Effect's error channel

`E` in `Effect<A, E, R>` is the list of failures a caller has to answer for,
and the compiler makes them answer. Everything else Effect offers survives a
sloppy `E`. This does not: an error taken out of the channel is an error nobody
can be made to handle, and the signature now says the code is total when it is
not. Worse than the same bug in plain TypeScript, because the type is a
confident claim rather than a silence.

The move to watch for in yourself is small and it feels like progress. The
compiler objects that `E` is not `never` where something wants `never`, or that
a union has a member nothing handles, and the shortest edit makes the error go
away instead of dealing with it. Take the longer one.

## What to do with an error you do not want

- **Handle it by tag.** `Effect.catchTag`, `Effect.catchTags`,
  `Effect.catchReason`. Each leaves every error you did not name in the channel,
  which is the property worth protecting.
- **Widen the signature.** When the failure is real and this function cannot
  answer for it, the caller can. Add it to `E` and let the compiler ask the next
  one up.
- **Keep it as a value.** `Effect.result`, `Effect.exit`, `Effect.option`. `E`
  becomes `never` honestly, because the failure moved into `A` where a caller
  can still reach it.
- **Say it is impossible.** `Effect.orDie` turns a typed failure into a defect,
  which is a claim that it can never happen. It is right exactly when you can
  say why in one sentence. If you cannot, this is the move above wearing a
  better name.

None of that is paperwork about error types. Each one is a decision about what
the program does when the thing goes wrong, and something has to decide it.
What the channel forbids is erasing the error unseen: `Effect.ignore` and
`Effect.ignoreCause`, `Effect.catchCause` and its `catchCauseIf` and
`catchCauseFilter` variants, and an `Effect.catch` handler that cannot see the
error it swallows.

## Go and read the library

Where the `prepare` script of `package.json` names Effect, `checks-vendor` links its source at `repos/effect`. If it is
missing, run `bun install` or `bun run prepare`. The combinator you half
remember is in `repos/effect/packages/effect/src/Effect.ts` with its real
signature and a worked example.

Where the link is still missing, or the `prepare` script does not name Effect, read
the installed package instead: install the dependencies, and the same file is
`node_modules/effect/src/Effect.ts`.

Reach for the `effect-patterns` reference for the shapes this collection's
repositories use, and for that source for everything else. Do both
before writing from memory. Most of what has been written about Effect is about
v3, and v4 renamed a great deal of it.
