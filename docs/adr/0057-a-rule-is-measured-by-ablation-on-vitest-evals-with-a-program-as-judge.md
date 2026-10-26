# 57. A Rule is measured by ablation, on vitest-evals, with a program as judge

Date: 2026-09-24

## Status

Accepted. Amended by 0063: a sweep commits its record under `evals/sweeps/`
rather than leaving its results in `reports/`, a sweep that names no Rule
measures the one least recently swept, and the defaults are 5 repeats under a
cap of 40. Amended by 0068: a reproduction counts when its output shows the
case's defect, whatever its exit status.

## Context

The checks kit's backtest splits this repository's history at the commit that
added the comment Rule and the one that added its check: 299 refused comments
landed with neither, 134 with the Rule alone, none once the check was live.
That tells us the check holds. It cannot tell whether the Rule's prose changes
what an agent writes, because the windows differ in the work done, the model
that did it and whether the Rule was ever injected into the sessions that
wrote them.

An ablation can tell. It runs a real agent on the same small task twice, once
with the Rule injected and once without it, changes nothing else, and judges
both arms the same way.

Two harnesses were candidates. vitest-evals (Sentry, Apache-2.0, 0.17.0) runs
a suite of eval cases through a harness and scores each with judges, and a
judge may be a plain function. The other option was the smallest equivalent on
`bun test`, built by hand.

## Decision

**The harness is vitest-evals 0.17.0 on vitest 4.1.11**, run by `bun run eval`.
It met the condition for choosing it by running cleanly beside this
repository's toolchain. It installs as 40 packages, about 38 MB beside 622 MB.
The eval files are `*.eval.ts` under `evals/`, which `bun test` does not
collect. The typecheck and oxlint read them, and the suite, lint and typecheck
pass unchanged.

It needs three settings:

- vitest runs under node, not `bun --bun`. Under `bun --bun`, bun replaces the
  `node` on the child processes' `PATH`, so pi, the agent under test, starts on
  bun and fails inside its bundled undici. This repository's Effect platform
  layer works under node, because `@effect/platform-bun`'s file system and
  process spawner are the node-shared ones. Two changes keep the eval's
  imports free of `Bun` at load and at call: `bundle.ts` builds its transpiler
  when it scans rather than when it loads, and the eval reads a Rule's prose
  from its `SKILL.md` rather than through `loadBodies`, which parses YAML with
  `Bun.YAML`.
- `--configLoader runner`. Vite's native config loader leaves type stripping
  to node, which refuses TypeScript under `node_modules`, and the checks kit
  ships its matchers as TypeScript. For the same reason the workers inline
  `@avi2dg/checks`.
- The test's own `expect`. Under `it.concurrent`, vitest-evals'
  `toSatisfyJudge` through the global `expect` attached one test's score to
  another in a probe. The tally never reads those scores: each test writes its
  own run record to its meta, and the reporter reads only that.

The first-party pi harness, `@vitest-evals/harness-pi-ai`, drives pi-ai and
pi-agent-core in the eval's own process, and peers on the `@mariozechner`
scope rather than `@earendil-works`. An arm needs a process with its own HOME,
so the harness is `createHarness` over the pi CLI in JSON mode.

**An arm differs from its twin by the Rule's text and nothing else.** Both
arms load the same pi extension, `evals/carry.ts`, and nothing else is loaded:
no discovered extension, skill, prompt template, theme or context file. In the
injected arm the extension prepends the Rule on every request, as a custom
message, in the words the pi Dispatcher would inject for that Rule alone. A
test pins those words equal to `carriage()` over the index the generator
builds. In the
withheld arm it adds nothing. No Dispatcher runs in either arm, so no other
Rule reaches the agent, and the `forbid` of `comment-discipline` refuses no
write. The ablation measures the prose, not the check.

**The judge that decides a run is a program.** A case is a task, the seed
files of a scratch repository, the Rule it measures and one judge from
`src/eval-judges.ts`:

