import { describe, expect, test } from "bun:test";
import { pathsIn, poolRetention, retentionOf, retentionVerdict, urlsIn } from "../../scripts/replay-haiku-compaction/retention";

const QUOTE = String.fromCharCode(34);

const SOURCE = [
  "user: see https://github.com/o/r/pull/12 and write state/muse-gate.status",
  "user: the captain said " + QUOTE + "merge only on green gates" + QUOTE,
  "assistant: edited src/loop.ts and logged key=gate.verdict",
].join("\n");

const CAPTAIN = [
  "user: see https://github.com/o/r/pull/12 and write state/muse-gate.status",
  "user: the captain said " + QUOTE + "merge only on green gates" + QUOTE,
].join("\n");

const RECORDED = [
  "## Goal",
  "- Land https://github.com/o/r/pull/12 after editing src/loop.ts.",
  "- The captain said " + QUOTE + "merge only on green gates" + QUOTE + ".",
  "## Next Steps",
  "1. Run the replay on both machines.",
].join("\n");

const CANDIDATE = [
  "## Goal",
  "- Land https://github.com/o/r/pull/12 for task muse-gate, see https://example.com/invented.",
  "## Next Steps",
  "1. Run the replay on both machines.",
].join("\n");

describe("extractors", () => {
  test("urls drop trailing punctuation and paths need a root or an extension", () => {
    expect(urlsIn("at https://a.dev/x/y.")).toEqual(["https://a.dev/x/y"]);
    expect(urlsIn("a scheme alone: https://, or https://*")).toEqual([]);
    expect(pathsIn("edit src/loop.ts, /tmp/out and and/or")).toEqual(["src/loop.ts", "/tmp/out"]);
  });
  test("a url without letters after the scheme is not a fact", () => {
    expect(urlsIn("retry https:// then continue")).toEqual([]);
    expect(urlsIn("see https://github.com/o/r/pull/12 next")).toEqual(["https://github.com/o/r/pull/12"]);
  });
});

describe("retentionOf", () => {
  test("hand-counted pool from the source both summarizers saw", () => {
    const retention = retentionOf(RECORDED, CANDIDATE, SOURCE, CAPTAIN);
    const byClass = new Map(retention.classes.map((slot) => [slot.class, slot]));
    expect(byClass.get("url")).toEqual({ class: "url", pooled: 1, recorded: 1, candidate: 1 });
    expect(byClass.get("path")).toEqual({ class: "path", pooled: 1, recorded: 1, candidate: 0 });
    expect(byClass.get("taskId")).toEqual({ class: "taskId", pooled: 1, recorded: 0, candidate: 1 });
    expect(byClass.get("decisionKey")).toEqual({ class: "decisionKey", pooled: 0, recorded: 0, candidate: 0 });
    expect(byClass.get("quote")).toEqual({ class: "quote", pooled: 1, recorded: 1, candidate: 0 });
    expect(byClass.get("toolQuote")).toEqual({ class: "toolQuote", pooled: 0, recorded: 0, candidate: 0 });
    expect(byClass.get("next")).toEqual({ class: "next", pooled: 1, recorded: 1, candidate: 1 });
    expect(retention.lost.map((fact) => fact.class)).toEqual(["path", "quote"]);
    expect(retention.gained).toEqual([{ class: "taskId", text: "muse-gate" }]);
  });
  test("a summary keeps everything it shares with itself", () => {
    const retention = retentionOf(RECORDED, RECORDED, SOURCE, CAPTAIN);
    expect(retention.lost).toEqual([]);
    expect(retention.classes.every((slot) => slot.recorded === slot.candidate)).toBe(true);
  });
  test("captain says do not ship in a user message and the candidate drops it", () => {
    const source = ["user: the captain said " + QUOTE + "do not ship" + QUOTE + " tonight"].join("\n");
    const recorded = ["## Goal", "- The captain said " + QUOTE + "do not ship" + QUOTE + "."].join("\n");
    const candidate = ["## Goal", "- Ship tonight."].join("\n");
    const retention = retentionOf(recorded, candidate, source, source);
    const byClass = new Map(retention.classes.map((slot) => [slot.class, slot]));
    expect(byClass.get("quote")).toEqual({ class: "quote", pooled: 1, recorded: 1, candidate: 0 });
    expect(retention.lost).toEqual([{ class: "quote", text: "do not ship" }]);
  });
  test("a quote carried by the previous summary is a captain quote", () => {
    const previous = "Earlier the captain said " + QUOTE + "hold the release" + QUOTE + ".";
    const source = "user: continue the work\nresume from this summary:\n" + previous;
    const recorded = ["## Goal", "- The captain said " + QUOTE + "hold the release" + QUOTE + "."].join("\n");
    const candidate = ["## Goal", "- Continue the work."].join("\n");
    const retention = retentionOf(recorded, candidate, source, source + "\n" + previous);
    expect(retention.lost).toEqual([{ class: "quote", text: "hold the release" }]);
    const twenty = Array.from({ length: 20 }, () => retention);
    expect(retentionVerdict(poolRetention(twenty), 20, twenty)).toBe("NEEDS-DECISION");
  });
  test("an open choice under Key Decisions counts alongside blocked and next steps", () => {
    const source = ["user: should we ship?"].join("\n");
    const recorded = ["## Key Decisions", "- **Whether to ship**: pending captain approval?"].join("\n");
    const candidate = ["## Key Decisions", "- **Whether to ship**: pending captain approval?"].join("\n");
    const kept = retentionOf(recorded, candidate, source, source);
    expect(kept.lost).toEqual([]);
    expect(kept.classes.find((slot) => slot.class === "openDecision")).toEqual({
      class: "openDecision",
      pooled: 1,
      recorded: 1,
      candidate: 1,
    });
    const dropped = retentionOf(recorded, "## Key Decisions\n- Nothing decided.", source, source);
    expect(dropped.lost.map((fact) => fact.class)).toContain("openDecision");
  });
  test("a tool-output quote is reported apart from a captain quote", () => {
    const source = ["user: check the build", "assistant: tool output said " + QUOTE + "connection reset by peer on retry" + QUOTE].join("\n");
    const recorded = ["## Critical Context", "- Tool said " + QUOTE + "connection reset by peer on retry" + QUOTE + "."].join("\n");
    const candidate = ["## Critical Context", "- Build failed."].join("\n");
    const retention = retentionOf(recorded, candidate, source, "user: check the build");
    expect(retention.lost).toEqual([{ class: "toolQuote", text: "connection reset by peer on retry" }]);
    const byClass = new Map(retention.classes.map((slot) => [slot.class, slot]));
    expect(byClass.get("quote")).toEqual({ class: "quote", pooled: 0, recorded: 0, candidate: 0 });
    expect(byClass.get("toolQuote")).toEqual({ class: "toolQuote", pooled: 1, recorded: 1, candidate: 0 });
  });
});

