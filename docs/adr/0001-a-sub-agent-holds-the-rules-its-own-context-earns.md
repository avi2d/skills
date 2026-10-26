# 1. A sub-agent holds the Rules its own context earns

Date: 2026-08-27

## Status

Accepted.

## Context

pi runs an in-process sub-agent as a second `AgentSession` in the same process.
That session builds its own `ExtensionRunner`, so the Dispatcher is loaded again
and gets its own state - but nobody calls `bindExtensions` on it, and
`session_start` is emitted from there and nowhere else.

### The finding

Measured, not inferred. A probe extension was dropped into
`~/.pi/agent/extensions`, three sub-agents were spawned through pi-subagentura,
and this is every event that reached them:

```
pid=99854 loaded extension instance
pid=99854 before_agent_start cwd=~/Projects/skills             sessionFile=undefined
pid=99854 agent_settled       cwd=~/Projects/skills             sessionFile=undefined
pid=99854 loaded extension instance
pid=99854 before_agent_start cwd=/tmp                          sessionFile=undefined
pid=99854 loaded extension instance
pid=99854 before_agent_start cwd=~/Projects/skills             sessionFile=undefined
pid=99854 agent_settled       cwd=/tmp                          sessionFile=undefined
pid=99854 agent_settled       cwd=~/Projects/skills             sessionFile=undefined
```

Four facts, and the whole decision rests on them:

- **`session_start` never fires.** Not with any reason, not late, not once. It
  is emitted by `AgentSession.bindExtensions`, which the sub-agent path does not
  call.
- **`session_shutdown` never fires either**, so a sub-agent has no last moment.
- **`cwd` is the sub-agent's own**, not the parent's. The middle sub-agent was
  spawned into `/tmp` and its events say `/tmp`.
- **`getSessionFile()` is `undefined`**, because the sub-agent session is built
  on `SessionManager.inMemory()`.

The two review branches in session `01a0445c` are this, in the dispatch log:
three `inject` lines each, no `queue` line either time, and `ephemeral` in the
session column for both.

### The consequence

`repo-contains` was asked at `session-start` and nowhere else, so a sub-agent
was never asked it at all. `always` is asked at the prompt, which every Context
reaches. So a sub-agent held exactly the `always` Rules and nothing else: the
Standards branch of a code review, whose whole job is judging a change against
this repo's standards, held neither `software-design` nor
`typescript-best-practices`, while the session that spawned it held both.

That was not a choice anyone made. It is where the code happened to land.

## Decision

**A sub-agent holds the Rules its own context earns.** The predicates are
evaluated afresh, against the sub-agent's own `cwd`, and it holds what a
top-level session standing in the same place would hold.

Mechanically: `repo-contains` moves off `session-start` and onto the prompt. The
prompt carries the repository the turn is running in, and the core asks the
predicate there. The prompt is the one moment every Context has - a top-level
session, a resumed session and an in-process sub-agent alike - so a predicate
asked there is a predicate no Context can be skipped for.

`session-start` keeps what only it can say: the slate is clean, and a run found
in progress was interrupted.

### Why not inherit the parent's Rules

Because the parent may be standing somewhere else. The probe's middle sub-agent
ran in `/tmp`, and a `repo-contains` Rule inherited from a parent in a
TypeScript repository would have been in force over a directory holding no
TypeScript - a Rule firing on a predicate that is false where it landed. A Rule
is a scope condition, and inheritance would make it a scope condition about
somewhere else.

There is also nothing to inherit through. The parent and the sub-agent are two
extension instances with two closures, and the only channels between them are
module-level globals and the filesystem. Both would be a second account of what
is in force, kept in step by hand.

### Why not leave it at `always`

Because that is the defect. A Rule declares the scope it applies to, and a
Context that does the repository's work while holding none of the repository's
Rules is enforcement that stopped without saying so.

## Consequences

- A sub-agent reviewing this repo holds `typescript-best-practices` and
  `software-design`, which is what motivated the ticket.
- A sub-agent spawned outside a repository holds the `always` Rules and a
  `broken dispatcher` line saying `repo-contains` could not be asked, rather
  than silence that looks like a non-match.
- `repo-contains` is now asked from the repository the turn is standing in, so a
  session that changes directory gets the Rules of where it now is. The
  Dispatcher memoises the file list per `cwd`, so `git ls-files` runs once per
  directory a session visits and not once a turn. The memo is never invalidated
  within a directory, so a file appearing mid-session still does not fire a Rule
  - `repo-contains` asks what the repository is, and `file-matches` is the
  predicate for what just changed in it.
- A session that ends before its first prompt no longer reports `repo-contains`
  Rules as `dropped`. Nothing was due, because nothing had asked yet, and no
  model turn ran for a Rule to be missing from.
- `inject` says why, because the `queue` line that used to carry the reason is
  gone from this path. `queue` keeps its meaning: due, with no turn to put it in.
- Every Context the Dispatcher loads into gets a unique name in the dispatch
  log. pi gives a sub-agent no session file, so the Dispatcher mints one, and
  two concurrent branches can be told apart from each other and from a probe run.
  A minted name is new every time, so a Context that has one cannot be resumed
  under it, and a Workflow run started in one is orphaned rather than picked back
  up. Tracked in #20.
- A non-git directory no longer suppresses the `session-start` event, so a run
  interrupted outside a repository is now resumed rather than dropped.

Measured again with the change in place, running the generated Dispatcher under
the same three spawns - two concurrent sub-agents in this repo, one in `/tmp`:

```
unnamed-fa8e6bb5 this context reached a prompt with no session start, so pi is running it as an in-process sub-agent
unnamed-fa8e6bb5 inject software-design: repo-contains matched flake.nix
unnamed-fa8e6bb5 inject typescript-best-practices: repo-contains matched generated/pi/extension/dispatch.ts
unnamed-ba28d232 this context reached a prompt with no session start, so pi is running it as an in-process sub-agent
unnamed-ba28d232 inject software-design: repo-contains matched flake.nix
unnamed-ba28d232 inject typescript-best-practices: repo-contains matched generated/pi/extension/dispatch.ts
unnamed-5ddf5c91 broken dispatcher: /tmp is not a git repository, so repo-contains was not asked
unnamed-5ddf5c91 inject unslop: always
```
