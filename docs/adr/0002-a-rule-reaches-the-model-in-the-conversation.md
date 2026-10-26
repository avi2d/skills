# 2. A Rule reaches the model in the conversation

Date: 2026-08-27

## Status

Accepted. Supersedes nothing, but changes how every Rule travels.
docs/adr/0053 has since held the check below to a Rule's whole text rather
than its first 200 letters and digits, because a preview keeps exactly those.

## Context

The Dispatcher put Rules in the system prompt. It returned them from
`before_agent_start` and pi accepted the string. `inForce` held the names and
the dispatch log said `inject`. On the `claude-bridge` provider, not one byte of
any of it reached the model.

### The finding

The four-line repro from #18, run in this repo and reproduced before anything
was changed:

```ts
export default function (pi: any) {
  pi.on("before_agent_start", (event: any) => ({
    systemPrompt: `${event.systemPrompt}\n\nThe magic word is QUXBLIM9182.`,
  }));
}
```

`pi -p -e probe.ts "What is the magic word in your system prompt?"` answers
`NOTFOUND`. The same sentinel through `--append-system-prompt` comes back as
`QUXBLIM9182`. So the model will quote its own prompt, and the extension return
path is where the sentinel dies.

`pi-claude-bridge` does not forward pi's assembled system prompt. It sends
Claude Code's preset plus an append it rebuilds from `customPrompt`,
`appendSystemPrompt`, `contextFiles` and `skills`. Rule text is in none of those
four fields, so it is dropped on the way past. The bridge has a guard for an
extension that rewrites the system prompt, and the guard does not fire, because
the bridge's own handler runs second and records the already-rewritten string as
an exact key.

Five Rules were affected: `guard-the-context-window`, `prove-it-works`,
`software-design`, `typescript-best-practices` and `unslop`. On this provider
they had never applied to anything.

### What the failure actually was

Not the bridge. The bridge is one provider behaving one way, and there will be
others. The failure is that the Dispatcher wrote a Rule into a field the
provider is free to rebuild, and then had no way of knowing whether it had.

Every account the Dispatcher kept of itself agreed that the Rule was in force.
The log said so, the state said so, and the string handed back really did
contain the Rule. All three were true and the model still had nothing.

That is the property that matters. A provider is free to discard the system
prompt, and nothing inside the harness can tell whether it did. A Rule that
arrived and a Rule that was thrown away look the same from here.

## Decision

**A Rule reaches the model as a message in the conversation, at `context`, on
every call the model is asked to make.**

`context` is pi's own last look at what it is about to send. It is downstream of
everything that assembled the conversation and upstream of whatever a provider
does with a system prompt. The conversation is not a field a provider rebuilds
from structured parts, because the conversation is the request.

Six probe runs back this, all against `claude-bridge`, where the defect was
found.

#22 first sent a custom message from `context` carrying a sentinel, and it came
back from the model. That is the seam working on this provider, before anything
is asked about the real Rules.

#22 then ran its own acceptance probe with the shipped Dispatcher. Asked for the
sentence under the `Guard the context window` heading, the model answers
`Compute and time can be spent again.` on `claude-haiku-4-5`,
`claude-sonnet-4-6`, `claude-opus-4-7` and `claude-opus-5`, with tools off so
the sentence cannot be read off disk. The dispatch log records five `inject`
lines and no `broken` line for each of those four runs. The same session also
ran the probe with the Dispatcher's extension left out, as a negative control:
it still answers `NOTFOUND` on `claude-bridge`, so what the model quotes with
the Dispatcher on is the injected Rule and not something it already knew.

The sixth run is #18's, on code no longer in the tree. Before this change, the
same question answered `NOTFOUND`. That measurement predates this ADR and is
not a second run of #22's probe.

Whether `--provider claude-bridge` falls back silently to another provider was
never observed. It is an inference from an Anthropic quota error that surfaced
on a run meant to test `claude-bridge`, recorded here as the inference it is
rather than as an observed fact.

Three properties of `context` decided it over the alternatives:

- **It fires for every provider.** `before_provider_request` is the seam that
  would show the payload on the wire, and it never fires under `claude-bridge`
  at all. A check there would be a check that never runs on the provider the
  defect was found on.
