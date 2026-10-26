# 76. The verdict gate hands each check the files the settle changed

Date: 2026-09-28

## Status

Accepted.
Amended by 0077: the files on `SKILLS_CHANGED_FILES` also take in what landed since the settle's baseline commit, so a fast-forward landing with a clean tree is listed too.

## Context

The verdict gate runs a repository's declared lint and test when an agent's turn ends with a changed tree, inside `VERIFY_BUDGET_SECONDS` of 120 in `src/dispatcher/gate.ts`, and stands down for the rest of the session when a check overruns.
A repository whose declared lint always walks the whole tree outruns the budget on every settle, so the gate never judges anything there.
Firstmate's `bin/fm-lint.sh` lints explicit paths in under a second but walks its full canonical shell set with full dataflow otherwise, which takes over thirteen minutes on main.
The gate needs a way to hand a lint command only the files the settle changed, without naming that repository, its paths or its harness in the Dispatcher, and without raising the budget.

## What was considered and rejected

- **Appending the changed paths to every check command.** A command that takes no paths, such as this repository's `bun run lint && bun run typecheck`, would break, so every repository's behavior would change.
- **A new declaration saying a command takes paths.** Every repository would have to learn a new key before it could use it, and the gate would still need a syntax for where the paths go.
- **A placeholder token in the command that the gate expands.** The gate would need quoting rules for paths with spaces, and a shell splits a variable on newlines alone once the declaration sets `IFS`.

## Decision

`verify` in `src/dispatcher/gate.ts` lists the settle's changed files once per settle, from the staged, unstaged and untracked names git reports, leaving out deletions, which have nothing left to check, and runs every check with them on `SKILLS_CHANGED_FILES`, one repo-root-relative path per line.
A command that ignores the variable runs exactly as before.
A listing past 64 KiB leaves the variable unset, because an environment that large can pass the exec limit and stop every check from starting, including checks that never read it.
A repository whose lint takes paths opts in inside its own declaration, as `set -f; IFS=$(printf '\n_'); IFS=${IFS%_}; bin/fm-lint.sh $SKILLS_CHANGED_FILES`, which splits the paths on newlines alone and does not glob them, with no change any other repository must make.

## Consequences

- A settle that changes one script is judged in about a second where the full lint took thirteen minutes, inside the unchanged budget.
- A lint failure on a changed file holds the session with the failure's own output, as before.
- A path holding a newline splits into two arguments, so a command that needs such paths reads git itself.
- A settle past the 64 KiB listing, such as a large untracked directory or a pull of many commits, hands an opted-in lint no paths, so it walks its full set and may overrun.
