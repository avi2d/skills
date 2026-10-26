import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CLAUDE_BUNDLE, CODEX_BUNDLE } from "../../src/generate/bundle";
import type { Index } from "../../src/dispatcher/dispatch";
import { CAPPED_TREE_MS, HOOK_TEST_MS, RULE_TEXT, rigFor, type Rig } from "./lib/hook-dispatcher";
import { carried } from "./lib/reply";

setDefaultTimeout(HOOK_TEST_MS);

const SCOPED_TEXT = "Say which model this is for.";

const scopedTo = (rig: Rig, models: string[]): Index =>
  rig.indexWith({
    rules: [
      { name: "naming", triggers: [{ predicate: "always" }], text: RULE_TEXT },
      { name: "scoped", triggers: [{ predicate: "always" }], text: SCOPED_TEXT },
    ],
    profiles: [
      { name: "default", models: [], rules: ["naming"], skills: [], references: [] },
      { name: "measured", models, rules: ["naming", "scoped"], skills: [], references: [] },
    ],
  });

describe("a Profile under Claude Code", () => {
  const rig = rigFor(CLAUDE_BUNDLE, "claude-code", "skills-cc-scope-");
  afterAll(rig.remove, { timeout: CAPPED_TREE_MS });
  const index = scopedTo(rig, ["claude-code/claude-opus-5-5"]);

  const opened = async (start: Record<string, unknown>) => {
    const driven = await rig.install(index);
    await driven.fire("SessionStart", { source: "startup", ...start });
    return driven;
  };

  test("Opus 5.5, as SessionStart names it, receives the Rule scoped to it", async () => {
    for (const model of ["claude-opus-5-5", "claude-opus-5-5[1m]"]) {
      const { reply } = await (await opened({ model })).fire("UserPromptSubmit", { prompt: "one" });
      expect(carried(reply), model).toContain(SCOPED_TEXT);
    }
  });

  test("another model receives every unscoped Rule and not the scoped one", async () => {
    const { reply } = await (await opened({ model: "claude-sonnet-5" })).fire("UserPromptSubmit", { prompt: "one" });
    expect(carried(reply)).toContain(RULE_TEXT);
    expect(carried(reply)).not.toContain(SCOPED_TEXT);
  });

  test("a switch away from Opus withdraws the scoped Rule, so compaction does not bring it back", async () => {
    const driven = await opened({ model: "claude-opus-5-5" });
    await driven.fire("UserPromptSubmit", { prompt: "one" });
    const { log } = await driven.fire("PostModelSwitch", { from_model: "claude-opus-5-5", to_model: "claude-sonnet-5" });
    expect(log.join("\n")).toContain("withdraw scoped: the session's model is now claude-code/claude-sonnet-5");
    await driven.fire("PreCompact", {});
    const { reply } = await driven.fire("UserPromptSubmit", { prompt: "two" });
    expect(carried(reply)).toContain(RULE_TEXT);
    expect(carried(reply)).not.toContain(SCOPED_TEXT);
  });

  test("a switch onto Opus lets the scoped Rule in at the next prompt", async () => {
    const driven = await opened({ model: "claude-sonnet-5" });
    await driven.fire("UserPromptSubmit", { prompt: "one" });
    await driven.fire("PostModelSwitch", { from_model: "claude-sonnet-5", to_model: "claude-opus-5-5" });
    const { reply } = await driven.fire("UserPromptSubmit", { prompt: "two" });
    expect(carried(reply)).toContain(SCOPED_TEXT);
  });

  test("a session start that names no model, or one that is not a model ID, takes default", async () => {
    for (const start of [{}, { model: 42 }, { model: "claude opus" }, { model: "" }]) {
      const { reply } = await (await opened(start)).fire("UserPromptSubmit", { prompt: "one" });
      expect(carried(reply), JSON.stringify(start)).not.toContain(SCOPED_TEXT);
    }
  });
});

describe("a Profile under Codex", () => {
  const rig = rigFor(CODEX_BUNDLE, "codex", "skills-codex-scope-");
  afterAll(rig.remove, { timeout: CAPPED_TREE_MS });
  const index = scopedTo(rig, ["openai/gpt-6-luna", "openai/gpt-6-sol"]);

  const meta = (id: string, provider: unknown): string => JSON.stringify({ type: "session_meta", payload: { id, model_provider: provider } });
  const turn = (model: unknown): string => JSON.stringify({ type: "turn_context", payload: { model } });

  const opened = async (...lines: string[]) => {
    const driven = await rig.install(index);
    const rollout = join(driven.home, "rollout.jsonl");
    writeFileSync(rollout, lines.map((line) => `${line}\n`).join(""));
    await driven.fire("SessionStart", { source: "startup", transcript_path: rollout });
    return { driven, rollout };
  };

  test("GPT-6 Luna and GPT-6 Sol, as the session record names them, receive the Rule scoped to them", async () => {
    for (const model of ["gpt-6-luna", "gpt-6-sol"]) {
      const { driven, rollout } = await opened(meta("s1", "openai"), turn(model));
      const { reply } = await driven.fire("UserPromptSubmit", { prompt: "one", transcript_path: rollout });
      expect(carried(reply), model).toContain(SCOPED_TEXT);
    }
  });

  test("another model receives every unscoped Rule and not the scoped one", async () => {
    const { driven, rollout } = await opened(meta("s1", "openai"), turn("gpt-6-astra"));
    const { reply } = await driven.fire("UserPromptSubmit", { prompt: "one", transcript_path: rollout });
    expect(carried(reply)).toContain(RULE_TEXT);
    expect(carried(reply)).not.toContain(SCOPED_TEXT);
  });

  test("a turn recorded on another model withdraws the scoped Rule at the next hook", async () => {
    const { driven, rollout } = await opened(meta("s1", "openai"), turn("gpt-6-luna"));
    await driven.fire("UserPromptSubmit", { prompt: "one", transcript_path: rollout });
    appendFileSync(rollout, `${turn("gpt-6-astra")}\n`);
    const { log } = await driven.fire("PreCompact", { transcript_path: rollout });
    expect(log.join("\n")).toContain("withdraw scoped: the session's model is now openai/gpt-6-astra");
    const { reply } = await driven.fire("UserPromptSubmit", { prompt: "two", transcript_path: rollout });
    expect(carried(reply)).toContain(RULE_TEXT);
    expect(carried(reply)).not.toContain(SCOPED_TEXT);
  });

  test("a session record that is missing, unreadable or another session's takes default", async () => {
    const cases: Array<[string, string[]]> = [
      ["no turn recorded yet", [meta("s1", "openai")]],
      ["another session's record", [meta("s2", "openai"), turn("gpt-6-astra")]],
      ["a provider that is not a name", [meta("s1", { name: "openai" }), turn("gpt-6-astra")]],
      ["lines that are not JSON", ["{not json", "garbage"]],
    ];
    for (const [named, lines] of cases) {
      const { driven, rollout } = await opened(...lines);
      const { reply } = await driven.fire("UserPromptSubmit", { prompt: "one", transcript_path: rollout });
      expect(carried(reply), named).not.toContain(SCOPED_TEXT);
    }
    const driven = await rig.install(index);
    const missing = join(driven.home, "absent.jsonl");
    await driven.fire("SessionStart", { source: "startup", transcript_path: missing });
    const { reply } = await driven.fire("UserPromptSubmit", { prompt: "one", transcript_path: missing });
    expect(carried(reply), "a record that does not exist").not.toContain(SCOPED_TEXT);
  });
});
