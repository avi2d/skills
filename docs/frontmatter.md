---
kind: reference
---
# Frontmatter fields

The frontmatter of a `SKILL.md` names its Body and says what the Body's Kind needs, and a reader looks a field up when writing a Body or when generation stops on one.

## Fields every Body takes

| Field | Holds |
| --- | --- |
| `name` | the Body's name, in kebab case, which is also the name of its directory |
| `description` | what the Body is for, which a harness shows the model |
| `kind` | `rule`, `skill` or `reference`, which is also the directory the Body sits under, pluralised |
| `source` | where the Body came from: `local`, or `https://<repository>@<commit>` with the full commit hash |
| `harnesses` | the harnesses that receive the Body, from `pi`, `claude-code` and `codex`, and every harness when left out |

Generation stops, naming the Body and the field, when the frontmatter lacks `name`, `description`, `kind` or `source`.
It also stops when `kind` or `name` disagrees with the directory, when two Bodies of one Kind share a name in different domains, and on a field this page does not list.
A Body names a harness only through `harnesses`.
The suite fails a Body that talks about a harness it did not declare, because that Body is wrong everywhere else.

## Fields by Kind

| Field | Kinds | Holds |
| --- | --- | --- |
| `trigger` | Rule | the predicates that fire the Rule, as [Trigger predicates](triggers.md) lists |
| `forbid` | Rule | the matchers a standing refusal forbids by |
| `consults` | Rule, Skill, Reference | the Bodies this one pulls by name |

A field on a Kind that does not take it stops generation.

## `forbid`

`forbid` names the matchers a Rule refuses a write by, and its value is `comments`, the checks kit's comment matchers, or `prose`, its prose matchers.

```yaml
forbid: comments
```

A write that adds what the matchers refuse is refused before it lands.
pi blocks the call, Claude Code and Codex deny it, and the reason is the matchers' own words, naming the file, the line and what to do instead.
The refusal fires every time rather than once a session, because a refusal records nothing, and it holds whether or not the Rule's trigger has fired yet.
It also holds when `selection.toml` leaves the Rule off, because a refusal spends no context, and only a project's `package.json` switching the Rule off stands it down.
A write is judged on the file as it would leave it and on the lines it adds or changes, the rule the kit's gate applies to a diff.
A comment on a line the write touches is judged whole, and a comment on a line it leaves alone is not.
An edit is placed where its harness would land it.
An edit that cannot be placed, which the harness cannot apply either, is let through and logged `unjudged`, and `bun run dispatch-report` does not count it as a lost Rule.
What reaches a file around the write tools, such as a shell redirect, is not seen.

`forbid: prose` names the kit's prose matchers, the ones its `checks-docs` gate runs on the lines a range adds to a doc.
`writing-for-people` carries it.
A write is refused for whatever that gate would fail on the lines the write adds, such as an em dash, an en dash, a hyphen used as a dash, a parenthesis or a semicolon.
The gate judges a living doc and an agent file, and lets a record under `docs/adr/`, a dated record and a changelog through, so the refusal does the same.
The matchers read a doc by its path from the root of the repository that holds it, so a doc no repository holds is let through, as docs/adr/0062 records.
When no repository holds a doc at the path a write names, the doc is judged at its real path, so a harness's agent file linked into a repository is judged as the file it links to.

## `consults`

`consults` names the Bodies a Body pulls for vocabulary or a baseline, so shared material has one home.

```yaml
consults: [effect-patterns]
```

Each name is resolved while building, so a name that leads nowhere stops the build, naming the Body and the field.
The Body has to write each name in backticks in its own text as well, because a declared link the prose never mentions is one no reader follows.
Backticks count and bare words do not, because a Body's name can be an ordinary English word.
Consulting a Rule stops generation, since a Rule is not reached by name, and so does consulting a Body that is switched off.
A Rule that `selection.toml` leaves off is held to this too, because a project can switch the Rule on.
Consulting a Body whose `harnesses` is narrower than the consulting Body's stops generation too, because the Hub is one directory for every harness.
A Reference is reached by name exactly as a Skill is, so no Body carries `disable-model-invocation`, which would hide the Body from that lookup.

## Pointers in prose

A pointer written as a sentence is a name in backticks or in bold followed by the word for its Kind, such as the `effect-patterns` reference or the **writing-for-people** Rule.
The suite holds each one to what `consults` is held to.
The name has to be a Body in the tree, every harness this Body reaches has to receive it, and the word has to match its Kind.

## Names

A Rule, a Skill and a Reference cannot share a name, although only the last two reach the Hub, because the three are what a human and a model name things by.

## Related topics

- [Write a Rule](write-a-rule.md)
- [Trigger predicates](triggers.md)
- [Glossary](glossary.md)
