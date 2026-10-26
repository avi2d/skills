---
kind: reference
---
# Eval cases

What each Rule's eval cases measure, and each Reference's measured on its own, looked up when reading a sweep or when deciding which Rules earn their place.

## The cases

| Rule | Cases | A run passes when |
| --- | --- | --- |
| `agent-docs` | none | the Rule only delivers the reference, which is measured on its own |
| `agents-md-router` | `release-pointer` | the agent points release work at its procedure without copying it |
| `comment-discipline` | `public-helper`, `decision-record`, `upstream-workaround`, `module-rationale` | the lines it added carry no comment the kit's matchers refuse |
| `effect-error-channel` | `scheduled-job`, `invoice-route` | the TypeScript it added erases no error unseen, through `Effect.ignore`, `Effect.catchCause`, a handler that never reads the error, or `Effect.orDie` on a failure the task says happens |
| `fix-what-you-see` | `unrelated-failure`, `stale-readme` | it fixed the fault behind a failing test it did not cause without silencing the test, or corrected a stale name on the page it was editing |
| `force-determinism` | `convention-as-check`, `watched-red` | it put a constraint into a file outside prose, such as a tsconfig `rootDir` or a `package.json` `files` list that leaves tests out of the package, or saw its new check fail in a test run and then pass, without rewriting the check in between |
| `git-hygiene` | `changelog`, `generated-routes` | it left `CHANGELOG.md` and any file `.gitattributes` marks as generated as the tool that writes them would, from the sources the run left |
| `git-hygiene-co-author` | `co-author` | no commit it made carries a `Co-Authored-By` trailer |
| `guard-the-context-window` | `build-log`, `lockfile` | it found the answer with less tool output entering its context than the case's byte budget |
| `prove-it-works` | `verify-the-fix`, `reproduce-first`, `git-ignored`, `cron-next` | a test command ran after its last write, or a command run on the reported input printed its wrong value before its first fix, or, for an outcome case, its hidden verifier passes |
| `right-size-the-work` | `csv-migration`, `fixture-rename` | it did a one-off migration and left no new script behind, as a file or as a `package.json` script |
| `typescript-best-practices` | `json-config`, `error-message` | the TypeScript it added makes no type assertion other than `as const`, which measures the Boundaries instruction: types are erased at runtime, so incoming data is parsed with a schema that the type derives from, and a hand guard checks every field its type declares |
| `writing-for-people` | `en-readme`, `ru-readme`, `en-pr`, `ru-pr`, `en-site`, `ru-site`, `en-errors`, `ru-errors`, `en-commit`, `en-pr-fix`, `en-readme-flag`, `en-news` | the README passes what the `technical-writing` judge reads in either language, and no README, PR description, site paragraph or message keeps a tell the plain-overview judge looks for or one the `unslop` judge reads. The commit message, the PR description written after the fix, the README flag section and the news note also pass the `plain-sentences` judge, and the README flag section passes what the `technical-writing` judge reads |

The `agents-md-router` and `writing-for-people` cases compare each Rule injected against the Rule withheld.
The References a Rule sends the agent to are reachable in both arms, as the Hub lists them whether or not the Rule fires, so the arms differ only by the Rule.

A Reference measured on its own is filed under its own name, so a sweep pools its runs apart from the Rule that points at it.
An offered case compares the Reference reachable without any Rule against the Reference withheld.
It can name References alongside it, which the injected arm offers too and the withheld arm does not.
A carried case puts the Reference's text in the injected arm the way the Dispatcher carries a Rule, and nothing in the withheld arm.
So the arms differ by the text, not by whether the agent chose to read it.
`copy-edit-overview`, `copy-edit-puff` and `writing-for-agents-reference` are offered, and every other Reference case is carried.

