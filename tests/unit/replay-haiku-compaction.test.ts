import { describe, expect, test } from "bun:test";
import { assembleSummary, poolScores, rescoreSaved, verdictFor, type CaseReport } from "../../scripts/replay-haiku-compaction/report";
import { userTextOf } from "../../scripts/replay-haiku-compaction";
import { buildCase, explicitFilter, selectCases } from "../../scripts/replay-haiku-compaction/cases";
import { distinctive, isOpenDecision, itemRecalled, normalize, parseFileSections, parseItems, scoreSummaries, stripFileSections, tokenHit, worded, type SessionEntry } from "../../scripts/replay-haiku-compaction/scoring";

const TICK = String.fromCharCode(96);
const QUOTE = String.fromCharCode(34);

const RECORDED = [
  "## Goal",
  "- Ship the summary feature for the sessions page.",
  "- Keep the token budget under control in " + TICK + "src/loop.ts" + TICK + ".",
  "## Key Decisions",
  "- Use " + TICK + "claude-bridge/claude-haiku-5-5" + TICK + " for summaries.",
  "- The captain said " + QUOTE + "merge only on green gates" + QUOTE + ".",
  "## Blocked",
  "- Waiting on the captain to decide the output cap.",
  "<read-files>",
  "src/loop.ts",
  "</read-files>",
].join("\n");

const CANDIDATE = [
  "## Goal",
  "- Ship the summary feature for sessions.",
  "- Keep token budget under control in src/loop.ts.",
  "## Key Decisions",
  "- Use claude-haiku-5-5 for summaries.",
  "## Blocked",
  "- Still blocked, no update.",
].join("\n");

describe("parseItems", () => {
  test("assigns classes, quotes and open decisions", () => {
    const items = parseItems(RECORDED);
    expect(items.map((item) => item.class)).toEqual(["goal", "goal", "decisions", "decisions", "blocked"]);
    expect(items.filter((item) => item.quote).length).toBe(1);
    const blocked = items.find((item) => item.class === "blocked");
    expect(blocked?.openDecision).toBe(true);
    expect(items[0]?.openDecision).toBe(false);
  });
});

describe("scoreSummaries", () => {
  test("hand-computed recall: 2 of 5, quotes and decisions lost", () => {
    const score = scoreSummaries(RECORDED, CANDIDATE);
    expect(score.total).toBe(5);
    expect(score.hits).toBe(2);
    expect(score.overall).toBeCloseTo(0.4, 5);
    expect(score.quoteTotal).toBe(1);
    expect(score.quoteRecall).toBe(0);
    expect(score.decisionTotal).toBe(1);
    expect(score.decisionRecall).toBe(0);
    const byClass = new Map(score.classes.map((c) => [c.class, c]));
    expect(byClass.get("goal")).toEqual({ class: "goal", total: 2, hits: 2 });
    expect(byClass.get("decisions")).toEqual({ class: "decisions", total: 2, hits: 0 });
    expect(byClass.get("blocked")).toEqual({ class: "blocked", total: 1, hits: 0 });
  });
  test("identical text scores 1", () => {
    expect(scoreSummaries(RECORDED, RECORDED).overall).toBe(1);
  });
});

