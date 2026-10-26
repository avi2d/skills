---
name: typescript-best-practices
description: Best-practices reference for TypeScript design and correctness. Use whenever writing, editing, or reviewing TypeScript or TSX code.
kind: rule
source: https://github.com/cursor/plugins@fd6dd6f7276956a532bb78a748a8d2818b6eb5f4
trigger:
  predicate: repo-contains
  glob: "**/*.{ts,tsx,mts,cts}"
---

# TypeScript best practices

Rules for the parts of TypeScript no lint rule and no compiler flag decides for you. Apply while writing, not as a cleanup pass.

## Model the domain in types

- **Make invalid states unrepresentable.** A discriminated union beats a bag of optional fields. `{status: 'loading'} | {status: 'ready', data: T} | {status: 'error', error: E}` cannot express "ready with no data". `{loading: boolean, data?: T, error?: E}` can, so someone will.
- **Precise types at signatures.** Don't accept `string` where three values are valid, or a whole object where the function reads one field. The parameter type documents what the function actually needs.
- **One source for each fact.** Parallel collections, stored derived values, and a second declaration of a shape drift from the first. Review the data structures a change adds or edits before its logic.

## Inference and annotations

- Annotate a local only where the compiler would infer something wider than you mean.
- Use `satisfies` to check a value against a type without widening it: `const config = {...} satisfies Config` keeps literal types that `const config: Config` throws away.

## Boundaries

- Types are erased at runtime. Parse incoming data with a schema and derive the static type from it. A hand guard checks every field its type declares. Where Effect cannot load, a hand guard is the parse.

## Generics

- Constrain at the declaration (`T extends ...`) instead of asserting inside the body.
- If a signature takes three type parameters to say something simple, the design is wrong before the types are.
