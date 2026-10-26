# 69. The kit's consumer suite proves each Effect scope rule fails

Date: 2026-09-25

## Status

Accepted. Narrows 0055 and 0059 on what `tests/e2e/effect-scope.test.ts`
proves.
Amended by 0074: the generated fragments are gone, so no `extends` entry is
required by `checks-quality --check`.

## Context

On 2026-09-24 the tools were chosen to consume `quality.json` the hybrid way:
read directly where they can, through generated fragments where they only read
JSON. Under that choice the proof that each scope rule and each diagnostic
fails a probe moves into the checks kit's consumer suite,
where it has landed. `tests/e2e/effect-scope.test.ts` still asserted the
full set in a scoped file, so every repository repeated a proof the kit now
makes once.

The kit's suite builds its own consumer `tsconfig.json`, and
`checks-quality --check` requires only the fragment in `extends`. Nothing the
kit runs sees whether this repository's `tsconfig.json` still extends
`@avi2dg/checks/tsconfig.effect.json`.

## Decision

`tests/e2e/effect-scope.test.ts` keeps what is specific to this repository:

- The scoped probe in a `src/` file no Dispatcher bundles is reported under at
  least one of the lint rules and at least one of the diagnostics the test
  asks for, so a renamed rule or severity cannot empty both sides of the
  check.
- None of those rules or diagnostics fires in a bundled Dispatcher file.
- The Bun global ban fails every `src/` file, bundled or not.
- A probe in `tests/`, typechecked against a copy of this repository's own
  `tsconfig.json`, fails at `error` on `anyUnknownInErrorContext`,
  `catchAllToMapError` and `unsafeEffectTypeAssertion`. Those three are off or
  only a message without the kit's severities, so the test fails when the
  `extends` drops the kit's tsconfig.

It no longer asserts that the scoped probe reports every rule and every
diagnostic.

## Consequences

A scope rule that stops firing, while another still fires, fails the kit's
suite and not this one.