describe("matching", () => {
  test("word tokens need boundaries", () => {
    expect(tokenHit("cat", "concatenate", worded("concatenate"))).toBe(false);
    expect(tokenHit("cat", "a cat sat", worded("a cat sat"))).toBe(true);
  });
  test("path tokens match by substring", () => {
    expect(tokenHit("src/loop.ts", "see src/loop.ts here", worded("see src/loop.ts here"))).toBe(true);
  });
  test("short items need full containment", () => {
    const item = { class: "goal", text: "Fix it", quote: false, openDecision: false };
    expect(itemRecalled(item, "fix it now", " fix it now ")).toBe(true);
    expect(itemRecalled(item, "fix them", " fix them ")).toBe(false);
  });
  test("distinctive drops filler", () => {
    expect(distinctive("Use it for the")).toEqual([]);
    expect(distinctive("Use it for the thing")).toEqual(["thing"]);
    expect(normalize("  A  B ")).toBe("a b");
  });
  test("decision words", () => {
    expect(isOpenDecision("blocked", "waiting on a decision")).toBe(true);
    expect(isOpenDecision("goal", "waiting on a decision")).toBe(false);
    expect(isOpenDecision("decisions", "still pending captain approval")).toBe(true);
    expect(isOpenDecision("decisions", "whether to ship?")).toBe(true);
    expect(isOpenDecision("decisions", "the decision is to reuse the cache")).toBe(false);
    expect(isOpenDecision("decisions", "use haiku for summaries")).toBe(false);
  });
  test("userTextOf keeps only user words", () => {
    expect(
      userTextOf([
        { role: "user", content: "first" },
        { role: "assistant", content: "tool said " + QUOTE + "connection reset" + QUOTE },
        { role: "user", content: [{ type: "text", text: "second" }] },
      ]),
    ).toBe("first\nsecond");
  });
});

describe("file sections", () => {
  test("parse and strip round-trip", () => {
    const sections = parseFileSections(RECORDED);
    expect(sections).toEqual({ read: ["src/loop.ts"], modified: [] });
    expect(stripFileSections(RECORDED)).not.toContain("<read-files>");
    expect(assembleSummary(false, undefined, "body", ["a"], ["b"])).toContain("<read-files>");
  });
});

describe("verdict and pooling", () => {
  test("needs 95 percent of reference with no quote or decision loss", () => {
    expect(verdictFor(0.95, 1, 1, 1, 1, 1)).toBe("MERGE-GRADE");
    expect(verdictFor(0.94, 1, 1, 1, 1, 1)).toBe("NEEDS-DECISION");
    expect(verdictFor(1, 1, 0.5, 1, 1, 1)).toBe("NEEDS-DECISION");
    expect(verdictFor(1, 1, 1, 1, 0, 1)).toBe("NEEDS-DECISION");
  });
  test("poolScores micro-averages", () => {
    const pooled = poolScores([scoreSummaries(RECORDED, CANDIDATE), scoreSummaries(RECORDED, RECORDED)]);
    expect(pooled.items).toBe(10);
    expect(pooled.overall).toBeCloseTo(0.7, 5);
  });
  test("selectCases spreads across dirs", () => {
    const tagged = [
      { dir: "b", file: "f1", value: 1 },
      { dir: "a", file: "f1", value: 2 },
      { dir: "a", file: "f1", value: 3 },
      { dir: "a", file: "f1", value: 4 },
    ];
    expect(selectCases(tagged, 3, 2)).toEqual([2, 1, 3]);
  });
  test("explicitFilter parses file:index pairs", () => {
    expect(explicitFilter("a.jsonl:3,b.jsonl:7").get("a.jsonl")).toEqual(new Set([3]));
  });
});

