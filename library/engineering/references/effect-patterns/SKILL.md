---
name: effect-patterns
description: "The Effect v4 idioms this collection's repositories use: building and running an effect, the error channel, services and layers, and decoding at the boundary. Pull before writing Effect, and read the vendored source for anything this does not cover."
kind: reference
source: local
---
# Effect patterns

Effect v4 answers every question this file does not, and wins when the two
disagree. Where the `prepare` script of `package.json` names Effect, `checks-vendor` links its whole source at `repos/effect`, on
the tag the installed `effect` version resolves to. If it is missing, run
`bun install` or `bun run prepare`.

Where the link is still missing, or the `prepare` script does not name Effect,
install the dependencies and read the package at `node_modules/effect`, which
holds `src/`, `ai-docs/` and `LICENSE`. What only the link has needs the `prepare` script naming Effect and then `bun run prepare`, whose `checks-vendor` owns
`repos/effect` and fails on a directory it did not link there.

What follows is the short list of shapes a repository here needs on the way in.

## Read the source, not your memory of v3

Almost everything written about Effect is about v3, including most of what a
model has already read. v4 renamed a lot of it:

| v3 | v4 |
| --- | --- |
| `Effect.catchAll` | `Effect.catch` |
| `Effect.catchAllCause` | `Effect.catchCause` |
| `Effect.Service` | `Context.Service`, plus a hand-written `Layer.effect` |
| `effect/Either` | `effect/Result` |

`Data.TaggedError` survived the move, but the team's own examples define an
error with `Schema.TaggedError`, which is what to use for anything that crosses
a boundary.

An answer recalled rather than looked up is a v3 answer until the source says
otherwise. The five places to look, in the order worth trying:

- `repos/effect/LLMS.md` is Effect's own orientation for a model. Start there.
  Only the link has it.
- `repos/effect/ai-docs/src/`, or `node_modules/effect/ai-docs/src/`, is one
  runnable file per topic, written by the Effect team for exactly this purpose.
  Every example below is adapted from it.
- `repos/effect/packages/effect/src/Effect.ts`, or
  `node_modules/effect/src/Effect.ts`, and its siblings are the signatures, each
  with a worked example in its doc block. Grep for the combinator and read the
  type.
- `repos/effect/packages/effect/test/` is how the library exercises itself,
  which is the closest thing to a specification. Only the link has it.
- `repos/effect/migration/v3-to-v4.md` maps a v3 name onto its v4 replacement.
  Search it whenever an API you are sure of does not exist. Only the link has it.

## Building an effect

`Effect.gen` for inline code, `Effect.fn("name")` for a reusable function worth
a tracing span, `Effect.fnUntraced` for one that is not. A function whose whole
body is `return Effect.gen(...)` should have been `Effect.fn`.

```ts
import { Effect, Schema } from "effect"

export class SomeError extends Schema.TaggedError<SomeError>()("SomeError", {
  message: Schema.String
}) {}

export const validateBatchSize = Effect.fnUntraced(function*(size: number): Effect.fn.Return<number, SomeError> {
  if (!Number.isInteger(size) || size <= 0) {
    return yield* new SomeError({ message: "Batch size must be a positive integer" })
  }
  return size
})
```

`return yield*` rather than `yield*` when raising, so TypeScript knows the
generator stops there.

Getting a value that is not yet an effect into one, from
`ai-docs/src/01_effect/01_basics/10_creating-effects.ts`:

```ts
Effect.succeed({ env: "prod" })              // a value already in hand
Effect.sync(() => Date.now())                // synchronous, cannot throw
Effect.try({ try: () => JSON.parse(input), catch: (cause) => new InvalidPayload({ input, cause }) })
Effect.tryPromise({ try: () => fetch(url), catch: (cause) => new RequestFailed({ cause }) })
Effect.fromNullishOr(headers.get("x-workspace-id"))
Effect.callback<number>((resume) => { /* ... */ })
```

`try` and `tryPromise` take a `catch` that names the domain error. That is
where a thrown exception becomes a typed one, and it is the only place the
conversion should happen.

## The error channel

`E` in `Effect<A, E, R>` is the list of failures a caller has to answer for.
Define each one with `Schema.TaggedError` so it survives serialisation and
carries its data:

