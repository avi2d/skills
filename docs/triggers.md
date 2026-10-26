---
kind: reference
---
# Trigger predicates

A Rule's `trigger` names the predicates that fire it, and a reader looks one up when writing a trigger or when a Rule fires at the wrong time.

## The field

`trigger` holds one predicate, or a list of predicates of which any one matching fires the Rule.
The field is required, because a Rule without one could never fire and would look installed while doing nothing.

```yaml
trigger:
  - predicate: file-matches
    glob: "**/README.md"
  - predicate: file-matches
    glob: "**/docs/**/!(SKILL|AGENTS|CLAUDE).md"
```

## `always`

`always` matches every prompt.

```yaml
trigger:
  predicate: always
```

## `repo-contains`

`repo-contains` matches when the repository the turn is standing in holds a file that `glob` matches.

```yaml
trigger:
  predicate: repo-contains
  glob: "**/*.{ts,tsx}"
```

The Dispatcher asks `git ls-files` what the repository holds, once per directory a session stands in rather than once per turn.
Wherever `git ls-files` fails, a bounded filesystem walk answers instead.
The walk goes four levels deep and twenty thousand entries, skips `.git`, `node_modules` and `Library`, and stops once every glob it was asked about has matched.
A walk that finishes is taken again at the next prompt, so a file the session writes there is seen.
A walk that hits its cap before every glob matched is kept for the rest of the session, and the dispatch log says so once.

## `declares`

`declares` matches when the `package.json` at the git root of the prompt's directory declares `key`.

```yaml
trigger:
  predicate: declares
  key: effect
```

| Key | Declared by |
| --- | --- |
| `effect` | an `effect` entry in any dependency section |

`package.json` is the repository's own manifest, and the Dispatcher reads only what a Rule can fire on, leaving every other key to its own tool.
The Dispatcher reads the file again at every prompt, so a session that writes the file is heard at its next prompt.
A repository without the file declares nothing.
A file the Dispatcher cannot read declares nothing either, and the dispatch log says so once a session.

## `file-matches`

`file-matches` matches when a write is aimed at a path that `glob` matches.

```yaml
trigger:
  predicate: file-matches
  glob: "**/*.{ts,tsx}"
```

In Codex an edit arrives as one `apply_patch` carrying a whole patch, so the Dispatcher asks about every path in the patch.

## `tool-call`

`tool-call` matches a call to `tool` whose `argument` matches `matches`.

```yaml
trigger:
  predicate: tool-call
  tool: write
  argument: path
  matches: "**/CHANGELOG.md"
```

The tool name is compared without regard to case, so `bash` also matches Claude Code's `Bash`.
A call that lacks the named argument, or passes it as something other than a string, is logged as `broken` for that Rule rather than looking like a Rule that is not applying.

## Glob syntax

`glob` and `matches` share one syntax.

| Pattern | Matches |
| --- | --- |
| `*` | any run of characters within one path segment |
| `**` | any run of characters, `/` included |
| `?` | one character |
| `{a,b}` | `a` or `b` |
| `!(a\|b)` | within one segment, anything but `a` or `b` |

An argument that is not a path is still matched this way, so a bash command wants `**git push**` rather than `*git push*`.

## Arrival

The whole Body text is injected once per session, and again after a compaction.
Several Rules matching one event all inject, in the order the tree declares them.
The Dispatcher asks `always`, `repo-contains` and `declares` at each prompt, against the repository that turn is standing in.
A Rule that `file-matches` or `tool-call` fires is delivered into the turn that matched, because that turn is the one making the writes the Rule governs.
A delivered Rule counts as injected, so the prompt after it adds nothing.
A Rule still due when the session ends is written to the dispatch log.

## Related topics

- [Write a Rule](write-a-rule.md)
- [Frontmatter fields](frontmatter.md)
- [How a Rule reaches a harness](how-a-rule-reaches-a-harness.md)
