# 96. The title lint is a step of the ci job, and a docs-only change skips the suite

Date: 2026-10-11

## Status

Accepted. Supersedes 0059's decision that commitlint keeps its own workflow.

## Context

The captain ruled that the pull request title lint runs
in the ci workflow's job rather than a workflow of its own. The same ruling
lets a docs-only change skip the full run. `@avi2dg/checks` 0.40.0 ships both:
`checks-commit-title` lints the title and
`checks-docs-only` tells a docs-only change.

## Decision

**The title lint is one step of the ci `checks` job.** It runs
`bunx checks-commit-title`. The next step always runs and reports that step's
outcome on the head commit as the `commitlint` status, so the required check
keeps reporting.

**A docs-only change skips the suite.** A change is docs-only when it touches
top-level Markdown and Markdown under `docs/` and nothing else. It skips
`bun run typecheck`, the Claude Code install, the sqlite and suite temp
setup, `bun run test` and the temp cleanup check. The title lint,
`bun run generate`, `bun run build`, `git diff --exit-code`,
`bun run lint` and the status reporting always run.

## Consequences

A pull request runs one job where it ran two.

ci runs on `edited`, so a title edit reruns the whole job.
