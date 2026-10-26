# 32. The web tools are off until a session asks for them

Date: 2026-09-19

## Status

Accepted.

## Context

`harness/pi/settings.json` loads `npm:pi-web-access@0.29.0`, which registers
four tools: `web_search`, `fetch_content`, `source_check` and
`get_search_content`. A request body captured through a local proxy on
`pi -p "say hi"` in an empty directory carries 17,170 characters of tool
definitions, and those four are 11,198 of them. Every request pays that, and
most sessions never search. pi 0.85.1 ships no web tool of its own: its
built-ins are `read`, `bash`, `powershell`, `edit`, `write`, `grep`, `find` and
`ls`.

Three kinds of session need three different things. The captain's own pi
session has to be able to search. A worker sent to investigate has to get the
tools by one switch, without editing settings. Every other worker should carry
none of it.

## Decision

A pi extension, `harness/pi/extensions/web-tools.ts`, handles `session_start`
and drops every tool whose `sourceInfo.path` runs through the `pi-web-access`
directory from the active set, unless the process was started with
`PI_WEB_TOOLS=1`. It registers `/web on` and `/web off` to flip the
same set for the current session.

Matching on the package path rather than on the four names means a renamed
tool (pi-web-access lets `toolNames` rename them) is still caught, and a fifth
tool the package adds later is caught too.

The extension is the only thing that changes which web tools are active.
`harness/pi/web-search.json` sets `toolActivation` to `"eager"`, because any
other value makes pi-web-access register `web_enable` and its own
`before_agent_start` and `session_tree` handlers, which put the tools back
after `session_start` or `/web off` removed them.

The same proxy capture with the extension loaded shows 5,972 characters of tool
definitions by default and the full 17,170 with the switch set. The package,
its provider configuration in `harness/pi/web-search.json` and its search
cache are untouched.

## Alternatives

A local extension registering one compact search-and-fetch tool under 800
characters, with the package's four hidden, was the other shape. Rejected
because the compact tool would have to reach into pi-web-access's source for
the provider dispatch, which is spread through a 3,500-line `index.ts`
across twenty-odd providers, and would then break on every package upgrade. It
would also hand the investigating worker a weaker instrument than the captain
has, when the point of the switch is to give that worker the same one.

Disabling the tools in `web-search.json` through pi-web-access's own
`tools.<name>.enabled` flags was the third. Rejected because it is a file edit
rather than a per-session switch: turning them back on for one worker means
editing a file every session on the machine reads.

Dropping the package was ruled out by the first fact above: there is nothing
in pi to fall back on.
