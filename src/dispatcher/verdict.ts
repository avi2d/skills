export type Check = { name: "test" | "lint"; command: string };

export type Tree = { root: string; tree: string; head?: string };

export type Gate = Tree & { checks: Check[] };

type Failed = { outcome: "failed"; check: Check; status: string; tail: string };

export type Outcome =
  | { outcome: "passed"; checks: string[] }
  | Failed
  | { outcome: "inconclusive"; why: string }
  | { outcome: "overran"; why: string };

export type GateState = {
  baseline?: Tree;
  judged?: { tree: string; failed?: Failed };
  held: number;
  asked?: string;
  off?: string;
};

export type Settled = { type: "settled"; failed?: string; gate?: Gate };

export type Verdict = { type: "verdict"; tree: string; after: string; seconds: number; verdict: Outcome };

export type GateAction =
  | { type: "verify"; root: string; tree: string; base?: string; checks: Check[] }
  | { type: "passed"; tree: string; checks: string[]; seconds: number }
  | { type: "hold"; tree: string; check: string; held: number; of: number; text: string }
  | { type: "release"; tree: string; why: string };

export type Judged = { actions: GateAction[]; gate: GateState | undefined };

export const HOLDS = 2;

export const releasedText = (why: string): string => `Verdict gate: ${why}.`;

// Codex answers a held stop by sending the hold back as a prompt, and that one is not the human speaking.
export function promptedGate(gate: GateState | undefined, event: { text?: string; baseline?: Tree }): GateState | undefined {
  if (gate?.asked !== undefined && event.text?.includes(gate.asked)) return gate;
  if (!gate && event.baseline === undefined) return undefined;
  const { asked: _, baseline: _baseline, ...rest } = gate ?? { held: 0 };
  return { ...rest, held: 0, ...(event.baseline === undefined ? {} : { baseline: event.baseline }) };
}

const quoted = (lines: string): string => `\`\`\`\n${lines.replace(/`{3,}/g, "'''")}\n\`\`\``;

function holdText(failed: Failed, held: number, unchanged: boolean): string {
  const { check, status, tail } = failed;
  return [
    `Not finished yet: the checks failed, hold ${held} of ${HOLDS}.`,
    `\`${check.command}\`, this repository's commands.${check.name} in .no-mistakes.yaml, ${status}${
      unchanged ? ", and nothing has changed since, so it was not run again" : " on the tree as it stands"
    }. Fix what it reports and finish again. If it cannot be fixed in this session, say why.`,
    tail.trim() === "" ? "It printed nothing." : `The last of what it printed:\n\n${quoted(tail.trimEnd())}`,
  ].join("\n\n");
}

function holdOrRelease(gate: GateState, tree: string, failed: Failed, unchanged: boolean): Judged {
  if (gate.held >= HOLDS) {
    const why = `${failed.check.name} still fails after ${HOLDS} holds, so the session is let go with it failing`;
    return { actions: [{ type: "release", tree, why }], gate };
  }
  const held = gate.held + 1;
  const text = holdText(failed, held, unchanged);
  const asked = text.split("\n")[0] ?? text;
  return { actions: [{ type: "hold", tree, check: failed.check.name, held, of: HOLDS, text }], gate: { ...gate, held, asked } };
}

export function onSettled(event: Settled, before: GateState | undefined): Judged {
  const nothing: Judged = { actions: [], gate: before };
  const found = event.gate;
  if (!found || event.failed) return nothing;
  const gate = before ?? { held: 0 };
  if (gate.off !== undefined) return nothing;
  if (gate.baseline?.root !== found.root) {
    return { actions: [], gate: { ...gate, baseline: { root: found.root, tree: found.tree, ...(found.head === undefined ? {} : { head: found.head }) } } };
  }
  if (found.tree === gate.baseline.tree) return nothing;
  if (gate.judged?.tree === found.tree) {
    return gate.judged.failed ? holdOrRelease(gate, found.tree, gate.judged.failed, true) : nothing;
  }
  return {
    actions: [
      {
        type: "verify",
        root: found.root,
        tree: found.tree,
        ...(gate.baseline.head === undefined ? {} : { base: gate.baseline.head }),
        checks: found.checks,
      },
    ],
    gate: before,
  };
}

export function onVerdict(event: Verdict, before: GateState | undefined): Judged {
  const gate = before ?? { held: 0 };
  const { verdict, tree, after } = event;
  switch (verdict.outcome) {
    case "passed":
      return {
        actions: [{ type: "passed", tree, checks: verdict.checks, seconds: event.seconds }],
        gate: { ...gate, held: 0, judged: { tree: after } },
      };
    case "inconclusive":
      return { actions: [{ type: "release", tree, why: `${verdict.why}, so this settle is let go unchecked` }], gate: before };
    case "overran": {
      const why = `${verdict.why}, so the gate stands down for the rest of this session`;
      return { actions: [{ type: "release", tree, why }], gate: { ...gate, off: why } };
    }
    case "failed":
      return holdOrRelease({ ...gate, judged: { tree: after, failed: verdict } }, tree, verdict, false);
  }
}
