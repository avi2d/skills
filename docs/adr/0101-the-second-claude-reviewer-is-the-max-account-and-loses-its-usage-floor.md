# 101. The second Claude reviewer is the Max account and loses its usage floor

Date: 2026-10-20

## Status

Accepted. Amends 0083 and 0100: the clauth account `second` is the captain's $100 Max plan, and its entry no longer stops at 30 percent of its allowance; the Codex floor stays at 30.

## Context

0083 spends each $20 review account down to 30% of its allowance, and 0100 kept the Pro floor at 30.
The second Claude account is now the captain's own $100 Max plan, and the captain asked for its 30% floor to go while the Codex floor stays.

The floor on that entry also checked for the Claude Code login in its config dir before it read clauth.
The no-mistakes fork moves to the next entry only after a usage-limit error, so an entry with no login fails the review round instead of falling through to Opus on `main`.

## Decision

The second entry keeps a floor whose command is the login check alone: a non-empty `.credentials.json` on Windows and the folder's Keychain item on the Mac.
After the check it prints `{"remaining_percent":100}`, its minimum is 0, and it reads nothing from clauth.
The Sol entry keeps its floor of 30 on the Codex five-hour window.

## Consequences

The review step runs the second entry whenever Sol is skipped and the folder holds a Claude Code login, whatever its usage.
It still skips the entry while the folder holds no Claude Code login, and the Mac still skips it when the daemon cannot read the login Keychain.
No floor reads clauth, so the entry no longer depends on clauth listing an account named `second` or a usage reading for it.