describe("retentionVerdict", () => {
  test("merge-grade needs twenty cases and no class below the recorded count", () => {
    const one = retentionOf(RECORDED, RECORDED, SOURCE, CAPTAIN);
    const lossy = retentionOf(RECORDED, CANDIDATE, SOURCE, CAPTAIN);
    const twenty = Array.from({ length: 20 }, () => one);
    const twentyLossy = Array.from({ length: 20 }, () => lossy);
    expect(retentionVerdict(poolRetention(twenty), 20, twenty)).toBe("MERGE-GRADE");
    expect(retentionVerdict(poolRetention([one]), 19, [one])).toBe("NEEDS-DECISION");
    expect(retentionVerdict(poolRetention(twentyLossy), 20, twentyLossy)).toBe("NEEDS-DECISION");
  });
  test("equal counts still need a decision when a captain quote is lost to another source quote", () => {
    const source = ["user: captain said " + QUOTE + "merge only on green gates" + QUOTE + " and " + QUOTE + "do not ship tonight" + QUOTE].join("\n");
    const recorded = ["## Goal", "- Captain said " + QUOTE + "merge only on green gates" + QUOTE + "."].join("\n");
    const candidate = ["## Goal", "- Captain said " + QUOTE + "do not ship tonight" + QUOTE + "."].join("\n");
    const retention = retentionOf(recorded, candidate, source, source);
    const byClass = new Map(retention.classes.map((slot) => [slot.class, slot]));
    expect(byClass.get("quote")).toEqual({ class: "quote", pooled: 2, recorded: 1, candidate: 1 });
    expect(retention.lost.map((fact) => fact.class)).toEqual(["quote"]);
    const twenty = Array.from({ length: 20 }, () => retention);
    expect(retentionVerdict(poolRetention(twenty), 20, twenty)).toBe("NEEDS-DECISION");
  });
  test("an invented open decision cannot cover a lost recorded one", () => {
    const source = ["user: should we ship?"].join("\n");
    const recorded = ["## Key Decisions", "- **Whether to ship**: pending captain approval?"].join("\n");
    const candidate = ["## Key Decisions", "- **Whether to retry**: should we try again later?"].join("\n");
    const retention = retentionOf(recorded, candidate, source, source);
    const byClass = new Map(retention.classes.map((slot) => [slot.class, slot]));
    expect(byClass.get("openDecision")).toEqual({ class: "openDecision", pooled: 2, recorded: 1, candidate: 1 });
    expect(retention.lost.map((fact) => fact.class)).toEqual(["openDecision"]);
    const twenty = Array.from({ length: 20 }, () => retention);
    expect(retentionVerdict(poolRetention(twenty), 20, twenty)).toBe("NEEDS-DECISION");
  });
  test("a lost tool-output quote alone still merges", () => {
    const source = ["user: check the build", "assistant: tool output said " + QUOTE + "connection reset by peer on retry" + QUOTE].join("\n");
    const recorded = ["## Critical Context", "- Tool said " + QUOTE + "connection reset by peer on retry" + QUOTE + "."].join("\n");
    const candidate = ["## Critical Context", "- Build failed."].join("\n");
    const retention = retentionOf(recorded, candidate, source, "user: check the build");
    expect(retention.lost.map((fact) => fact.class)).toEqual(["toolQuote"]);
    const twenty = Array.from({ length: 20 }, () => retention);
    expect(retentionVerdict(poolRetention(twenty), 20, twenty)).toBe("MERGE-GRADE");
  });
});
