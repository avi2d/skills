# 103. Tool output is scrubbed at the harness with the checks kit's gitleaks rules

Date: 2026-11-07

## Status

Accepted.

## Context

Agents printed credentials into tool output, by reading a key file or catting an env file, and pi and Claude Code keep every tool result in the session transcript as it was.
A written rule against reading credential files did not hold, and a transcript that holds a credential holds it for good.
The checks kit already decides what a credential looks like, in the gitleaks rules its `checks-secrets` runs on every commit.

## Decision

The pi and Claude Code Dispatchers scan every tool result with the kit's gitleaks rules and replace each match with `[redacted: <rule>]` before the model or the transcript holds it.
pi scans at `tool_result`, and rewrites the content, the details and the structured content of the result.
Claude Code scans at `PostToolUse` with the matcher `*`, and replies with `updatedToolOutput`.

The rules are the kit's own `gitleaks.toml`, copied into each bundle by `bun run generate`, and the binary is the version the kit pins, read from the kit's cache.
A second pattern list in this repository would drift from the one every commit is checked against.

The scan fails closed: a missing scanner, a failing one, or one that runs past 15 seconds withholds the whole result.
An unscanned result may hold the credential the scan exists to stop.

A result with nothing to redact gets no reply in Claude Code.
Claude Code runs its `PostToolUse` hooks in parallel on the original output, so an identity rewrite from this hook could undo a redaction made by another.

Agent conduct stays a written rule beside the program: `inspect-credentials-by-key` asks a session to look at a credential by its key names, such as `jq 'keys'` or `gh auth status`.

## Consequences

Claude Code's `PostToolUseFailure` can only add context, so the output of a failed call, such as a Bash command that exits non-zero, reaches the model and the transcript unscanned.
Wrapping every Bash command so it exits zero would close that gap, but Claude Code checks permissions on the rewritten command, so an allowlist entry such as `Bash(git status:*)` would stop matching.

Codex output is not scanned.

Every tool call in pi and Claude Code now waits for a gitleaks run, which takes tens of milliseconds on this machine.

Transcripts written before this change are not swept.
