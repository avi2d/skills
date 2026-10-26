# 77. The verdict gate diffs against the settle baseline commit

Date: 2026-09-28

## Status

Accepted.
Amends 0076: the files on `SKILLS_CHANGED_FILES` are the settle baseline commit's tree against the current one, united with the working tree's own changes, instead of the working tree's changes alone.

## Context

0076 hands each check the files the working tree changed, which judges a settle that leaves the tree dirty.
The settle that overran in Firstmate landed as a fast-forward merge with a clean tree: staged, unstaged and untracked names are all empty, so the lint fell back to its full set and the gate stood down.
The files a fast-forward landed are the baseline commit's tree against the current one, and the gate's baseline carried only the tree's fingerprint, which names no commit.

## What was considered and rejected

- **Appending the landed paths to the lint command with no opt-in.** A command that takes no paths breaks, so every repository's behavior would change unless paired with an opt-out declaration, which changes what a repository must declare.
- **Reading the opt-in from the repository's declaration alone.** The gate reads the command string from the default branch, which the Firstmate home does not control, so the design cannot depend on a newly declared key taking effect there.
The opt-in stays a plain use of the variable inside the command the branch already declares.

## Decision

The settle's baseline Tree carries the commit the tree was fingerprinted at as an optional head, recorded at the prompt and decoded beside the tree, and the verify action carries it as the base.
`verify` lists the union of that commit's tree against the current one with the working tree's own changes, leaving out any path that is no longer a file or symlink in the working tree, and runs every check with them on `SKILLS_CHANGED_FILES`.
A command that ignores the variable runs exactly as before, and a baseline from before the variable existed verifies on the working tree's changes alone.

## Consequences

- A fast-forward landing with a clean tree hands the lint the landed files, inside the unchanged budget.
- The run state and both prompt paths widen by one optional commit each, and sessions stored before it decode unchanged.
