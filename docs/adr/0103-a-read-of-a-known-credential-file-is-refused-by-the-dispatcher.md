# 103. A read of a known credential file is refused by the Dispatcher

Date: 2026-11-07

## Status

Accepted.

## Context

What a tool prints is kept in the session transcript as it stands, so a credential file an agent reads or `cat`s is a credential written into a transcript.
A handful of files on these machines hold nothing but credentials: `~/.npmrc`, pi's and Codex's `auth.json`, the GitHub CLI's `hosts.yml`, Claude Code's `.credentials.json`, and WireGuard and AmneziaWG configs.
Whether a tool call reads one of them is a question a program can answer, which [record 0024](0024-a-constraint-a-program-can-decide-is-written-as-a-program.md) says a program does.
All three harnesses let a hook refuse a call before it runs: pi through the `tool_call` event, and Claude Code and Codex through a `deny` in a PreToolUse reply.

## Decision

`src/dispatcher/credential-reads.ts` decides whether a call reads a known credential file, and every Dispatcher bundles it and refuses that call before anything else it does at the call.
A path tool, such as `read`, `edit` or `grep`, is refused on the file location, whether or not the file exists, since the tool reports what it finds.
`~/.npmrc` and `.credentials.json` match in any directory, since a project `.npmrc` holds a token and the dot name has no project use.
`~/.pi/agent/auth.json`, `~/.codex/auth.json` and `~/.config/gh/hosts.yml` match at the default location and at the location the owning directory variable names, so a set variable adds a location and never replaces one.
The owning variables are `PI_CODING_AGENT_DIR`, `CODEX_HOME` and `GH_CONFIG_DIR`.
A file below a `wireguard` or `amneziawg` directory that sits below an `etc` directory is refused on its directory name, since only root can stat it.
Under any other directory named `wireguard` or `amneziawg`, only `privatekey` and `*.key` match on the file name.
Any other `.conf` is refused when it holds an `[Interface]` with a `PrivateKey`.
A shell command is refused when a word in it, a redirect target or a piece of a quoted script names a credential file that exists, relative to the working directory or a directory the command reaches with `cd` or `pushd`, with `~`, `$HOME` and symlinks resolved and every glob expanded.
A word that holds a slash after `~` and `$HOME` expansion and names a tunnel file in this way is refused without a stat, while a bare word resolved against the working directory or a `cd` target still needs a stat.
Each `cd` and `pushd` target resolves against the directory the previous one left, and a bare `cd` resolves to the home directory.
A command that prints no value of the file passes, such as `jq keys` and `yq keys`, and a command that reads only metadata, such as `ls`, `stat` or `test`, unless a substitution runs inside it.
The refusal tells the model to read a credential file with its key names only, or to ask the tool that owns it, and the dispatch log records the path, never the file text.
The `credential-files` Rule says the same in every session, for every file that carries a secret and that the program does not name.
The check guards ordinary agent commands, not a shell parser, so a path built at run time, a recursive grep over a directory and a script that opens the file itself run as they would without the hook.

## Consequences

The listed files no longer reach a transcript through an ordinary read, and a test pins each shape refused and each let through.
Redacting a value that reaches a tool output some other way, and sweeping transcripts already written, are separate work.
A project file named `auth.json` or `hosts.yml` passes, and is read outside the session.
A project `.npmrc` is refused, since it holds a token.
Commands such as `git add`, `git rm` and `echo` that name a project `.npmrc` are refused too, and the captain runs those.
A recursive glob is expanded in full before the command runs, so its check costs time in proportion to the tree it walks.
