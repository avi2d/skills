---
kind: how-to
---
# Measure a Rule

Measure a Rule when you need to know whether its prose changes what an agent writes, which a check that a violation did not merge cannot tell you.
`bun run eval` has a real agent do the same small task twice, once with the Rule injected and once without it, and a program judges both.

## Before you begin

- Node 24, which runs vitest, because pi fails under Bun.
- An `OPENCODE_API_KEY`, or the credentials of the provider that `EVAL_MODEL` names.

## Run a sweep

To run a sweep:

1. Pick the Rules and the cases to measure, as [Eval variables](eval-variables.md) lists, or leave both unset.
1. Run `bun run eval` on the default model at the default repeats:

   ```sh
   OPENCODE_API_KEY=... bun run eval
   ```

1. Run one control sweep of the same Rules and cases on `claude-bridge/claude-opus-5-5` with `EVAL_REPEATS=2`:
   Sign in as [Sweep a model on a subscription](#sweep-a-model-on-a-subscription) describes, and set `<extension>` to the extension the bridge's `package.json` lists under `pi.extensions`.
   Take `<rules>` and `<cases>` from the `rule` and `case` of the runs in the record the first sweep wrote, and leave `EVAL_CASES` out when that sweep ran every case of those Rules.

   ```sh
   EVAL_MODEL=claude-bridge/claude-opus-5-5 EVAL_REPEATS=2 EVAL_RULES=<rules> EVAL_CASES=<cases> EVAL_PROVIDER_EXTENSION=<extension> EVAL_CREDENTIALS=CLAUDE_CODE_OAUTH_TOKEN bun run eval
   ```

1. Commit each record a sweep wrote with `evals/sweeps/README.md` as `bun run docs` rewrites it.

With neither `EVAL_RULES` nor `EVAL_CASES` set, a sweep measures one Rule, or one Reference measured on its own: the one whose newest sweep on `EVAL_MODEL` is oldest, counting only a sweep that judged a run of it.
One never swept on that model comes before any that has been.
A sweep plans every case of the chosen Rules in both arms once per repeat.
It refuses to start a plan larger than `EVAL_MAX_RUNS`, 120 unless raised on purpose, because every run spends real model time.
For that reason no CI job runs a sweep.
`tests/unit/eval-settings.test.ts` fails when any Rule's plan at the default repeats outgrows the default cap, so a bare run is never refused for its size.

## Sweep a model on a subscription

A model on `openai` or `claude-bridge` signs in with a subscription login rather than an API key.
The sandbox holds no login, so the agent gets a token in a variable instead.

To sweep a model on `openai`:

1. Export the `access` token under `openai` in pi's `auth.json` as `OPENAI_ACCESS_TOKEN`.
1. Run `bun run eval` with `EVAL_PROVIDER_EXTENSION=evals/codex-token.ts` and `EVAL_CREDENTIALS=OPENAI_ACCESS_TOKEN`.

To sweep a model on `claude-bridge`:

1. Install `pi-claude-bridge` under `reports/`, outside every agent config.
1. Export a Claude Code OAuth token as `CLAUDE_CODE_OAUTH_TOKEN`, from `claude setup-token` or the `accessToken` in Claude Code's stored credentials.
1. Run `bun run eval` with `EVAL_PROVIDER_EXTENSION` set to the extension the bridge's `package.json` lists under `pi.extensions`, and `EVAL_CREDENTIALS=CLAUDE_CODE_OAUTH_TOKEN`.

## Read the result

To read the result:

1. Open `evals/sweeps/<time>-<run-id>.json`, which a sweep that records a run writes.
   It holds the model, the thinking level, the repeats and the commit the sweep ran on.
   It holds a sha256 of each Rule and reachable Reference file in the plan, and whether any of those files differed from that commit.
   A past Rule's text is fixed by its commit, so no file of it is hashed.
   It holds every run's verdict with its judge and evidence, its spend and turns, and whether it wrote a test.
1. Open `evals/sweeps/README.md`, which `bun run docs` writes from the records.
   It marks each sweep whose Rule or Reference files differed from its commit as uncommitted, and tabulates each Rule or Reference by sweep and by case, with each arm's pass rate, the difference and Fisher's exact p.
1. Open `runs/` in the report directory under `reports/`, which git ignores, for each run's pi event stream, the files the run changed and the messages of the commits it made.

A refused sweep writes nothing to either place.
The suite fails when `evals/sweeps/README.md` disagrees with the records, and when a commit or an uncommitted change edits, renames or deletes a record.

A run the judge cannot decide is recorded as unjudged with the reason, and kept out of the pass rate.
A run is unjudged when pi timed out or failed, when the provider erred, when the agent did not do the task, or when the output the judge reads does not show what it decides on.

## Add a case

To add a case:

1. Write it in `evals/cases/<domain>/<name>.ts`, named for the Rule, or for the Reference a case measures on its own, as a task, the seed files, and a program judge.
   `<domain>` is the domain that holds the Rule or the Reference in `library/`.
   A Reference case either offers the Reference as a skill or carries its text, as [Eval cases](eval-cases.md) describes.
   A case judged by `leftToItsGenerator` also names the generator that owns the file.
1. To grade the outcome, give the case a hidden verifier and judge it by `passedHiddenVerifier`.
   The verifier holds tests written from the task statement and the command that runs them.
   It also holds a hand fix the tests pass and a plausible wrong fix they fail.
   `tests/e2e/eval-verifier.test.ts` checks that every verifier fails its unfixed seed and its wrong fix, and passes its hand fix.
1. To measure a Rule's text at a past commit, file the case under its own name with a `rule-as-of` delivery.
   The delivery names the Rule and the fixture that holds its text as it read at that commit.
1. Add the file's cases to `CASES` in `evals/cases/index.ts`.
1. If no judge fits, write one as a program over the run's transcript, its changed files, its commits and what the case's generator produces from them, with a test that watches it fail and pass.
   A judge that parses TypeScript goes in `evals/typescript-judges.ts`, because `src/` may not import the parser, a devDependency.
   Writing judges over changed prose go in `evals/writing-judges.ts`, and one that holds the prose to the case's notes and repository goes in `evals/writing-invention.ts`.
1. List the case, and what its judge decides, in [Eval cases](eval-cases.md).

## Troubleshooting

### Not logged in · Please run /login

On `claude-bridge`, the bridge starts Claude Code under the sandbox's HOME, which holds no Claude login.
Set `CLAUDE_CODE_OAUTH_TOKEN` and name it in `EVAL_CREDENTIALS`, as [Sweep a model on a subscription](#sweep-a-model-on-a-subscription) says.

## Related topics

- [Eval variables](eval-variables.md)
- [Eval cases](eval-cases.md)
- [Write a Rule](write-a-rule.md)
- [Record 0057](adr/0057-a-rule-is-measured-by-ablation-on-vitest-evals-with-a-program-as-judge.md)
- [Record 0063](adr/0063-a-sweep-commits-its-record-and-a-bare-sweep-measures-the-rule-least-recently-swept.md)