describe("rescoreSaved", () => {
  function savedCaseOf(
    texts: { recorded: string; candidate: string; source: string; captain: string },
    opts?: { split?: boolean; historyMessages?: number; previous?: string },
  ): CaseReport {
    const blankScore = {
      classes: [],
      overall: 0,
      total: 0,
      hits: 0,
      quoteRecall: 0,
      quoteTotal: 0,
      decisionRecall: 0,
      decisionTotal: 0,
      recordedChars: 0,
      candidateChars: 0,
    };
    return {
      file: "sessions.jsonl",
      dir: "s1",
      index: 0,
      split: opts?.split ?? false,
      tokensBefore: 0,
      rebuiltTokens: 0,
      skipped: 0,
      historyMessages: opts?.historyMessages ?? 1,
      prefixMessages: 1,
      recordedModel: "opencode-go/muse-spark",
      recordedItems: 0,
      recordedChars: 0,
      candidateChars: 0,
      referenceChars: 0,
      candidateCost: 0,
      referenceCost: 0,
      candidateTokens: { calls: 0, reportedInput: 0, reportedOutput: 0, estimatedInput: 0, estimatedOutput: 0 },
      retention: { classes: [], lost: [], gained: [] },
      candidate: blankScore,
      reference: blankScore,
      candidateText: texts.candidate,
      referenceText: texts.recorded,
      recordedText: texts.recorded,
      sourceText: texts.source,
      captainText: texts.captain,
      previousSummary: opts?.previous,
    };
  }
  test("rescores a saved report without model calls", () => {
    const keeper = savedCaseOf({
      recorded: "## Goal\n- Ship it.",
      candidate: "## Goal\n- Ship it.",
      source: "user: ship it",
      captain: "user: ship it",
    });
    const one = rescoreSaved([keeper], true);
    expect(one.captainQuoteLosses).toBe(0);
    expect(one.decisionLosses).toBe(0);
    expect(one.toolQuoteLosses).toBe(0);
    expect(one.summary.verdict).toBe("NEEDS-DECISION");
    const recorded = ["## Goal", "- The captain said " + QUOTE + "hold the release" + QUOTE + "."].join("\n");
    const lossy = savedCaseOf({
      recorded,
      candidate: "## Goal\n- Ship it.",
      source: "user: the captain said " + QUOTE + "hold the release" + QUOTE,
      captain: "user: the captain said " + QUOTE + "hold the release" + QUOTE,
    });
    const lost = rescoreSaved(Array.from({ length: 20 }, () => lossy), true);
    expect(lost.captainQuoteLosses).toBe(20);
    expect(lost.decisionLosses).toBe(0);
    expect(lost.summary.verdict).toBe("NEEDS-DECISION");
    const twenty = rescoreSaved(Array.from({ length: 20 }, () => keeper), true);
    expect(twenty.summary.verdict).toBe("MERGE-GRADE");
  });
  test("fails the gate instead of crediting the candidate with recorded history", () => {
    const previous = [
      "## Goal",
      "- The captain said " + QUOTE + "hold the release tonight" + QUOTE + ".",
    ].join("\n");
    const recordedHistory = [
      "## Goal",
      "- Delay " + QUOTE + "push the deploy to friday" + QUOTE + " for now.",
      "## Key Decisions",
      "- Whether to ship: pending captain approval?",
    ].join("\n");
    const prefix = "## Goal\n- Continue the release work.";
    const turn = "user: push the deploy to friday, then continue the release work.";
    const stale = savedCaseOf(
      {
        recorded: recordedHistory + "\n\n---\n\n**Turn Context (split turn):**\n\n" + prefix,
        candidate: prefix,
        source: "\n# Conversation\n" + turn + "\n\n# Instructions\ncheckpoint",
        captain: turn + "\n" + previous,
      },
      { split: true, historyMessages: 0, previous },
    );
    const fixed = rescoreSaved(Array.from({ length: 20 }, () => stale), true);
    expect(fixed.done[0]?.candidateText).toBe(previous + "\n\n---\n\n**Turn Context (split turn):**\n\n" + prefix);
    expect(fixed.captainQuoteLosses).toBe(20);
    expect(fixed.decisionLosses).toBe(20);
    expect(fixed.toolQuoteLosses).toBe(0);
    expect(fixed.summary.verdict).toBe("NEEDS-DECISION");
  });
  test("rescoring an already assembled report changes nothing", () => {
    const previous = "## Goal\n- The captain said " + QUOTE + "hold the release tonight" + QUOTE + ".";
    const prefix = "## Goal\n- Continue the release work.";
    const turn = "user: continue the release work.";
    const assembled = savedCaseOf(
      {
        recorded: previous + "\n\n---\n\n**Turn Context (split turn):**\n\n" + prefix,
        candidate: previous + "\n\n---\n\n**Turn Context (split turn):**\n\n" + prefix,
        source: "\n" + turn + "\n" + previous,
        captain: turn + "\n" + previous,
      },
      { split: true, historyMessages: 0, previous },
    );
    const once = rescoreSaved(Array.from({ length: 20 }, () => assembled), true);
    expect(once.summary.verdict).toBe("MERGE-GRADE");
    const twice = rescoreSaved(once.done, true);
    expect(twice.done).toEqual(once.done);
    expect(twice.summary.verdict).toBe(once.summary.verdict);
    expect(twice.captainQuoteLosses).toBe(once.captainQuoteLosses);
    expect(twice.decisionLosses).toBe(once.decisionLosses);
    expect(twice.toolQuoteLosses).toBe(once.toolQuoteLosses);
  });
});

