# Project agent memory

This repository builds agent instructions into a Hub and one Dispatcher per harness, and `README.md` holds what a person reads.
`docs/glossary.md` is the vocabulary.

## Before you change a part

- A Rule, a Reference, a Skill or `selection.toml`: read [Write a Rule](docs/write-a-rule.md) first. A running Dispatcher sees an edited Rule only after `bun run generate`.
- Anything under `src/dispatcher/`: read [Where dispatch logic goes](docs/how-a-rule-reaches-a-harness.md#where-dispatch-logic-goes) first.
- Any other file under `src/`: read [Write source code](docs/develop.md#write-source-code) first.
- A test: read [Write a test](docs/develop.md#write-a-test) first.
- A script in `package.json`, a workflow, `oxlint.config.ts` or `tsconfig.json`: read [Run the checks](docs/develop.md#run-the-checks) first.
- `src/eval/` or `evals/`: read [Measure a Rule](docs/measure-a-rule.md) first.
- `harness/`: read [Add harness material](docs/develop.md#add-harness-material) first.

## Effect

Code here is Effect v4, and recall gives v3, so pull the `effect-patterns` reference and read `repos/effect` before writing it.