- **What it returns is not written to the session.** pi takes the returned
  messages for that one call. So the Rules are rebuilt from `inForce` each time
  rather than accumulated: a turn that calls the model six times carries one
  copy of each, and so does a session resumed a week later.
- **The message can go at the front.** The bytes before the conversation are the
  same bytes on every call, so a provider's cache keeps its prefix. Appending
  instead would move the Rules down the conversation every turn and invalidate
  everything after them.

`inject` and `deliver` stay two Actions in the core, because they are two
different moments: one is a Rule that fell due at a prompt and one is a Rule
that fell due inside a running turn. They stop being two mechanisms in the
adapter. `context` runs before every model call, so a Rule that fell due
halfway through a turn is in front of the model for the rest of that turn
without a `steer` message arranged to put it there.

### The Dispatcher checks its own hand-off

The core builds the text. `carriage` takes the index and the names in force and
returns the whole of each Body in declared order, so what the model reads is
assembled where declared order is already defined. A harness decides where those
bytes go and nothing else.

A new event, `requested`, hands that text back to the core. `injected` is held
against it, and a Rule with no trace of it reads as `broken`, naming the Rule.

The check reads the bytes the Dispatcher is contributing and not the whole
request. Reading the whole request would let anything else in the conversation
stand in for the Rule arriving, and #18 records a session running
`cat rules/writing-for-agents/SKILL.md` mid-turn. A tool result holding a Body
is not that Body being enforced, and a check that accepted one for the other
would go quiet exactly when a Rule went missing.

Each Rule is asked about once. It went in at a known moment, so the request
after that moment either carries it or does not, and asking again every call
would buy the same answer at the price of a pass over the whole conversation. A
Rule reported here stays injected and is not sent a second time. The Dispatcher
is saying what happened, and a carrier that dropped a Rule once will drop it
again.

Be exact about what this catches. It compares what the core believes is in force
against the bytes the adapter is handing over, so it fires when those two
accounts disagree. It cannot see past pi into a provider, and it would not have
caught #18, where the bytes handed over were correct and the loss was
downstream. What makes #18 unable to recur is the carrier, not the check. The
check is there because the next such failure will also be silent, and this
repository has now been bitten twice by enforcement that stopped without saying
so.

The same seam carries and checks, so a harness that never reaches that seam
reports nothing and reads like a harness with nothing wrong. That is #18's own
shape one level out, and it is open as #21. The probe on that provider is #22.

### Why not fix the bridge instead

#18 offered making the bridge carry pi's assembled prompt as the other answer,
and the two are not exclusive. That is still the right fix for the bridge, and
it is not ours to make. It also leaves every Rule resting on how one provider
behaves. A Rule needs a carrier that rests on no provider at all.

## Reproducing the measurement

Run the probe with extension discovery on, or load `pi-claude-bridge` with a
second `-e`. `--no-extensions` takes that package away, and with it the provider
it registers, so `--provider claude-bridge` cannot start and pi picks another
provider instead.

## Consequences

- The five Rules apply on `claude-bridge` for the first time.
- `unslop` and the rest now cost tokens they never cost before. About 22,000
  characters of Rule text was being silently discarded, and the sessions that
  looked cheap were sessions running with no Rules at all.
- Cache behaves better than it did in the design that never worked. A system
  prompt that grows invalidates the entire prefix. A message at the front of the
  conversation invalidates nothing until the set of Rules in force changes. That
  set changes a few times early in a session and then stops changing.
- The Dispatcher no longer returns a system prompt from `before_agent_start`.
  That also takes it out of the way of `pi-claude-bridge`'s prompt capture,
  which was recording the rewritten prompt as an exact key and rebuilding an
  append without it.
- The `steer` delivery for a mid-turn Rule is gone, along with the failure
  handling around it. One carrier, one path, and a Rule that fell due mid-turn
  is in the next model call because every model call carries every Rule in
  force.
- A compaction still re-arms what was injected. Under this carrier the re-arming
  is redundant, because the call after a compaction rebuilds the Rules from
  `inForce` like every other call. The core keeps it because the core is written
  for harnesses generally, and a harness that sends a Rule once as an ordinary
  message really does lose that Rule to a compaction. Under pi the re-arming
  costs a `queue` line and an `inject` line saying a Rule went back in, which it
  did.
- #16 asked what a sub-agent holds. Its evidence was gathered when no Rule
  reached any model on this provider, and needs re-reading now that one can.
