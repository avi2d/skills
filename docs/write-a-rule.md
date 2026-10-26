---
kind: how-to
---
# Write a Rule

Write a Rule when an instruction has to reach every session whose work matches it, without the model choosing to load it.

## Create the Rule

To create a Rule:

1. Make a directory under `library/<domain>/rules/`, in the domain the Rule belongs to, named for the Rule in kebab case.
1. Write `SKILL.md` in that directory, opening with its frontmatter:

   ```yaml
   ---
   name: <name>
   description: "<what the Rule is for>"
   kind: rule
   source: local
   trigger:
     predicate: file-matches
     glob: "**/*.{ts,tsx}"
   ---
   ```

   [Frontmatter fields](frontmatter.md) lists every field, and [Trigger predicates](triggers.md) lists every trigger.
1. Write the instruction below the frontmatter.
   The Dispatcher injects the whole text, so every line of it reaches the model.
1. Add the Rule's name to the default Profile's `rules` list when most models should receive it, and name it in `drop` under each model Profile where it must not fire.
   When only a few models should receive it, leave it out of the default and name it in `add` under each of their Profiles instead.
   The other Profiles leave it out, because a `drop` of a Rule the default does not list fails `bun run generate`.
1. Run `bun run generate`.
1. Run `bun run test`.
   `tests/unit/budget.test.ts` holds a ceiling on what a session opens with, and one on every Rule a session can receive firing at once.

The Rule reaches matching sessions that start after `bun run generate` on a model whose Profile names it.

## Add a standing refusal

To have the Rule refuse a write as well:

1. Add `forbid` to its frontmatter, naming `comments` or `prose`.
1. Run `bun run generate`.

The refusal fires on every write, whether or not the trigger has fired, as [`forbid`](frontmatter.md#forbid) describes.

## Point the Rule at another Body

To have the Rule pull a Skill or a Reference by name:

1. Add the Body's name to `consults` in the Rule's frontmatter.
1. Write the name in the Rule's text in backticks, followed by the word for its Kind, such as the `effect-patterns` reference.
1. Run `bun run generate`.

## Troubleshooting

### `frontmatter field ... is not in the schema`

Generation stops on the first field it cannot use, and names the Body and the field.
Fix the field the message names, as [Frontmatter fields](frontmatter.md) describes, and run `bun run generate` again.

### The budget test fails

The Rule does not fit a ceiling, and the test reports the overage and the largest Bodies.
Shorten the Rule, or raise the ceiling in `tests/unit/budget.test.ts` in the same commit that switches the Rule on.

## Related topics

- [Frontmatter fields](frontmatter.md)
- [Trigger predicates](triggers.md)
- [Measure a Rule](measure-a-rule.md)
- [Get an edited Rule into the next session](../README.md#get-an-edited-rule-into-the-next-session)