describe("buildCase", () => {
  function message(id: string, role: "user" | "assistant", provider: string): SessionEntry {
    if (role === "user") return { id, type: "message", message: { role, content: "text " + id, timestamp: 0 } };
    return {
      id,
      type: "message",
      message: {
        role,
        content: [{ type: "text", text: "text " + id }],
        api: "openai-completions",
        provider,
        model: "m",
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: "stop",
        timestamp: 0,
      },
    };
  }
  test("rebuilds history before the cut", () => {
    const lines: SessionEntry[] = [
      message("u1", "user", "claude-bridge"),
      message("a1", "assistant", "claude-bridge"),
      message("u2", "user", "claude-bridge"),
      { id: "c1", type: "compaction", summary: "## Goal\n- Old work.\n", firstKeptEntryId: "u2", tokensBefore: 10 },
    ];
    const built = buildCase("f.jsonl", "d", lines, 3, "claude-bridge/");
    expect(built?.history.length).toBe(2);
    expect(built?.previousSummary).toBeUndefined();
    expect(built?.split).toBe(false);
  });
  test("split cases take history before the turn and prefix inside it", () => {
    const lines: SessionEntry[] = [
      message("u1", "user", "claude-bridge"),
      message("a1", "assistant", "claude-bridge"),
      message("u2", "user", "claude-bridge"),
      message("a2", "assistant", "claude-bridge"),
      { id: "c1", type: "compaction", summary: "## Goal\n- Old.\n**Turn Context (split turn):**\n- Partial.\n", firstKeptEntryId: "a2", tokensBefore: 10 },
    ];
    const built = buildCase("f.jsonl", "d", lines, 4, "claude-bridge/");
    expect(built?.split).toBe(true);
    expect(built?.history.length).toBe(2);
    expect(built?.prefix.length).toBe(1);
  });
  test("rejects missing cuts", () => {
    const lines: SessionEntry[] = [
      message("u1", "user", "claude-bridge"),
      message("a1", "assistant", "claude-bridge"),
      { id: "c1", type: "compaction", summary: "## Goal\n- Old.\n", firstKeptEntryId: "missing", tokensBefore: 1 },
    ];
    expect(buildCase("f.jsonl", "d", lines, 2, "claude-bridge/")).toBeUndefined();
  });
  test("keeps only compactions the session model wrote, and none a hook wrote", () => {
    const compaction: SessionEntry = { id: "c1", type: "compaction", summary: "## Goal\n- Old.\n", firstKeptEntryId: "u2", tokensBefore: 1 };
    const lines = (provider: string, entry: SessionEntry): SessionEntry[] => [
      message("u1", "user", provider),
      message("a1", "assistant", provider),
      message("u2", "user", provider),
      entry,
    ];
    expect(buildCase("f.jsonl", "d", lines("opencode-go", compaction), 3, "opencode-go/m")).toBeDefined();
    expect(buildCase("f.jsonl", "d", lines("opencode-go", compaction), 3, "claude-bridge/")).toBeUndefined();
    expect(buildCase("f.jsonl", "d", lines("opencode-go", { ...compaction, fromHook: true }), 3, "opencode-go/m")).toBeUndefined();
  });
});


