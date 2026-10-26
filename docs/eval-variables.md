---
kind: reference
---
# Eval variables

The environment variables `bun run eval` reads, and what reaches the agent it drives, looked up when planning a sweep.

## The variables

| Variable | Default | Sets |
| --- | --- | --- |
| `EVAL_RULES` | the Rule, Reference or past Rule least recently swept on `EVAL_MODEL`, counting only a sweep that judged a run of it, or the Rules of the cases `EVAL_CASES` names | the Rules to measure, the References a case measures on its own, or the past Rules [Eval cases](eval-cases.md) names, separated by commas |
| `EVAL_CASES` | every case of those Rules | the case ids to run, separated by commas |
| `EVAL_REPEATS` | `5` | the runs per case and arm |
| `EVAL_MAX_RUNS` | `120` | the cap on the whole plan |
| `EVAL_CONCURRENCY` | `4` | the runs in flight at once |
| `EVAL_TIMEOUT_MINUTES` | `15` | the minutes after which a run is stopped and left unjudged |
| `EVAL_MODEL` | `opencode-go/muse-spark-1.3-contributor` | pi's model, as `provider/model` |
| `EVAL_THINKING` | `high` | pi's thinking level |
| `EVAL_CREDENTIALS` | `OPENCODE_API_KEY` | the only variables passed to the agent from yours, separated by commas |
| `EVAL_PROVIDER_EXTENSION` | none | a pi extension registering the model's provider |
| `EVAL_REPORT_DIR` | `reports/evals/<time>-<run-id>` | where each run's event stream, changed files and commit messages go |
| `EVAL_SWEEP_DIR` | `evals/sweeps` | where the sweep's record goes, and the history a bare run reads |

`bun run eval` refuses a value it cannot read, such as a count below 1 or a model with no provider, before it starts a run.

## What reaches the agent

Each run gets a scratch git repository seeded with the case's files, and a HOME and a pi agent directory of its own.
The environment is built from nothing.
No variable of yours reaches the agent except `PATH`, less any directory under a live agent config, and the variables `EVAL_CREDENTIALS` names.
No Dispatcher is loaded in either arm, so no other Rule and no refusal reaches the agent.
The injected arm carries the Rule's text in the words and the place the pi Dispatcher uses, and no skill loads in either arm except the References a case names.
For a Rule case with References, both arms can load the named References as pi skills from their scratch agent directory, and only the injected arm has the Rule.
For an offered Reference case, the injected arm can load that Reference without the Rule, while the withheld arm cannot.
For a carried Reference case, the injected arm carries the Reference's text as it would a Rule's.
Its withheld arm carries nothing, and neither arm can load a skill.
For a past Rule, the injected arm carries the Rule as it read at the case's commit.
A case's hidden verifier never reaches the agent, because its files land in the sandbox only after the run's changes are read.

## Related topics

- [Measure a Rule](measure-a-rule.md)
- [Eval cases](eval-cases.md)
