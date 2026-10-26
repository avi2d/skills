# 83. The review step spends the twenty-dollar accounts first, each behind a floor

Date: 2026-10-04

## Status

Accepted. Amended by 0095, 0100 and 0101: the Codex floor reads the five-hour window with a minimum of 30, so Sol stops at 30 percent of it; the account `second` is now the $100 Max plan and its floor checks only for its login.

## Context

The captain asked for the no-mistakes reviewer to run on subscriptions in a fixed order on both machines.
GPT-6.1 Sol on the Codex $20 account comes first, then Opus 5.5 on the clauth account `second`, which is the Claude $20 Pro account.
Opus 5.5 on the clauth account `main`, the Claude $200 Max account, comes last.
Each $20 account is spent down to 30% of its allowance and no further.

The captain's no-mistakes fork, release v1.87.0+avi2d.13, reads an ordered `reviewer_chain` from the global config.
Each entry names an agent, a model and an effort, and it can carry an `env` map and a `floor`.
Before the review step runs an entry that has a floor, it runs the floor's `command` through `sh -c` and parses the output as JSON.
It reads the number at the dotted `field` path and skips the entry when that number is below `minimum`.
It also skips the entry when the command exits non-zero, prints anything but one JSON value, or has no number at that path.
It always tries the last entry, and it moves to the next entry after a usage-limit error.
Any other agent error fails the review round.
The fork passes the `env` values to the agent process as they are written, and it runs the floor command without them.
It refuses a config that sets `reviewer_chain` together with `review_agents.reviewer`.

The fork walks a `field` path through JSON objects only.
`quota-axi --json` lists the providers in an array.
`clauth status --json` lists the accounts in an array, and gives each account's use rather than what is left, per window labelled `5h`, `7d` or `7d <model>`.

On Linux, clauth keeps an account under `~/.clauth/profiles/<name>/`, with its OAuth tokens in `credentials.json`.
It builds a `CLAUDE_CONFIG_DIR` only for a `clauth start` session, as `runtime-<sid>/` under that folder, and removes it when the session ends.
Claude Code reads its login from `.credentials.json` in its config dir.
On the Mac it keeps that login in the Keychain instead, under the service `Claude Code-credentials-` followed by the first 8 hex digits of the SHA-256 of the config dir.
A clauth account and a Claude Code login in the config dir are two sign-ins, and either can exist without the other.

## What was considered and rejected

- **A `field` path straight into `quota-axi` or `clauth` output.** No path reaches an element of an array.
- **A login folder written as `~/.claude-accounts/second`.** The agent would get the tilde as a literal directory name.
- **`~/.clauth/profiles/second` as the Windows login folder.** Claude Code finds no `.credentials.json` there, and it would write its own state into the tree clauth manages.
- **A `runtime-<sid>/` folder as the Windows login folder.** It exists only while one `clauth start` session runs.
- **A floor on the Max entry.** The fork tries the last entry whatever its floor reads.
- **A floor that reads clauth alone.** With a clauth account and no login in the folder, the floor passes, the agent fails to authenticate, and an authentication error fails the round instead of moving to the next entry.

## Decision

Each machine's `reviewer_chain` holds three entries, in the captain's order, all on pi at high effort.

1. GPT-6.1 Sol, under the name each machine's pi gives it, with a floor that pipes `quota-axi --provider codex --json` through `jq`.
   The floor reads the Codex `all_models` effective percentage that quota-axi reports as left.
1. Opus 5.5 through claude-bridge, with `CLAUDE_CONFIG_DIR` set to `.claude-accounts/second` under the machine's home, written as an absolute path.
   Its floor first checks for the Claude Code login in that folder, a non-empty `.credentials.json` on Windows and the folder's Keychain item on the Mac, and fails without one.
   It then pipes `clauth status --json` through `jq` and reads 100 minus the highest use among the `5h`, `7d` and `7d opus` windows of the account `second`.
1. Opus 5.5 through claude-bridge with no `env` and no floor, so it runs on the global login, which holds `main`.

Both floors emit `{"remaining_percent": N}` and set `minimum` to 30.
The schema in `src/generate/no-mistakes-config.ts` holds the chain as a three-element tuple.
It refuses entries out of that order, a $20 entry without a floor, a login folder that is not an absolute path, and a `review_agents` key beside the chain.

## Consequences

The daemon on each machine needs `jq`, `quota-axi` and `clauth` on its `PATH`.
When one of them is missing, the floor command fails and the review step skips that entry.

The floor skips the Pro entry while `~/.claude-accounts/second` holds no Claude Code login, while clauth lists no account named `second`, and while that account has no usage reading for the three windows.
The Windows machine has no clauth account yet, so its reviews run on Sol and then on Max until both sign-ins exist there, in either order.
The Mac floor runs `security`, so a daemon that cannot read the login Keychain skips the Pro entry.

A window that does not bind Opus, such as `7d fable`, leaves the Pro floor alone.
