---
governs: [.github/workflows/ci.yml, .github/actions/setup/action.yml, scripts/ci-test.sh, package.json, .no-mistakes.yaml]
---
# 118. The workflows are the set the checks kit writes

Date: 2026-11-25

## Status

Accepted.
Supersedes 0107: `ci.yml` runs on a push to main, and the fleet-names scan runs in the `docs` job on every pull request.
Amends 0096 and 0059: the title lint runs in `pr-title.yml`.
Amends 0070 and through it 0009 and 0037: `ci.yml` runs on a push to main again.

## Context

The owner asked every repository to stop calling workflows and actions from the shared workflows repository, so that repository can be archived once nothing calls it.
`@avi2dg/checks` writes a workflow set with `bunx checks-workflows --write`, and its `static` job fails a pull request whose workflow files differ from that set.
The set fixes the jobs of `ci.yml` and their triggers, and keeps one command in the step with id `test` of each test job.
This repository's e2e tests need a pinned `sqlite3` and the pinned push gate binary, and its suite must leave nothing in its temp directory.
The kit's `checks-no-mistakes-test` gate fails a `.no-mistakes.yaml` that names a test command.

## Decision

`.github/workflows/` holds exactly the set `bunx checks-workflows --write` writes, with `.github/actions/setup` in place of the shared setup action.
Each test job runs `scripts/ci-test.sh <tier>`, which installs the e2e tools for the e2e tier, runs `bunx checks-ci test` in an empty `TMPDIR` and then `scripts/check-tmp-clean.sh`.
The `docs:build` script runs `bun run docs --check` and `tests/e2e/fleet-names.test.ts`, so the kit's `docs` job runs them on every pull request, docs-only ones included.
`.no-mistakes.yaml` names no test command.

## Consequences

A push to main starts a `ci.yml` run again, since the set triggers on it.
A pull request runs only the tests its change reaches, and a push to main and the release pull request run the whole tier.
A code change runs the fleet-names scan twice, once in `docs` and once in the e2e tier, where 0107 ran it once.
A kit upgrade followed by `bunx checks-workflows --write` moves the action pins, and a workflow edited by hand fails the `static` job.
