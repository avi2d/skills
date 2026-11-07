import { describe, expect, test } from "bun:test";
import { pathsIn, poolRetention, retentionOf, urlsIn } from "../../scripts/replay-haiku-compaction/retention";

function byKind(retention: ReturnType<typeof retentionOf>): Map<string, { pooled: number; recorded: number; candidate: number }> {
  return new Map(retention.classes.map((slot) => [slot.kind, { pooled: slot.pooled, recorded: slot.recorded, candidate: slot.candidate }]));
}

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
  test("a summary keeps everything it shares with itself", () => {
    const source = "user: see https://github.com/o/r/pull/12 and write state/muse-gate.status";
    const recorded = ["## Goal", "- Land https://github.com/o/r/pull/12 for state/muse-gate.status."].join("\n");
    const retention = retentionOf(recorded, recorded, source);
    expect(retention.lost).toEqual([]);
    expect(retention.gained).toEqual([]);
    expect(retention.classes.every((slot) => slot.recorded === slot.candidate && slot.recorded === slot.pooled)).toBe(true);
  });
  test("an invented url the source never grounds is neither lost nor gained", () => {
    const source = "user: see https://github.com/o/r/pull/12";
    const recorded = ["## Goal", "- Land https://github.com/o/r/pull/12."].join("\n");
    const candidate = ["## Goal", "- Land https://github.com/o/r/pull/12, see https://example.com/invented."].join("\n");
    const retention = retentionOf(recorded, candidate, source);
    expect(retention.lost).toEqual([]);
    expect(retention.gained).toEqual([]);
    expect(byKind(retention).get("url")).toEqual({ pooled: 1, recorded: 1, candidate: 1 });
  });
  test("pull/12 is not kept by pull/123", () => {
    const source = "user: see https://github.com/o/r/pull/12";
    const recorded = ["## Goal", "- Land https://github.com/o/r/pull/12."].join("\n");
    const candidate = ["## Goal", "- Land https://github.com/o/r/pull/123."].join("\n");
    const retention = retentionOf(recorded, candidate, source);
    expect(byKind(retention).get("url")).toEqual({ pooled: 1, recorded: 1, candidate: 0 });
    expect(retention.lost).toEqual([{ kind: "url", value: "https://github.com/o/r/pull/12" }]);
  });
  test("pull/12 is not kept by pull/12/files", () => {
    const source = "user: see https://github.com/o/r/pull/12";
    const recorded = ["## Goal", "- Land https://github.com/o/r/pull/12."].join("\n");
    const candidate = ["## Goal", "- Land https://github.com/o/r/pull/12/files."].join("\n");
    const retention = retentionOf(recorded, candidate, source);
    expect(byKind(retention).get("url")).toEqual({ pooled: 1, recorded: 1, candidate: 0 });
    expect(retention.lost).toEqual([{ kind: "url", value: "https://github.com/o/r/pull/12" }]);
  });
  test("/tmp/run/out is not kept by /tmp/run/out.json", () => {
    const source = "tool: wrote /tmp/run/out ok";
    const recorded = ["## Goal", "- Edited /tmp/run/out."].join("\n");
    const candidate = ["## Goal", "- Edited /tmp/run/out.json."].join("\n");
    const retention = retentionOf(recorded, candidate, source);
    expect(byKind(retention).get("path")).toEqual({ pooled: 1, recorded: 1, candidate: 0 });
    expect(retention.lost).toEqual([{ kind: "path", value: "/tmp/run/out" }]);
  });
  test("src/foo.ts is not kept by src/foo.ts.bak", () => {
    const source = "tool: wrote src/foo.ts ok";
    const recorded = ["## Goal", "- Edited src/foo.ts."].join("\n");
    const candidate = ["## Goal", "- Edited src/foo.ts.bak."].join("\n");
    const retention = retentionOf(recorded, candidate, source);
    expect(byKind(retention).get("path")).toEqual({ pooled: 1, recorded: 1, candidate: 0 });
    expect(retention.lost).toEqual([{ kind: "path", value: "src/foo.ts" }]);
  });
  test("a longer key does not keep the recorded decision key", () => {
    const source = "user: set key=deploy.v1";
    const recorded = ["## Goal", "- Use key=deploy.v1."].join("\n");
    for (const longer of ["key=deploy.v1.2.", "key=deploy.v1.next."]) {
      const candidate = ["## Goal", "- Use " + longer].join("\n");
      const retention = retentionOf(recorded, candidate, source);
      expect(byKind(retention).get("decisionKey")).toEqual({ pooled: 1, recorded: 1, candidate: 0 });
      expect(retention.lost).toEqual([{ kind: "decisionKey", value: "deploy.v1" }]);
    }
  });
  test("alpha is not kept by alpha.beta", () => {
    const source = "state/alpha.status state/alpha.beta.status";
    const recorded = ["## Goal", "- Task alpha."].join("\n");
    const candidate = ["## Goal", "- Task alpha.beta."].join("\n");
    const retention = retentionOf(recorded, candidate, source);
    expect(byKind(retention).get("taskId")).toEqual({ pooled: 2, recorded: 1, candidate: 1 });
    expect(retention.lost).toEqual([{ kind: "taskId", value: "alpha" }]);
  });
  test("fix-3 is not kept by fix-3.1", () => {
    const source = "state/fix-3.inbox state/fix-3.1.inbox";
    const recorded = ["## Goal", "- Task fix-3."].join("\n");
    const candidate = ["## Goal", "- Task fix-3.1."].join("\n");
    const retention = retentionOf(recorded, candidate, source);
    expect(byKind(retention).get("taskId")).toEqual({ pooled: 2, recorded: 1, candidate: 1 });
    expect(retention.lost).toEqual([{ kind: "taskId", value: "fix-3" }]);
  });
  test("release is not kept by an ungrounded release.prod", () => {
    const source = "user: key=release";
    const recorded = ["## Goal", "- Use key=release."].join("\n");
    const candidate = ["## Goal", "- Use key=release.prod."].join("\n");
    const retention = retentionOf(recorded, candidate, source);
    expect(byKind(retention).get("decisionKey")).toEqual({ pooled: 1, recorded: 1, candidate: 0 });
    expect(retention.lost).toEqual([{ kind: "decisionKey", value: "release" }]);
  });
  test("alpha is not kept by alpha.beta when only alpha is known", () => {
    const source = "state/alpha.status";
    const recorded = ["## Goal", "- Task alpha."].join("\n");
    const candidate = ["## Goal", "- Task alpha.beta."].join("\n");
    const retention = retentionOf(recorded, candidate, source);
    expect(byKind(retention).get("taskId")).toEqual({ pooled: 1, recorded: 1, candidate: 0 });
    expect(retention.lost).toEqual([{ kind: "taskId", value: "alpha" }]);
  });
  test("a session id with a file suffix is lost when dropped", () => {
    const id = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
    const source = "user: resumed " + id;
    const recorded = ["## Goal", "- Session " + id + ".jsonl"].join("\n");
    const candidate = ["## Goal", "- Dropped it."].join("\n");
    const retention = retentionOf(recorded, candidate, source);
    expect(byKind(retention).get("taskId")).toEqual({ pooled: 1, recorded: 1, candidate: 0 });
    expect(retention.lost).toEqual([{ kind: "taskId", value: id }]);
  });
  test("a trailing period does not hide a dropped decision key", () => {
    const source = "user: set key=deploy.v1";
    const recorded = ["## Goal", "- Use key=deploy.v1."].join("\n");
    const candidate = ["## Goal", "- Use the deploy key."].join("\n");
    const retention = retentionOf(recorded, candidate, source);
    expect(byKind(retention).get("decisionKey")).toEqual({ pooled: 1, recorded: 1, candidate: 0 });
    expect(retention.lost).toEqual([{ kind: "decisionKey", value: "deploy.v1" }]);
  });
  test("an id after a colon or underscore is still pooled", () => {
    const first = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
    const second = "01ARZ3NDEKTSV4RRFFQ69G5FAW";
    const source = "user: resumed " + first + " and " + second;
    const recorded = ["## Goal", "- Session:" + first + " run_" + second + "."].join("\n");
    const candidate = ["## Goal", "- Dropped it."].join("\n");
    const retention = retentionOf(recorded, candidate, source);
    expect(byKind(retention).get("taskId")).toEqual({ pooled: 2, recorded: 2, candidate: 0 });
    expect(retention.lost).toEqual([
      { kind: "taskId", value: first },
      { kind: "taskId", value: second },
    ]);
  });
  test("a json-quoted url is lost when dropped", () => {
    const source = "[Assistant tool calls]: bash(command=" + JSON.stringify('curl -s "https://github.com/o/r/pull/12"') + ")";
    const recorded = ["## Goal", "- Land https://github.com/o/r/pull/12."].join("\n");
    const candidate = ["## Goal", "- Land it."].join("\n");
    const retention = retentionOf(recorded, candidate, source);
    expect(byKind(retention).get("url")).toEqual({ pooled: 1, recorded: 1, candidate: 0 });
    expect(retention.lost).toEqual([{ kind: "url", value: "https://github.com/o/r/pull/12" }]);
  });
  test("a url after a json newline escape is lost when dropped", () => {
    const source = "[Assistant tool calls]: bash(command=" + JSON.stringify("gh pr view https://github.com/o/r/pull/12\ngit log") + ")";
    const recorded = ["## Goal", "- Land https://github.com/o/r/pull/12."].join("\n");
    const candidate = ["## Goal", "- Land it."].join("\n");
    const retention = retentionOf(recorded, candidate, source);
    expect(byKind(retention).get("url")).toEqual({ pooled: 1, recorded: 1, candidate: 0 });
    expect(retention.lost).toEqual([{ kind: "url", value: "https://github.com/o/r/pull/12" }]);
  });
  test("a path after a json newline escape is lost when dropped", () => {
    const source = "[Assistant tool calls]: bash(command=" + JSON.stringify("cd x\n/home/u/repo/src/foo.ts") + ")";
    const recorded = ["## Goal", "- Edited /home/u/repo/src/foo.ts."].join("\n");
    const candidate = ["## Goal", "- Edited it."].join("\n");
    const retention = retentionOf(recorded, candidate, source);
    expect(byKind(retention).get("path")).toEqual({ pooled: 1, recorded: 1, candidate: 0 });
    expect(retention.lost).toEqual([{ kind: "path", value: "/home/u/repo/src/foo.ts" }]);
  });
  test("a repo-relative path grounded by an absolute source path is lost when dropped", () => {
    const source = "tool: wrote /home/u/repo/src/foo.ts ok";
    const recorded = ["## Goal", "- Edited `src/foo.ts`."].join("\n");
    const candidate = ["## Goal", "- Edited it."].join("\n");
    const retention = retentionOf(recorded, candidate, source);
    expect(byKind(retention).get("path")).toEqual({ pooled: 1, recorded: 1, candidate: 0 });
    expect(retention.lost).toEqual([{ kind: "path", value: "src/foo.ts" }]);
  });
  test("a relative source path grounds an absolute summary spelling", () => {
    const source = "tool: wrote src/foo.ts ok";
    const recorded = ["## Goal", "- Edited /home/u/repo/src/foo.ts."].join("\n");
    const candidate = ["## Goal", "- Edited it."].join("\n");
    const retention = retentionOf(recorded, candidate, source);
    expect(byKind(retention).get("path")).toEqual({ pooled: 1, recorded: 1, candidate: 0 });
    expect(retention.lost).toEqual([{ kind: "path", value: "/home/u/repo/src/foo.ts" }]);
  });
  test("an absolute candidate spelling keeps a relative recorded path", () => {
    const source = "tool: wrote /home/u/repo/src/foo.ts ok";
    const recorded = ["## Goal", "- Edited src/foo.ts."].join("\n");
    const candidate = ["## Goal", "- Edited /home/u/repo/src/foo.ts."].join("\n");
    const retention = retentionOf(recorded, candidate, source);
    expect(byKind(retention).get("path")).toEqual({ pooled: 2, recorded: 2, candidate: 2 });
    expect(retention.lost).toEqual([]);
  });
  test("a key without its marker is not a fact", () => {
    const source = "user: set key=deploy.v1_old";
    const recorded = ["## Goal", "- Use deploy.v1_old."].join("\n");
    const candidate = ["## Goal", "- Use it."].join("\n");
    const retention = retentionOf(recorded, candidate, source);
    expect(byKind(retention).get("decisionKey")).toEqual({ pooled: 0, recorded: 0, candidate: 0 });
    expect(retention.lost).toEqual([]);
  });
});

describe("poolRetention", () => {
  test("pooled counts add across cases", () => {
    const source = "user: see https://github.com/o/r/pull/12";
    const recorded = ["## Goal", "- Land https://github.com/o/r/pull/12."].join("\n");
    const kept = retentionOf(recorded, recorded, source);
    const dropped = retentionOf(recorded, ["## Goal", "- Land it."].join("\n"), source);
    const pooled = poolRetention([kept, dropped]);
    expect(pooled.find((slot) => slot.kind === "url")).toEqual({ kind: "url", pooled: 2, recorded: 2, candidate: 1 });
    expect(pooled.find((slot) => slot.kind === "path")).toEqual({ kind: "path", pooled: 0, recorded: 0, candidate: 0 });
  });
});
