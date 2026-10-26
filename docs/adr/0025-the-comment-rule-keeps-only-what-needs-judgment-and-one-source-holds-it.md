# 25. The comment rule keeps only what needs judgment, and one source holds it

Date: 2026-09-15

## Status

Accepted. Records `rules/comment-discipline`, the `no-comments` Skill and
`tests/comments.test.ts`. Follows 0023, which wrote the verdict, and 0024,
which is the standard applied here. Amended by 0041, which deletes the
`no-comments` Skill and `comment-sicko`: the clause below about each of them
referencing the Rule rather than restating it has nothing left to bind, and the
Rule and the check it names are untouched. Amended by 0051, which deletes
`tests/lib/comments.ts`: the suite scans the tree with the checks kit's
`scripts/comments.ts`, the matchers the Dispatcher refuses a write by.

## Context

0023 made comment discipline a decision procedure: a table of rows, two of them
RETAIN and the rest DROP. The sweep that followed it took this repository to
fourteen comments, and with them to zero machine-read directives, zero
decision-record and ticket references, and zero doc blocks.

Nobody held that zero. It was the state of the tree on one day, kept by a table
in a context window, and the next agent who has not read that table puts one
back with nothing to object. 0024 is the standard that answers this: where a
program can decide a case, the program decides, and the sentence it replaced
is deleted. This is that Rule's first application in this repository.

Three of the table's rows need no judgment at all. Whether a comment holds
`@ts-expect-error`, whether it points at a record or a ticket, whether it is a
doc block: a program reads each one off the source.

The captain decided two more things the text did not reflect. He does not want
the machine-read directives either - "i don't want any such comments" about
`@ts-expect-error` and `// prettier-ignore` - so the carve-out that protected
them was wrong; both his repositories hold none, and this bans an empty set and
keeps it empty. And he asked the Rule and the Skill to stop disagreeing: "lets
create single rule several rules from sicko skill and comment rule for more
clear instructions for agents". `agents/comment-sicko.md` carried its own copy
of the verdict, and the copies had already drifted - the sicko spared a lint
suppression whose rule was "faulty, pedantic, or style-only", where the Rule
spared every machine-read directive unconditionally.

## Decision

**Three rows become a program.** `tests/lib/comments.ts` scans a file into its
comments and refuses three things in them: a machine-read directive
(`@ts-expect-error`, `@ts-ignore`, `// prettier-ignore`, `eslint-disable`,
`biome-ignore`), a record or ticket pointer (an ADR or RFC number, a `docs/adr`
path, an issue number, an issue or pull-request URL), and a doc block. Each
refusal names the file, the line, the token it matched and what to do instead.

The files come from the Rule's own trigger glob, read out of its frontmatter at
test time rather than copied, so the check cannot cover a narrower set than the
Rule claims. A syntax per extension covers every language that glob names, and
an extension with no syntax throws rather than passing unread.

The scan is over comments rather than over file text, and that is what lets the
check police the file that defines it: the banned tokens live there as regex
literals and string contents. The scanner walks strings, template literals,
regex literals and block comments for the same reason - a glob such as
`"**/*.ts"` holds `/*`, and `${#ARRAY[@]}` in shell holds a `#` that opens no
comment.

**A licence header is exempt by its content**: a copyright line, an SPDX
identifier, or a grant of permission. Not by a marker, which an author can
copy onto anything that needs to survive.

**The Rule keeps what needs judgment and nothing else.** Two kinds of comment
get written, the attempt to make the code say it first, how to rewrite a
survivor, and where the rationale lives instead. The DROP rows are gone: three
are the program above and the others were always instances of "anything else,
and anything you are unsure of". The Rule points at the checks so a reader can
tell the rest is enforced rather than abandoned, and says the three still hold
in a repository that has no check yet.

**The carve-out for machine-read directives is deleted.** They are banned, not
protected. A repository that needs one needs a different answer from its tool.

**Comment Sicko references the Rule rather than restating it.** Its persona and
its fresh-eyes premise are why it exists and they stay; its keep list is now
the Rule's. That reference is sound because the Rule is scoped by
`repo-contains`: a sub-agent spawned in a repository holding code is handed it
the way its parent was, which is what `tests/dispatch.test.ts` pins. The
`no-comments` Skill drops its own paraphrase for the same reason.

## What was considered and rejected

- **Grepping whole files for the banned tokens.** Simpler, and it cannot work:
  the checker's own patterns are the strings it bans, and so is the Rule's
  prose. Scanning comments is not a refinement here, it is the thing that makes
  the check applicable to itself.
- **Deciding whether a doc block "only describes its subject".** That is
  intent, and no program reads it. The form is decidable, the tree holds none,
  and a fact the types cannot hold fits on a line comment. The check bans the
  form and the record says so rather than implying it measured the intent.
- **Adding `shellcheck disable`, `# noqa` and the rest to the ban.** The
  captain named five; the tree holds none of any kind. The list is a list of
  names and the next one costs a line, so it is added when something wants it
  rather than now.
- **Parsing the trigger glob into an extension list** to pin the syntax table
  against it. That would make the glob's shape a contract. Instead the table is
  held to the glob in one direction - no syntax may be declared for a file the
  Rule never reaches - and an extension the checks cannot read throws at the
  moment a file of that type exists, which is the moment coverage would be lost.
- **Leaving the table and marking three rows as checked.** Two copies of a
  constraint, which is the failure 0024 names and the one this record repairs
  between the Rule and the sicko.
- **Keeping the sicko's own list so it works without the Rule.** The drift
  above came from exactly that. A sicko in a repository with no code file has
  no code to review.

## Consequences

- **The Rule is shorter, and what went is the part nobody has to read.** What
  is left is the two, the rewrite, and the trade about where rationale lives,
  which are all judgment.
- **Every check here was watched failing before it was trusted**, as 0024
  requires: each of the three refusals against a real violation written into
  `src/`, and each of the three guards that stop the others passing vacuously -
  the trigger selecting no file, the scanner finding no comment, a syntax
  declared for a file the Rule never reaches.
- **A new language in this tree costs a syntax entry**, and the failure names
  the extension and the file to add it to.
- **The scanner is a scanner, not a compiler.** A heredoc, a template literal
  nested in another, and a raw string ending in a backslash are shapes it would
  read wrong. None is in this tree, and a mis-scan reads code as comment rather
  than the reverse, so it over-reports and is seen rather than passing quietly.
- **Nothing checks that the Skill has not started restating the Rule again.**
  Whether prose is a restatement is a judgment, which is where 0024 leaves it.
