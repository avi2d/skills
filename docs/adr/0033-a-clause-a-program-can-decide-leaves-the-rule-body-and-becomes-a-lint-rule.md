# 33. A clause a program can decide leaves the Rule body and becomes a lint rule

Date: 2026-09-20

## Status

Accepted. Supersedes the part of 0027 that made
`rules/effect-error-channel/scripts/effect-escapes.ts` the program behind the
three escapes. Superseded by 0050 on the two assertion rules: in `src/` and
`harness/` they are `error`, held at the baseline in
`oxlint-suppressions.json`, and the clauses stay prose. 0056 pins that
baseline at no site of either, and 0058 holds both in every file.

## Context

`rules/typescript-best-practices/SKILL.md` and
`rules/effect-error-channel/SKILL.md` held 36 clauses between them, at roughly
1,687 tokens injected into every session whose repository trips their triggers.
A survey of the 36 against the published rules of three linters, the TypeScript
compiler's own flags and the Effect language service found 20 of them decided
or dissolved today: 14 by a published rule or a compiler flag, 4 by one custom
rule that had to be written, and 2 dissolved by owning a linter at all. The
other 16 stay: 5 keep only a surviving sentence, and 11 are judgment.

A clause in a Rule body is a sentence in a context window. It competes with
everything else there, it can be missed, and the only sign it failed is that
nobody noticed. The same clause as a lint rule runs identically whether or not
anyone read anything.

The one program this repository already had was the shipped script, which the
Rule had to spend twelve lines telling an agent how to run, and which missed
two shapes it claimed to catch: a data-first `Effect.catch(work, () => ...)`,
because its regex only matched the piped form, and any import that did not
spell the module `Effect`.

## Decision

`bun run lint` is `oxlint --type-aware` against `.oxlintrc.json`, and
`bun run typecheck` is `tsc --noEmit` followed by
`effect-tsgo diagnostics`. The suite workflow runs both.

oxlint over eslint and biome for three reasons. It is what Effect v4 lints
itself with, and `repos/effect/.oxlintrc.json` is in the source this collection
already tells agents to read. It reproduces typescript-eslint's type-aware
findings on this repository rule for rule, at 0.38s against 2.99s. And it is
the only one of the three whose plugin system can express the error-channel
rule: biome's GritQL cannot match a call's arguments at all.

`lint/effect-channel/no-error-channel-escape.ts` is that rule, 74 lines against
the 175 of the script it replaces, and it resolves the local name bound to the
Effect module from the `ImportDeclaration` rather than matching the text
`Effect.`, which is what closes both false-negative classes.

`@effect/tsgo` is not a second tool in the way that matters: it is the
typechecker this repository already ran, with the Effect language service's
diagnostics turned on in `tsconfig.json`. Eleven are asked for, and they are
what decides the Effect clauses no syntactic rule can see - an assertion that
narrows `E`, an `unknown` left in it, a `catchAll` that only re-fails.

Every clause a check now decides is deleted from its body, and each deletion is
named with its mechanism in the commit that makes it. What stays is judgment:
which states are invalid, which three values a parameter really takes, when a
failure is genuinely impossible.

Two clauses stay in prose although a published rule exists for them. `as`
(L27) and non-null `!` (L28) are written as permissions with a condition -
"when you hold proof the compiler can't see", "when the invariant is provable
from nearby code" - and the rules that would stand in for them ban both
outright. They report 214 of the 252 findings a full adoption raises, 140 of
them `parts[0]!` after a length check, which is the clause being obeyed rather
than broken. Turning them on is a policy change nobody has made; a `warn`
nobody fixes is neither of the honest options. Both rules are `"off"` by name
in the config, because the `suspicious` category would otherwise switch them
on.

## Alternatives

`isolatedDeclarations` was the flag the survey named for the exported-signature
clause, and it cannot be turned on here. It reports TS9021, "extends clause
can't contain an expression", on every `Schema.TaggedError` in
`src/failures.ts`, which is the whole failure model. 48 errors, 16 of them
that. `typescript/explicit-module-boundary-types` decides the clause instead,
matches its words more closely, and reported 4.

Replacing `tsc --noEmit` with `effect-tsgo diagnostics` was the shape the
survey sketched. Rejected on measurement: `effect-tsgo diagnostics` reports the
language service's findings and is silent on a plain TS2322, so substituting it
would drop every type error from CI. It is added to the command instead.

`consistent-return` comes on with the `suspicious` category and is off by name.
It fires on `return yield* fail(...)` in an Effect generator and on pi's
handlers, where returning nothing means "no change" - correct code in both
cases, and no clause of either Rule.

Leaving the script in place beside the linter was the cheap option. Rejected:
two programs answering the same question is one of them going stale, and the
one going stale is the one nothing runs.

## Follow-up

The check runs in this repository only; a repository the Rule fires in through
its Hub reads the one sentence naming the three escapes and gets no lint rule.
