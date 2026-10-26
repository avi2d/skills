# 48. A session that changed the tree settles past the checks its push gate runs

Date: 2026-09-24

## Status

Accepted. Records the design of `src/gate.ts`, the `verify` action and
`verdict` event in `src/dispatch.ts`, and the part of each Dispatcher that runs
one at the end of a turn. Extends 0019 and 0022, which used the Stop hook to
nag a Workflow run forward, to a second thing a turn can be refused for.
0066 deletes the Workflow run, so no settle is left to a run and every settle
is the gate's, and it moves the gate's judgment from `src/dispatch.ts` to
`src/verdict.ts`.

## Context

`prove-it-works` says to check the real thing before saying the work is done,
and `fix-what-you-see` says to fix a failing test or a lint failure when you see
one. Both are prose, so whether a session did either is something only a
reader of its transcript can say. For a repository that declares its checks,
part of the question can be answered by a program: at the moment a session
says it is finished, run the checks and see.

Such a repository already declares its checks. no-mistakes runs `commands.test` and
`commands.lint` from `.no-mistakes.yaml` before anything is pushed, so a
session that ends with them failing has handed the push gate a failure it will
find later, at the most expensive point to find it.

Two costs come with it:

- **Time.** The suite here is 616 tests and takes 31 seconds; lint and
  typecheck add 3. A gate that ran them at every settle would add half a
  minute to every question answered in this repository.
- **A trap.** A gate that refuses to let a session settle while a check fails
  holds a session forever if the check cannot be made to pass in it: a flaky
  test, a failure that needs the network, one the human has said to leave.

Both had to be bounded in the first version, before any session was trapped.

## Decision

**Only the primary working tree of a repository the user set up for no-mistakes
is gated.** That is a session whose directory is in the main working tree, where
`git rev-parse --git-dir` and `--git-common-dir` name the same directory, of a
repository with a git remote named `no-mistakes`. `no-mistakes init` adds that
remote and a clone cannot carry it. Everywhere else the gate is silent.

The remote is the trust boundary. The gate runs a repository's commands in the
hook process, where no permission prompt stands in front of them, so a
third-party clone that ships a `.no-mistakes.yaml` must not get them run because
someone asked for a typo fix. Before the gate, those commands ran only in a
pipeline the user had started.

The primary tree is where the checks mean what the push gate means. It is the
checkout the user works in and has installed, so a check that fails there is a
failure the push gate would report. Every linked worktree is skipped, with or
without the remote: a no-mistakes pipeline worktree, a treehouse worker copy,
and a `git worktree add` checkout. Each starts from tracked files only, and the
push gate runs `commands.prepare` before its checks. In such a checkout a check
fails because nothing was installed, before it checks anything. `bun run test`
without `node_modules` finds `bun` and not `effect`, and exits 1 like any real
failure, so no exit status tells the two apart. A pipeline worktree's checks are
also its pipeline's next steps.

**The checks are the push gate's, read the way the push gate reads them.** The
gate runs `commands.test` then `commands.lint`, stopping at the first to fail.
It reads them from the `.no-mistakes.yaml` on `origin/HEAD`, and reads the
working tree's copy only when that one sets `allow_repo_commands: true`, which
is no-mistakes' own rule. So the two gates cannot disagree, and a session cannot
make its own gate pass by editing the file it reads. A repository with no test or lint
command has no gate. A file the reader cannot decode is a `broken dispatcher`
line in the log, not a guess.

**`commands.prepare` is never run.** Here prepare is `bun install` and
`bun run generate`, and in the primary tree that rebuilds the bundles the
machine's harness config is linked to. So the gate trusts the primary tree to be
prepared already. One case is left: a tool the checks run that is missing even
there. A command whose shell exits 127 has had a command it runs not found. That
is inconclusive for that settle: nothing is held, the human is told, and the
next settle runs the checks again.

The reader is a subset of YAML written for this: a block mapping of plain,
quoted or block scalars. A Dispatcher bundle carries no dependencies
(docs/adr/0028), and `Bun.YAML` is not there when pi loads the bundle.

**The core decides and the adapters run.** A settle carries what the adapter
saw: the repository root, a fingerprint of the tree, and the checks. The core
answers `verify`, or nothing. The adapter runs the checks and hands back a
`verdict`, and the core answers `passed`, `hold` or `release`. The words a hold
puts in front of the model, and those a release shows the human, are the core's,
so all three harnesses say the same thing.

