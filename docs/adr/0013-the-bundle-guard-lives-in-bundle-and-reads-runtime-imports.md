# 13. The bundle guard lives in bundle() and reads runtime imports

Date: 2026-09-14

## Status

Accepted. #17 is the defect this closes. 0066 deletes `subagentura.ts`, so it
leaves `PI_BUNDLE`, and `harness.ts` leaves with it.

## Context

The Dispatcher ships as a flat directory a harness links whole, and a
symlinked file cannot reach a sibling - so the directory only loads if every
runtime relative import a bundled module makes lands inside it. That property
was guarded by `relativeImports`, a regex with zero production callers: it ran
only from the suite, so `bun run generate` would happily emit a directory that
cannot load. And it was wrong in both directions - it counted type-only
imports the compiler erases (`workflow.ts`, `scope-condition.ts` and
`fields.ts`, 455 lines of authoring schema, rode into the bundle unreferenced
at runtime), and its `[^;\n]*?` could not cross a newline, so one formatter
run on either of two 113-character import lines would have silently disarmed
it. Separately, the dispatch index's destination was declared twice:
`HubEmitter.index` spelled a path inside the directory that `Bundle.root` also
declared.

## Decision

The guard moves into `bundle()`, the module that produces the directory and
so is the one that can say whether it is loadable. It throws - at generation
and in the suite both - on a spec entry whose source file is missing, on a
specifier that climbs out of the directory, and on a runtime import nothing
in the bundle satisfies, naming the module, the specifier and the entry that
would fix it. The emitted bytes stay exactly the authored bytes.

The classifier, `runtimeImports()`, is a pure exported function: module
source in, the relative specifiers the module needs at runtime out, in source
order. It is parsed rather than matched, and its contract follows what
`verbatimModuleSyntax` erases: `import type` and clauses whose every binding
is `type` count as nothing; a mixed clause, a bare side-effect import, a
re-export and a dynamic `import()` all count; non-relative specifiers are
ignored.

**The parser is bun's transpiler, not acorn.** The issue proposed acorn as
the tool already in the suite, but acorn parses JavaScript and a bundled
module is TypeScript - `import { type A, b }` is a syntax error to it. The
suite's existing acorn use is on the emitted fan-out script, which is
JavaScript. `Bun.Transpiler.scanImports` is a real parser, already present in
the only runtime the generator runs on (`bundle.ts` already uses `Bun.file`,
and is itself not in the bundle), and its classification was checked against
every case in the contract - wrapped clauses, side-effect imports, all-type
clauses erased, mixed clauses kept, type-only re-exports erased - each of
which the suite now pins, so a bun upgrade that changed any of them goes red.

With type-only imports no longer counting, `workflow.ts`,
`scope-condition.ts` and `fields.ts` leave `PI_BUNDLE` with none of them
edited. `subagentura.ts` stays: the pi Adapter imports four of its names as
values. `harness.ts` also stays, per the issue's scope, though it too is
reached only type-only today; whether it leaves is its own small decision.

The index destination stops being declared twice: `HubEmitter` drops `index`
and carries the `Bundle` it belongs to, the filename constant `INDEX` lives
beside `ENTRY` in `bundle.ts`, and the destination is derived as
`bundle.root + "/" + INDEX`. To keep the dependency one-way, `HUBS` moved to
`generate.ts` - the composition root, which already held both `hub()` and
`PI_BUNDLE` - while `hub.ts` keeps `hub()`, `HUBBED`, `GENERATED_ROOT` and
the `HubEmitter` type, reaching `bundle.ts` type-only. The pi Adapter cannot
import `INDEX` (bundle.ts is not in the bundle), so its `./dispatch.json`
literal stays and the suite holds the two spellings to agreeing.

## What was considered and rejected

- **Fixing the regex.** A pattern that has to understand wrapped clauses,
  comments between tokens, and TypeScript's type modifiers is a parser
  written badly.
- **acorn on the TypeScript sources.** See above: it cannot parse them.
- **The `typescript` package's parser.** The checked-in typescript is 7.x
  native, whose JS API ships only under `unstable/` exports - not a seam to
  build a guard on.
- **Keeping the check in the suite only.** The defect was precisely that the
  one caller was the suite, so `bun run generate` could emit a directory that
  cannot load.

## Consequences

- `bun run generate` fails, naming the fix, when a bundled module reaches
  outside the directory. The suite proves the same through `bundle()`
  throwing rather than re-implementing the walk.
- The emitted directory shrinks by the three authoring modules, and the
  drift check keeps holding the checked-in tree to exactly what the
  generator writes.
- The suite loads the emitted directory with the three modules absent and
  observes a Rule fire, which is the closest in-repo evidence that the
  harness's own loader agrees; pi's jiti erases the same type-only imports.
- Adding a second harness is one more `HUBS` line naming its Hub root and
  its bundle together; its index cannot land anywhere its Dispatcher will
  not look.