The Ledger cases are writing tasks about a small CSV bookkeeping tool.
Each id names the language, `en` or `ru`, and the text the agent writes.
The texts are a README section, a PR description, a site paragraph, the import screen's error messages and a how-to page under `docs/`.
One task is filed under each Reference whose ask it exercises, and each Reference's judge reads only that Reference's asks.
The `writing-for-people` Rule reuses the README, PR, site and messages tasks.
Its four harder cases put the text inside a code change or ask for it from notes full of dashes and parentheses, because in a pure writing task both arms load the References and pass.
`en-commit` fixes the import key and commits under a `CONTRIBUTING.md` that asks for a body saying what changed and why.
`en-pr-fix` fixes the same key and writes the PR description.
`en-readme-flag` adds a `--dry-run` flag and documents it in a README whose overview holds two sentences on one line.
`en-news` writes a note on Ledger 1.3 for small business owners from engineering notes.
A Ledger run is judged only when its text keeps the facts its task gave, and is unjudged otherwise.
A file the task added to keeps every line it held before.
The README puts `bun install` and `bun test` under a section heading each, and names Bun 1.2 and the tests passing.
The PR description names the date, the amount and the payee the new key reads, the amount kept to two decimal places, the payee trimmed, the payee lowercased, and a row seen before skipped.
The site paragraph names the CSV file, the ledger file each transaction goes to, the user's own computer, the skipped transaction, the import that can run twice, no account, no upload, no subscription, free, open source, the MIT licence, Sberbank, Tinkoff and Revolut, and the column mapping.
The page under `docs/` carries the Ledger import command.
The commit message names the same key as the PR description and the payment imported twice, and is read across the lines git wraps, with a conventional commit's scope and a call such as `toFixed(2)` left out of the prose.
The README flag section names `--dry-run`, that it writes nothing and that it lists what an import would add, and the README keeps the import command without the flag, the test command and `ledger.csv`, though the agent may split a line it held.
The news note names version 1.3, the dry run that writes nothing, the duplicate fix for a payee that differs in spaces or case, Alfa-Bank, the 50 MB limit and the 10 MB one before it, the missing columns the error names, and Bun 1.2.
Each message says what went wrong with its own fact: over the 10 MB limit, not a CSV file, missing columns with `{columns}`, or every row imported already on `{date}` with nothing added.

| Reference | Cases | A run passes when |
| --- | --- | --- |
| `plain-sentences` | `en-pr`, `en-site`, `ru-pr`, `ru-site` | no sentence runs past 25 words, counting a number, an identifier or a code span as one, none is a passive with "by" or says "please", and no two sentences in a row open with the same two words |
| `plain-words` | `en-readme`, `en-pr`, `en-site`, `en-errors` | the text uses no word from the reference's catalogues: filler, a long word, "serves as", AI vocabulary, an abstract noun, a Latin abbreviation such as "e.g." or "vs", an idiom such as "out of the box", a hedge or an adverb such as "simply" |
| `punctuation` | `en-pr`, `en-site`, `ru-pr`, `ru-errors` | the text holds no dash, parenthesis, semicolon, slash between words, curly quote, emoji, "etc.", "click here" or bold label |
| `russian-prose` | `ru-readme`, `ru-pr`, `ru-site`, `ru-docs` | no instruction is in the singular imperative and no step in the infinitive, no word such as "vs" or "фикс" stands where a Russian word exists, no paragraph runs past six sentences, and no text uses more than five reflexive passive verbs where an actor could lead the sentence. It finds reflexive forms by their suffix, so an active reflexive such as "завершился" counts as well |
| `technical-writing` | `en-readme`, `ru-readme`, `en-docs`, `ru-docs` | the heading over each command names the task in sentence case, each line holds one sentence, no sentence talks about the page or says what is not true now, a page under `docs/` names its mode in `kind` front matter, and the text states no command, path or output that the notes and repository do not hold |
| `unslop` | `copy-edit-overview`, `copy-edit-puff`, `ru-pr`, `en-site-index` | each copy edit keeps the import command and file, and leaves no title-case heading, "serves as", passive with "by", inline-header label, dash, parenthesis or semicolon, and a Ledger text carries no puffery, promotion, "not just X but Y", unsourced claim or chatbot framing, and the PR description carries no first person while a site paragraph opens on the mechanism |
| `writing-for-agents` | `writing-for-agents-reference`, `positive-target`, `lookup-left`, `one-source` | the new test review step names an observable end to resolving failures, the line against default exports states only the target, `AGENTS.md` keeps the notes' gotcha and restates fewer than two of the package scripts, and the test command is stated on one line of `AGENTS.md` |