- `comment-discipline` is judged by the Dispatcher's own
  `judged("comments", …)`, the kit's matchers over the lines a run added.
- `prove-it-works` is judged on the order of the transcript: whether a test
  command ran after the last write, and whether, before the first write to
  the source under fix, a command failed on the reported input, named in its
  own invocation or in a test written before it. A command fails when it exits
  non-zero or when its output shows a failing test, since a pipe through
  `tail` hides the exit. An already green suite run before the fix reproduces
  nothing and does not count.
- `guard-the-context-window` is judged on the bytes of tool output that
  entered the context, once the answer has been found.

A run a judge cannot decide is unjudged, with its reason, and stays out of
the pass rate. That covers pi running out of time or failing, the provider
erring, a line of pi's stream that does not decode, and a run that did not do
the task. The verdict type admits only `kind: "program"`. A model judge, if
one is ever needed, is reported beside the verdict under its own kind and
never decides it.

**A sweep reaches no live agent configuration.** Each arm gets a fresh
temporary directory holding its own HOME, pi agent directory, `TMPDIR` and git
repository. The environment is built from nothing. The caller's `PATH` goes
through, less any directory under a live root, and so do the credentials
`EVAL_CREDENTIALS` names. A live root is one of the five agent configuration
directories or any path in `LINKS`. `tests/e2e/eval-sweep.test.ts` runs a sweep
against a fake live HOME that holds every `LINKS` path, with every variable
that names an agent configuration pointed into it and a probe binary on a live
`PATH` entry. A scripted model from pi-ai's `faux` provider drives the real pi
binary, and its agent writes to all of them. The test fails if anything under
a live root or a link target moves. It was watched failing three ways before
it passed: with the caller's environment passed through, with the `PATH`
filter gone, and with the sweep repointing a link.

**A sweep plans before it runs and refuses a plan over `EVAL_MAX_RUNS`**, 24
unless raised. It is run by hand and no CI job runs an agent. The suite
exercises the harness on the scripted model at no spend.

The output is `results.json`: per Rule, each arm's pass rate, the difference,
Fisher's exact p, a tally per case, and every run's verdict with its judge and
evidence. Beside it are `table.md` and each run's pi event stream and changed
files. The headline p pools every run across a Rule's cases as if each were
independent, which overstates the evidence when outcomes cluster by case, so
the per-case rows are the ones to read.

## Alternatives

The smallest equivalent on `bun test`. `bunfig.toml` roots collection at
`tests/`, so an eval there runs in every `bun test` and spends on every run.
Elsewhere it needs a runner of its own, and the judge, score, record and
report plumbing written by hand. vitest-evals ran cleanly, so the condition for
the smaller path did not arise.

Loading the real Dispatcher with an index holding one Rule. For
`comment-discipline` its `forbid` would refuse the very write being measured,
and it brings triggers and the verdict gate with it.

`--append-system-prompt`. It is simpler, but it is not where the Dispatcher
puts a Rule, so it would measure a delivery nobody uses.

## Consequences

The first calibration ran `comment-discipline`'s four cases, twice each by
three repeats, on `opencode-go/muse-spark-1.3-contributor` at high thinking.
All 24 runs were judged. The injected arm passed 12 of 12 and the withheld arm
3 of 12, a difference of 75 points at a Fisher p of 0.0003. All three withheld
passes came from one case, whose task invites a ticket pointer that this model
did not write without the Rule either. For this model and these tasks, the
prose changes what gets written. That is a different question from the one
the backtest answered, and it does not contradict it.

The suite workflow sets up node 24.19.0 beside bun, because the sweep's test
runs the pi CLI, which needs node 22.19 or later. The test runs no model and
spends nothing.

A Rule's cases are a file under `evals/cases/`. A new judge lands with a test
that watches it fail and pass. Results live under `reports/`, which git
ignores.