```ts
export class ParseError extends Schema.TaggedError<ParseError>()("ParseError", {
  input: Schema.String,
  message: Schema.String
}) {}
```

Handle by tag. `Effect.catchTag` takes one or a list, `Effect.catchTags` takes
a record, and both leave every error you did not name in the channel, which is
the point:

```ts
fetchUser("123").pipe(
  Effect.catchTags({
    ValidationError: (error) => Effect.succeed(`Validation failed: ${error.message}`),
    NetworkError: (error) => Effect.succeed(`Network request failed with status ${error.statusCode}`)
  })
)
```

An error with a tagged `reason` field is handled with `Effect.catchReason`,
`Effect.catchReasons`, or `Effect.unwrapReason` followed by the usual
`catchTags`. See `ai-docs/src/01_effect/04_errors/20_reason-errors.ts`.

When the failure is the answer rather than a problem, keep it as a value
instead of removing it: `Effect.result` gives `Result<A, E>`, `Effect.exit`
gives the whole `Exit` including defects and interruption, and `Effect.option`
gives `Option<A>` when the error carries nothing worth reading. All three leave
`never` in the error channel honestly, because the failure went somewhere a
caller can still reach.

What not to do is decided by the repository's static checks: the `@avi2dg/checks` lint plugin and the Effect overrides in `tsconfig.json` and `oxlint.config.ts`.

## Services and layers

A service is a class extending `Context.Service`, with the interface as the
second type parameter and a package-qualified string identifier. v4 generates
no default layer, so write one:

```ts
export class Database extends Context.Service<Database, {
  query(sql: string): Effect.Effect<Array<unknown>, DatabaseError>
}>()("myapp/db/Database") {
  static readonly layer = Layer.effect(
    Database,
    Effect.gen(function*() {
      const query = Effect.fn("Database.query")(function*(sql: string) {
        yield* Effect.log("Executing SQL query:", sql)
        return [{ id: 1, name: "Alice" }]
      })
      return Database.of({ query })
    })
  )
}
```

`yield* Database` inside a generator reads the service and puts `Database` in
the `R` channel. Nothing is provided until the edge.

Compose with `Layer.provide` to satisfy a layer's own dependencies and hide
them, and `Layer.provideMerge` to satisfy them and expose them as well. A value
with a sensible default is a `Context.Reference` rather than a service:

```ts
export const FeatureFlag = Context.Reference<boolean>("myapp/FeatureFlag", {
  defaultValue: () => false
})
```

`ai-docs/src/01_effect/03_services/` holds all three, plus `Layer.unwrap` for a
layer built from configuration.

## Decoding and encoding

All validation is `Schema`. Do not hand-write a predicate or a parser, and do
not reach for a type guard the `Predicate` module already has.

```ts
export class User extends Schema.Class<User>("myapp/domain/User")({
  id: Schema.Int,
  name: Schema.NonEmptyString,
  role: Schema.Literals(["admin", "member"])
}) {}

export type UserEncoded = typeof User["Encoded"]

const decodeUser = Schema.decodeUnknownEffect(User)

export const parseUserPayload = Effect.fn("parseUserPayload")((input: unknown) =>
  decodeUser(input).pipe(
    Effect.mapError((error) => new InvalidUserPayload({ message: error.message }))
  )
)
```

Build the decoder once, outside the function that uses it. `Effect.mapError`
turns the schema's own failure into the domain error the caller's signature
already promises, which keeps `SchemaError` out of interfaces that should not
know about Schema. `packages/effect/SCHEMA.md` in the vendored tree is the long
version; read it in chunks.

## Running

`Effect.runPromise`, `Effect.runSync` and `Effect.runFork` run an effect whose
`R` is `never`, so every layer is provided by then. A process entry point is
`NodeRuntime.runMain` or `BunRuntime.runMain`, which install signal handlers
and interrupt running fibers on shutdown. A long-running program with no result
is `Layer.launch`. Code called from a framework that knows nothing about Effect
gets one `ManagedRuntime` built from the application layer, not a `runPromise`
per handler.

## Testing

`@effect/vitest` gives `it.effect` for a test that is an effect, `it.live` for
one that needs the real runtime, and `TestClock.adjust` to move virtual time
rather than sleep. `ai-docs/src/09_testing/` has both files.

---

Examples adapted from the Effect repository.