The `technical-writing` judge is a heuristic that recognises the command, path and output-claim shapes its tests cover, and leaves other phrasing unjudged.

An outcome case grades the work rather than how it was done.
Its hidden verifier is a set of behavioural tests written from the task statement, which the agent never sees.
They reach the sandbox after the agent finishes and run against what it left.
The run passes only when they do.
Whether the agent wrote a test of its own is recorded with the run and never judged.
`git-ignored` fixes a gitignore matcher that misses the `build/` line, graded on 95 line sets over 46 files against what git itself lists as ignored, with each glob read as `fnmatch(3)` reads it.
`cron-next` fixes a next-run search that runs a weekday job on Saturday, graded on 28 schedules from 5 starts against a separate search written from `crontab(5)`, and on a February 29 job restricted to Sundays whose next run is 28 years off.
The `prove-it-works-test-first` cases are `npm-caret` and `exact-cents`.
`npm-caret` fixes a caret range that lets `0.3.0` satisfy `^0.2.3`, graded on 47 range checks that agree with npm's semver package, prerelease ranges among them.
`exact-cents` fixes money functions that return `0.30000000000000004`, graded on every amount from one cent to fifty dollars against exact half-up rounding to the cent.

A Rule as it read at a past commit is filed under a name of its own.
A sweep pools its runs apart from the Rule as it reads now.
Its cases compare that text injected against the Rule withheld.

| Past Rule | Cases | Injects | A run passes when |
| --- | --- | --- | --- |
| `prove-it-works-test-first` | `npm-caret`, `exact-cents` | `prove-it-works` at `ca24440`, which ordered a delivery as the failing test first and the fix on top | its hidden verifier passes |

`copy-edit-overview` and `copy-edit-puff` offer `technical-writing`, `plain-sentences`, `plain-words` and `punctuation` alongside `unslop`, because they hold the principles their judges read.

The cases for a Rule or a Reference are in `evals/cases/<domain>/<name>.ts`, under the domain that holds it in `library/`, and judges are in `src/eval/eval-judges.ts`, `src/eval/seen-failing.ts`, `evals/typescript-judges.ts`, `evals/boundary-judges.ts`, `evals/writing-judges.ts` or `evals/writing-invention.ts`.
A run that did not do the task is left unjudged rather than passed.
A site paragraph opens on the mechanism when its first sentence names the CSV input and leads with no benefit verb such as "helps".
The judge passes an opening shape it does not recognise and leaves it to a reader.

## Unmeasured Rules

### `agent-docs`

The Rule only sends a session that wrote a SKILL.md to the `writing-for-agents` reference, and no judge measures that delivery.
The guidance itself is measured where it lands, under the `writing-for-agents` reference.

## What a judge leaves out

A judge decides only what shows in the files a run changed, the commits it made, the output of the commands it ran and what a case's generator makes of the result, so part of some Rules goes unmeasured.

- `fix-what-you-see`: whether a UI looks off during end-to-end testing needs someone to look at it.
- `right-size-the-work`: preferring quality over development cost is a judgment between two approaches.
- `typescript-best-practices`: the advice on modelling the domain in types is design, which needs a reader.
- `plain-sentences`: one thought to a sentence, the condition and the common case first, and what "only" or a pronoun points at.
- `plain-words`: whether a word is the name the code uses, and one name for one thing, beyond the catalogues.
- `punctuation`: a colon that joins two clauses, the serial comma, code font for a bare name, and a list's shape.
- `russian-prose`: whether a text takes УТР or info style, whose rules the reference does not state, and direct word order.
- `technical-writing`: whether the page type and mode fit the content, the kit's template, where opinion sits, and when a diagram reads faster.
- `unslop`: whether a sentence past a site paragraph's opening names the mechanism or a number, says something only this project could say, or reads as voiceless.
- `writing-for-agents`: a pointer's wording and leading word, where each piece sits on the information hierarchy, and which lines are no-ops for the model.

The outputs of every run stay in the report directory, so what a judge leaves out can be read there.

## Related topics

- [Measure a Rule](measure-a-rule.md)
- [Eval variables](eval-variables.md)
- [Record 0057](adr/0057-a-rule-is-measured-by-ablation-on-vitest-evals-with-a-program-as-judge.md)
