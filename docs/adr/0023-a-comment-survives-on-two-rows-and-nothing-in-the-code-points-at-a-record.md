# 23. A comment survives on two rows, and nothing in the code points at a record

Date: 2026-09-15

## Status

Accepted. Records `rules/comment-discipline`, the `no-comments` Skill and the
`comment-sicko` sub-agent definition it ships. Supersedes the "considered and
deliberately not made a Rule" entry for comment discipline in
`docs/harvest.md`, which is annotated rather than rewritten. Amended by 0041,
which deletes the `no-comments` Skill and the `comment-sicko` definition: what
this record decides about the Rule stands, and the two Bodies it wrote that
verdict into are gone.

## Context

The Rule as it stood asked for judgment. A comment earned its place "by
recording a surprise", and the reader decided what counted as one. Two sections
sized what the judgment produced: a doc block could stand while it was shorter
than what it documented, and long rationale kept its place in the code as a
fact plus an address, `// Writes must land before renames: docs/adr/0012`.

A judgment call made every time is made differently every time, and the tell is
what the repository's own source ended up holding: 68 decision-record pointers
under `src/`, plus the doc blocks and preambles the sizing rules permitted.
Every one of them is prose no run re-checks.

The captain's instruction is "i want as less comments as possible", and he gave
the decision procedure to replace the judgment with. Asked directly whether the
one-line record pointer survived - the shape the Rule explicitly endorsed - he
answered that ADR comments must be removed too.

## Decision

The procedure is the Rule. Each comment a change introduces is read for what it
describes and takes the verdict of the row it matches. Two rows RETAIN: why it
cannot be done the other way, and an invariant, precondition or postcondition
the type system cannot hold. Every other row DROPs, and so does anything the
reader cannot place, because `uncertain -> DROP` is the default rather than an
invitation to think harder.

A RETAIN is then rewritten to the fewest words that carry the fact, with no
history in it.

Two carve-outs are named in the Rule so that the default cannot eat them. A
directive a machine reads - `// prettier-ignore`, `@ts-expect-error` - is code
wearing a comment's syntax, and deleting it changes what the tools do. A legal
or licence header is a licence term.

### The trade

Long rationale still lives in `docs/adr/` or the repo's decision log. What goes
is the road to it from the code.

The captain traded reachability of the argument from the code, for as few
comments as possible. A reader who wants the argument now searches the decision
log for the symbol or the behaviour, instead of following an address sitting on
the line. That is a real cost and it is paid knowingly: an address is a history
reference, the same kind as a ticket number, and a rule that dropped ticket
numbers while keeping record addresses would be two rules.

This is written down because the failure mode is a future reader finding the
pointers gone, reading it as rot, and restoring them one honest fix at a time.
They were removed on purpose. The Rule says so in place, and this record is the
argument the Rule no longer points at.

### The Skill reaches the same verdict

`no-comments` is the invoked cleanup pass, and `comment-sicko` is the sub-agent
it spawns. A sweep that kept what the Rule drops would leave the repository
disagreeing with itself about the same comment, so the sub-agent's keep-list is
now the Rule's two RETAIN rows plus the two carve-outs. Doc comments defining a
public API contract, and issue or RFC links explaining a constraint, were
exceptions on that list and are not any more.

## What was considered and rejected

- **Softening the two contradicted sections instead of deleting them.** A doc
  block "shorter than what it documents" and an address "the reader chooses
  when to pay for" are the shapes the new procedure names DROP. Left in as
  weakened advice they would read as exceptions to it.
- **Keeping the record pointer as the one surviving history reference.** The
  case for it is genuine: it is one line, and it is the only thing that makes a
  decision record findable from the code it governs. Rejected on the captain's
  direct answer, and recorded here as the cost rather than argued away.
- **Sweeping `src/` in this change.** The Rule and the sweep are separate work.
  Landing both at once would bury a rewrite of the repository's own standard
  under several hundred lines of deletions.
- **A list of considerations rather than a table.** The instruction is a lookup:
  read what the comment describes, take the row. A list of things to weigh is
  the judgment this record exists to remove.

## Consequences

- **The repository's own source is now out of compliance with its own Rule**,
  by roughly 68 record pointers and the doc blocks and preambles above. The
  sweep is the work that follows this; until it lands, `src/` reads as the
  previous standard.
- **Three ADRs describe themselves as holding rationale "swept out of its
  comments by the comment-discipline pass"** (0014, 0015, 0016). That road runs
  the right way still: the record holds the argument. Only the return trip is
  gone.
- **`docs/adr/0014`'s consequence about the emitted fan-out script stands.**
  Its comments are string literals in `parallelScript`, documentation of an
  artifact that lands under `~/.pi-subagentura` with no suite or record beside
  it, and they are not this repository's comment load.
- **A reader who wants the argument searches the log.** Nothing else finds it.
