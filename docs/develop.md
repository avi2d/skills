---
kind: how-to
---
# Develop this repository

Develop here when you change a Body, the generator, a Dispatcher, the suite, or harness material, and want the change to pass the checks a pull request runs.

## Before you begin

- A checkout installed as [Install and uninstall skills](install.md#install) describes.
- Claude Code 2.1.280 on `PATH`, for the delivery tests that drive a real `claude`, which skip without it.

## Run the checks

To run the checks before a push:

1. Run `bun install`.
1. Run `bun run generate`.
1. Run `bun run build`, and commit what it rewrites, because CI fails on a diff the build leaves.
1. Run `bun run lint`.
1. Run `bun run typecheck`.
1. Run `bun run test:fast`.

`bun run build` writes `CHANGELOG.md` from the conventional commits since the last release, and the Effect scope in `tsconfig.json`.

`.github/workflows/ci.yml` runs the same steps on every pull request and every push to main, on a clone, with the full `bun run test` in place of `bun run test:fast`.
It installs `claude` and a pinned `sqlite3` before `bun run test`.
It runs `bun run test` with `TMPDIR` set to an empty directory under the runner's per-job temp, then `scripts/check-tmp-clean.sh`, which fails the job naming anything the suite left there.
Every job runs on `ubuntu-latest`.
Every job checks out, installs the Bun that `.bun-version` names and runs `bun install --frozen-lockfile` through the shared `avi2d/workflows/setup@v1` action, and `.github/dependabot.yml` moves the `setup@v1` action pin and every other action pin weekly.
Each workflow in `.github/workflows/` is owned by this repository, and `checks-ci-wiring` fails naming a required command the pull request workflows no longer run.
It also fails a setup step whose Bun is not the kit's fleet version, so `.bun-version` moves only with a kit release that moves the fleet.
`ci.yml` also lints a pull request's title as a conventional commit, because a squash merge makes the title the commit subject.
It reports that result as the `commitlint` status through the shared `commitlint-status` action, and a dispatched run reports its result on the head commit through the shared `head-status` action.
A pull request that touches only top-level Markdown and Markdown under `docs/` skips `bun run typecheck`, `bun run test` and their setup, and still lints its title, builds, lints and reports.

`bun run test` is the kit's `checks-test`, which runs `bun test --randomize` with one worker per machine core and prints the seed that reproduces a failure.
`bun run test:local` runs the whole unit and e2e tiers through `scripts/test-local.ts`, with the same worker count.
Bun hands each test file to one worker process, and each file runs in a fresh global, so a file cannot lean on state another file left behind.
It fails on a skipped test that declares no reason with `skipReason` at its test site, because bun exits 0 over a test that never ran.
A skip only a local machine meets, one without `claude` on `PATH` or without the `repos/effect` link, passes `"local"` as the third argument, so only a local run accepts it.
A test that reads `$HOME` passes against a home nothing was installed into, or skips and says why.

`bun run test:fast` is `scripts/test-fast.ts`, and `.no-mistakes.yaml` names it as the push gate's test step.
It runs `tests/unit/`, then the e2e test files the branch touches since it left `origin/main`, committed, uncommitted or untracked.
It runs as many workers as the machine has cores, and judges skips the way `bun run test` does.
It fails before running anything when `origin/main` is missing, because then the touched files are unknown.

`bun test` preloads `tests/lib/emitted.ts`, which generates into a `generated-<pid>/` of the test process's own.
A fresh clone and a fresh worktree are green without a command anyone has to remember, parallel test processes never read each other's output, and the suite writes none of the `generated/` tree the harnesses load.
One test holds the emitted tree to exactly what the generator would write, and asserts it had something to look at.

`bun run lint` is `oxlint`, then `checks-lint`.
`checks-lint` runs the pull request gates in `@avi2dg/checks` over the commits since the branch left main, scoped to the gates the change reaches.
`checks-docs` holds each doc the branch touches to its template.
`checks-graphwalk` holds every tracked `.ts` file to the dependency rules, fails on an unreached one, and fails on an unused export missing from `exports-baseline.json`.
A file nothing imports and no tool names goes in the `entry` list of `knip.config.ts`.
The `exports-baseline.json` stays empty, so an unused export is deleted or unexported, not listed.
The kit's size rules in `oxlint.config.ts` fail any production or test file over budget, whether or not the branch touched it.
The suite fails on any entry in `oxlint-suppressions.json`, so the file is absent or empty.
Four gates run only when someone starts `checks-lint --whole-tree` by hand, namely `checks-lint-coverage`, `checks-repetition`, `checks-suppressions-ratchet` and `checks-quarantine-clock`.
No schedule or workflow runs them.
`checks-advisories` holds `advisory-acks.json` to its rules on every run and defers its scan to the scheduled run, so the pull request run fetches no advisory database.
`.github/workflows/advisories.yml` runs it with `--all` every Monday over the whole of `bun.lock`, which finds an advisory published after its package landed and an advisory a `bun.lock` change adds.

`@avi2dg/checks` comes from the public npm registry by semver range, so a clone, a worktree and CI all install the same tree with nothing beside them.
`tests/e2e/toolchain.test.ts` refuses a `file:` dependency, and a repository dependency that names anything but a commit.

`tests/e2e/fleet-names.test.ts` fails a tracked file that names a machine, an account, a fleet tool or a generic setup path more often than `tests/fixtures/fleet-names.json` allows.
That file holds each file's count today, and a change that removes a name lowers its count, because the test also fails a count above what the file holds.
A private names file adds owner-specific names to the same scan with counts in `fleet-names-allow.json` beside it, and the suite scans only the public names when that file is absent.
The suite reads that file from `$SKILLS_FLEET_NAMES_FILE` when that variable names it, else from `skills/fleet-names.txt` under `$XDG_CONFIG_HOME` or `~/.config`.

`bun run typecheck` is `tsc --noEmit` plus the Effect language service's diagnostics, configured in `tsconfig.json`.
Outside the tests, `evals/`, `harness/` and the modules a Dispatcher bundles, the Effect overrides in `oxlint.config.ts` and `tsconfig.json` hold the code to Effect.
`checks-effect-scope` writes the `tsconfig.json` one from `oxlint.config.ts` in `bun run build`, and fails the lint when the two differ.
That scope allows no throw, no catch, no IO of its own, no `node:fs` or `node:child_process`, and no read of a variable off `process.env`, so file and process access goes through Effect's services and the layer in `src/platform/platform.ts`, and an environment variable through `Config`.
The kit ships the rule blocks in `src/quality/presets/`, and `tests/unit/bundle.test.ts` holds the oxlint override to exactly the files a Dispatcher bundles.
`tests/e2e/effect-scope.test.ts` holds the `tsconfig.json` one.
Across all of `src/`, bundled modules included, `oxlint.config.ts` bans the `Bun` globals for files and processes.

## Write source code

To change a file under `src/`:

1. Return `Effect` from every effectful or fallible function, and a plain value from a pure helper.
1. Add a case to an existing failure in `src/platform/failures.ts` before inventing another, one per repair a reader has to make.
1. Reach file and process access through `attempt` in `src/platform/files.ts`.
1. Run an effect in a test only through the helpers in `tests/lib/effect.ts`, and observe a failure through `said` or `saidBy` rather than by catching a throw.

This holds outside the modules a Dispatcher bundles, which the `files` of each bundle in `src/generate/bundle.ts` list, and the pi extensions under `harness/`, which load without `node_modules`.
`src/platform/platform.ts` holds the one layer that provides file and process access, and its `main` runs an entry point under it.
The prose in a message is the product here, so keep it exact when moving one.
Effect here is v4, and recall gives v3, so pull the `effect-patterns` reference and read `repos/effect` before writing it.

## Write a test

To add a test:

1. Put it under `tests/unit/` when it imports the code under test, which is the default.
1. Put it under `tests/e2e/` only when it spawns a binary or a harness subprocess.
1. Reach the emitted tree through `GENERATED_ROOT` in `tests/lib/generated-root.ts`, and never spell `generated/` in the test.
1. Remove every temporary directory the test creates, and point the `TMPDIR` of a process it spawns into one of them, because CI fails a run that leaves anything in its temp directory.

A test under `tests/e2e/` runs out of process, so mutation testing cannot see through it, and it stays out of the mutation scope.
Stryker's runners share the one working tree they mutate in place, so nothing a test process writes may be shared.
The preload sets `SKILLS_GENERATED_ROOT` to the process's own `generated-<pid>`.
`readGeneratedRoot` in `src/generate/bundle.ts` reads it through `Config` wherever the source writes or reads the emitted tree, and `GENERATED_ROOT` runs the same read for a test.

A check that walks the filesystem excludes the fetched tree under `repos/`, and keeps a test that decides something whether or not the tree is there.
`git check-ignore` and a unit test over the predicate both do.

## Run the mutation tests

To run the mutation tests, run `bunx stryker run --mutate <glob>` to mutate the files the glob names, and add `--incremental` to reuse the results of the last run.

Outside CI the kit's preset refuses a run with neither `--mutate` nor `--incremental`, and refuses `--incremental` without `--mutate` while `reports/stryker-incremental.json` does not exist.
`bunx stryker run --incremental --mutate <glob>` writes that file locally, and the same command run again tests only the mutants changed since.
A run over the whole of `src/**` is what Stryker's default `mutate` selects here.
`stryker.conf.mjs` spreads the kit's `stryker.preset.js` and sets only `bun.testFiles`.
The score is advisory, because the preset's `thresholds.break` is null, so no pull request waits on mutation.
No workflow runs it.
The runner hands `bun.testFiles` to `bun test` verbatim and expands no glob.
`stryker.conf.mjs` sets it to the preset's `unitTestFiles()`, every test file under `tests/unit/`, so a covered, non-static mutant loads only the files that cover it.
The out-of-process tests under `tests/e2e/` and everything under `tests/quarantine/` stay out.

`inPlace` is the preset's true, so Stryker mutates the working tree, keeps a backup in `../.stryker-tmp` and restores the files from it when the run ends.
Leave `src/` untouched until the run ends, since the restore overwrites an edit made during the run and a commit made during the run records mutated files.
Each test process's preload generates into its own `generated-<pid>`, and generates nothing when the source resolves any other root.
It sweeps a dead process's root by renaming it into its own root and removing it there, so no remove runs inside a directory another process reads.
A unit test that writes, reconciles or checks a generated tree does it in a temporary repository of its own, and the one that checks the preload's output reads `generated-<pid>` by name rather than through the root the source resolves.
A mutant that makes `generatedRoot` in `src/generate/bundle.ts` fall back to `generated` writes into the `generated/` tree the harnesses load, and Stryker does not restore that tree, so `bun run generate` rebuilds it after a run.

`concurrency` is the preset's half of the cores the machine reports, so `stryker.conf.mjs` does not set it.

The baseline, measured on 2026-09-24 over 4,296 mutants, is 37.58 in total and 63.11 on covered code.
Two full sweeps at concurrency 10 on the same head agreed mutant by mutant, in about 20 minutes each.
One full sweep at the same concurrency took 177 minutes on a GitHub runner.
A mutant that breaks generation throws in the preload and lands as a RuntimeError, outside the score, and all but one of the baseline's 382 RuntimeErrors are that.

## Replay a flaky test

To replay a test that failed on one seed:

1. Find the seed in the failing run's output, or in the `flake-report` artifact of `.github/workflows/flake.yml`.
1. Run `bun test --randomize --seed=<seed>`.

`.github/workflows/flake.yml` runs the suite on ten seeds with `checks-flake` when you start it by hand.
It keeps the seeds each failing test failed with.
A test found flaky moves to `tests/quarantine/unit/`, which a default run skips.
`checks-quarantine-clock` fails a test left there more than 30 days when someone runs it by hand.
Fix the test and move it back, or delete it.

## Re-pin a library

To re-pin a library that `repos/` links:

1. Bump its version in `package.json`.
1. Run `bun install`, which runs `checks-vendor` through the `prepare` script.

The `prepare` script's `checks-vendor` arguments name the package, the git remote and the tag template `checks-vendor` resolves against the installed version, then clones that tag into a shared cache and links `repos/<name>` to it.
`repos/<name>` is git-ignored.
Nothing imports the linked tree, `tsconfig.json` does not include it, and `bun test` is green whether or not it has been linked.

## Cut a release

To release what main holds since the last tag:

1. Run `bunx checks-release-report`, which lists the unreleased features and fixes, and exits 0 when there are none.
1. On a branch, bump `version` in `package.json`.
1. Run `bun run build`, which writes that version's section into `CHANGELOG.md`, and commit both files.
1. Merge the pull request.
1. Tag the merge commit on main `v<version>` and push the tag.

`.github/workflows/release.yml` refuses a tag that disagrees with `package.json`, then creates the GitHub release with that version's `CHANGELOG.md` section as its notes.

## Add harness material

To add a file a harness loads itself:

1. Put it under `harness/`, which is not the Dispatcher, so neither [Where dispatch logic goes](how-a-rule-reaches-a-harness.md#where-dispatch-logic-goes) nor the Effect scope of [Write source code](#write-source-code) holds it.
1. Wire it with an entry in `LINKS` in `src/generate/link.ts` pointing `$HOME` at it, and add the file to git first, because `tests/unit/link.test.ts` refuses an entry whose target a clone cannot come by.
1. Write no line in `harness/pi/settings.json` for a pi extension linked under `~/.pi/agent/extensions/`, because pi discovers it there.

Everything under `harness/` is typechecked and testable like `src/`.
A pi extension that keeps its logic in exported pure functions gets a unit test without starting pi, because a pi type it imports erases and a pi value it imports, such as `Markdown`, resolves from the `devDependencies` in `package.json`.
A linked pi extension resolves no package from this checkout's `node_modules`.
It imports only Node's built-ins, the packages pi gives every extension, and its own files.
`bun run link` refuses to link $HOME while the pi on `PATH` fails to load it, and `tests/e2e/extension-preflight.test.ts` holds that refusal.
A patch to a provider behaviour belongs here rather than in `src/`, as [record 0031](adr/0031-a-leaked-tool-call-is-repaired-in-the-harness-rather-than-waited-on-upstream.md) records for the one that repairs qwen3-coder's leaked tool calls.

## Troubleshooting

### The lint suggests `oxlint --suppress-all`

A lint rule found a new site.
Fix the site instead, because the suite refuses suppression counts and `checks-suppressions-ratchet` refuses them when someone runs it by hand.
In a test, a value that has to exist is `?? expect.unreachable(...)`, and parsed data is a `Schema` decode.

### `bun install` fails with `repos/effect is not a link`

The checkout still holds the real `repos/effect` directory that the old vendor script cloned, and `checks-vendor` never replaces a directory it did not link.
Move `repos/effect` out of the checkout, then run `bun install` again.

## Related topics

- [Write a Rule](write-a-rule.md)
- [How a Rule reaches a harness](how-a-rule-reaches-a-harness.md)
- [Decision records](adr/README.md)