**Each harness holds where it can hold a turn open.** Claude Code and Codex
block the Stop hook, with the hold as the reason, which is what a nagged
Workflow already does there. pi holds at `agent_before_settle`, returning the
hold as a displayed custom message and `continue: true`, so the same run goes
on. This is not the follow-up after `agent_settled` that pi's Workflows use, for
three reasons:

- The checks run before the session settles, so it is still visibly working
  while they run. Nothing can be typed into the gap between them.
- A follow-up comes back through `before_agent_start` as a prompt, and a prompt
  is what resets the hold count.
- Esc during the boundary still ends it: pi does not continue a run that was
  aborted while its boundary handlers ran. It does not cut the checks short,
  because pi hands `agent_before_settle` no abort signal: `ctx.signal` belongs
  to the low-level run, which has already ended there. So the checks run to
  their verdict or the budget, the verdict is recorded as usual, and the run
  ends without the continuation a hold asked for. The next prompt resets the
  count as it always does.

**What it costs is bounded by what changed.** The tree is the repository root,
`HEAD`, the staged and unstaged diffs, and each untracked file's size and
modification time.
Ignored files are left out, so installing dependencies or building costs no
check. The gate runs the checks only at a settle whose tree differs both from
the tree when the human last spoke and from the last tree it judged. The tree
the checks leave behind counts as the one they judged, so checks that write
files do not make every later settle look changed. A settle on a tree that
already failed is held again from the recorded verdict, without running
anything. The tree when the human spoke is recorded with its root. A settle in
a root the prompt did not see, because the session moved into it or the
Dispatcher arrived mid-session, records that root's tree and runs nothing, so a
turn is checked only when it provably changed the tree it settles in.

All the checks share one 120-second budget. A check still running when the
budget ends is killed along with every process still under it, while a job
whose parent already exited is out of reach. That releases the
session and stands the gate down for the rest of it, the next prompt included.
Otherwise a repository whose checks never fit would pay the full two minutes at
every settle. Only the budget does that. A check that could not start or found
a command missing is inconclusive: it releases that settle alone, and the gate
is on again at the next. The Stop hooks in both Contracts allow 150 seconds, and
a test holds that above the budget.

**A session is held at most twice a prompt.** The third failing settle is
released. The model is told how many holds it has had and that it may say why a
failure cannot be fixed. The release goes to the human as a `systemMessage` on
Claude Code and Codex, and as a notification and a displayed entry on pi. The
count resets only when the human speaks. Codex sends a blocked stop's reason
back as the next prompt, so a prompt carrying the last hold's first line does
not count as the human speaking.

The gate also stays out of three settles:

- a turn that ended in an error, which never said it was done;
- a settle a Workflow run owns, which is the run's to advance;
- one in a pi in-process sub-agent, which is not a session boundary. Claude
  Code and Codex report a sub-agent's end on `SubagentStop`, which neither
  Contract registers.

## What was considered and rejected

- **The report's pi follow-up.** See above: a follow-up leaves a gap for the
  human's typing and resets the count it is bounded by.
- **Reading the working tree's file always.** The session under the gate
  could weaken it, and for any repository without `allow_repo_commands` the
  session gate and the push gate would run different commands.
- **Holding until the checks pass.** It traps exactly the sessions that most
  need a human.
- **Counting holds across the session.** One bad turn would switch the gate
  off for everything after it.
- **Running the checks at every settle.** Half a minute for every question
  answered here.

## Consequences

- A turn here that changes the tree costs about 35 seconds more at its end,
  once for each distinct tree it stops on, and at most three times per prompt.
- The prose of `prove-it-works` and `fix-what-you-see` stays. The gate
  covers only repositories that declare checks, and only what those checks
  measure; the Rules still carry every other repository, and everything the
  checks cannot see.
- `harness/codex/hooks.json` changed, and Codex trusts a hook by hash, so the
  new Stop timeout needs one pass through `/hooks` before it applies.
- A session in a linked worktree is not gated, and neither is a no-mistakes
  pipeline agent. The rules' prose is all that carries them, and the push gate
  catches what they leave failing.
- What a Workflow run changes is not gated. Its settles are the run's, and the
  next prompt takes the tree as it finds it.
- pi keeps the gate's state in memory, so a reload forgets the last verdict.
  That costs at most one extra run of the checks.
