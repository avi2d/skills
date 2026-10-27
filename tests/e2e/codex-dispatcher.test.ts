import { afterAll, beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CODEX_BUNDLE, ENTRY } from "../../src/generate/bundle";
import { readPatch } from "../../src/dispatcher/codex-dispatcher";
import {
  alwaysOn,
  arrivesOnceAndAgainAfterCompaction,
  CAPPED_TREE_MS,
  declaring,
  HOOK_TEST_MS,
  readsWhatTheRepositoryDeclares,
  repoSwitchingTypescriptOff,
  rigFor,
  RULE_TEXT,
  walksOutsideAGitRepository,
  type Driven,
} from "./lib/hook-dispatcher";
import { carried } from "./lib/reply";

const RIG = rigFor(CODEX_BUNDLE, "codex", "skills-codex-");
afterAll(RIG.remove, { timeout: CAPPED_TREE_MS });
setDefaultTimeout(HOOK_TEST_MS);
const { install, indexWith, scratchRepo, temporary } = RIG;

const ALWAYS = alwaysOn(RIG);

const patch = (...files: string[]): Record<string, unknown> => ({
  tool_name: "apply_patch",
  tool_input: {
    command: ["*** Begin Patch", ...files.map((f) => `*** Update File: ${f}\n@@\n-old\n+new`), "*** End Patch"].join("\n"),
  },
});

describe("a Rule reaching the model", () => {
  let driven: Driven;
  beforeEach(async () => {
    driven = await install(ALWAYS);
  }, 30_000);

  test("it arrives on prompt submission, as the context Codex injects", async () => {
    await driven.fire("SessionStart", { source: "startup" });
    const { reply } = await driven.fire("UserPromptSubmit", { prompt: "make a start" });
    const specific = reply?.hookSpecificOutput;
    expect(specific?.hookEventName, "the reply names the wrong hook, so Codex discards it").toBe("UserPromptSubmit");
    expect(carried(reply)).toContain(RULE_TEXT);
  });

  test("it arrives as the core's own carriage, so every Dispatcher puts the same words in front of the model", async () => {
    await driven.fire("SessionStart", { source: "startup" });
    const { reply } = await driven.fire("UserPromptSubmit", { prompt: "make a start" });
    const { carriage } = await import("../../src/dispatcher/dispatch");
    expect(carried(reply)).toBe(carriage(ALWAYS, ["naming"]));
  });

  arrivesOnceAndAgainAfterCompaction(() => driven);

  test("the session Codex restarts after compacting is not a second session", async () => {
    await driven.fire("SessionStart", { source: "startup" });
    await driven.fire("UserPromptSubmit", { prompt: "one" });
    const restart = await driven.fire("SessionStart", { source: "compact" });
    expect(restart.log, "the compact restart was dispatched as a fresh session").toEqual([]);
  });
});

describe("a Rule that falls due at a patch", () => {
  const onWrite = indexWith({
    rules: [{ name: "naming", triggers: [{ predicate: "file-matches", glob: "**/*.ts" }], text: RULE_TEXT }],
  });

  test("it denies the call, and rides back as the reason Codex shows the model", async () => {
    const driven = await install(onWrite);
    await driven.fire("SessionStart", { source: "startup" });
    const { reply } = await driven.fire("PreToolUse", patch("src/a.ts"));
    const specific = reply?.hookSpecificOutput;
    expect(specific?.hookEventName).toBe("PreToolUse");
    expect(specific?.permissionDecision, "the write the Rule governs was allowed to land before the Rule arrived").toBe("deny");
    expect(carried(reply)).toContain(RULE_TEXT);
  });

  test("a patch is matched on every file in it, not only the first", async () => {
    const driven = await install(onWrite);
    await driven.fire("SessionStart", { source: "startup" });
    const { reply } = await driven.fire("PreToolUse", patch("README.md", "src/a.ts"));
    expect(carried(reply), "only the first path in the patch was asked about").toContain(RULE_TEXT);
  });

  test("a patch touching nothing it governs is left alone", async () => {
    const driven = await install(onWrite);
    await driven.fire("SessionStart", { source: "startup" });
    const { reply } = await driven.fire("PreToolUse", patch("README.md"));
    expect(reply, "a call the Rules say nothing about was interfered with").toBeUndefined();
  });

  test("it counts as injected, so the next prompt does not send it again", async () => {
    const driven = await install(onWrite);
    await driven.fire("SessionStart", { source: "startup" });
    await driven.fire("PreToolUse", patch("src/a.ts"));
    const after = await driven.fire("UserPromptSubmit", { prompt: "carry on" });
    expect(carried(after.reply)).toBeUndefined();
  });
});

describe("the paths inside a patch", () => {
  test("every header that names a file is one path", () => {
    expect(readPatch("*** Begin Patch\n*** Add File: a.txt\n+hi\n*** End Patch").writes).toEqual(["a.txt"]);
    expect(readPatch("*** Begin Patch\n*** Update File: src/a.ts\n*** Delete File: b.md\n*** End Patch").writes).toEqual([
      "src/a.ts",
      "b.md",
    ]);
  });

  test("a rename adds no second path, because the header above it already named the file", () => {
    expect(readPatch("*** Begin Patch\n*** Update File: a.ts\n*** Move to: b.ts\n*** End Patch").writes).toEqual(["a.ts"]);
  });

  test("anything that is not a patch names nothing", () => {
    expect(readPatch("rm -rf /").writes).toEqual([]);
  });
});

describe("a Rule's arrival, read back from the rollout", () => {
  const item = (payload: Record<string, unknown>): string =>
    JSON.stringify({ timestamp: new Date(Date.now() + 1000).toISOString(), type: "response_item", payload });
  const answer = (): string => item({ type: "message", role: "assistant", content: [{ type: "output_text", text: "ok" }] });
  const added = (text: string): string =>
    item({
      type: "message",
      role: "developer",
      content: [{ type: "input_text", text }],
      internal_chat_message_metadata_passthrough: { content_item_kinds: ["hooks.additional_context"] },
    });
  const record = (path: string, ...lines: string[]): void => writeFileSync(path, `${lines.join("\n")}\n`);

  test("a reply the rollout holds is checked, and nothing is said about it", async () => {
    const driven = await install(ALWAYS);
    const rollout = join(driven.home, "rollout.jsonl");
    await driven.fire("SessionStart", { source: "startup", transcript_path: rollout });
    const { reply } = await driven.fire("UserPromptSubmit", { prompt: "one", transcript_path: rollout });
    record(rollout, added(carried(reply) ?? expect.unreachable("the hook carried nothing")), answer());
    const { log } = await driven.fire("Stop", { transcript_path: rollout, last_assistant_message: "ok" });
    expect(log.join("\n")).not.toContain("broken");
  });

  test("a reply Codex never recorded is reported by name at the next hook", async () => {
    const driven = await install(ALWAYS);
    const rollout = join(driven.home, "rollout.jsonl");
    await driven.fire("SessionStart", { source: "startup", transcript_path: rollout });
    await driven.fire("UserPromptSubmit", { prompt: "one", transcript_path: rollout });
    record(rollout, item({ type: "function_call", name: "shell", arguments: "{}", call_id: "c1" }), item({ type: "function_call_output", call_id: "c1", output: "ok" }), answer());
    const { log } = await driven.fire("Stop", { transcript_path: rollout, last_assistant_message: "ok" });
    expect(log.join("\n")).toContain(
      "broken naming: it was injected, and the transcript that followed recorded no trace of it, so it never reached the model",
    );
  });

  test("a thread Codex keeps no rollout for is said to be unchecked, rather than trusted", async () => {
    const driven = await install(ALWAYS);
    await driven.fire("SessionStart", { source: "startup", transcript_path: null });
    const { log } = await driven.fire("UserPromptSubmit", { prompt: "one", transcript_path: null });
    expect(log.join("\n")).toContain("broken dispatcher: naming went out, and the harness named no transcript to check their arrival against");
  });
});

describe("what a patch changes", () => {
  test("an added file is its `+` lines, whole", () => {
    expect(readPatch("*** Begin Patch\n*** Add File: a.ts\n+one\n+two\n*** End Patch").changes).toEqual([
      { path: "a.ts", content: "one\ntwo" },
    ]);
  });

  test("an updated file is one replacement per hunk, context on both sides of it", () => {
    const command = [
      "*** Begin Patch",
      "*** Update File: src/a.ts",
      "*** Move to: src/b.ts",
      "@@ function a() {",
      " keep();",
      "-drop();",
      "+add();",
      "@@",
      " last();",
      "+after();",
      "*** End of File",
      "*** Delete File: gone.ts",
      "*** End Patch",
    ].join("\n");
    expect(readPatch(command).changes).toEqual([
      {
        path: "src/a.ts",
        edits: [
          { old: "keep();\ndrop();\n", new: "keep();\nadd();\n", context: "function a() {" },
          { old: "last();\n", new: "last();\nafter();\n", atEnd: true },
        ],
      },
    ]);
  });

  test("anything that is not a patch changes nothing", () => {
    expect(readPatch("rm -rf /").changes).toEqual([]);
  });
});

describe("a patch carrying a comment a Rule forbids", () => {
  const FORBIDDING = indexWith({
    rules: [{ name: "comment-discipline", triggers: [{ predicate: "always" }], text: RULE_TEXT, forbid: "comments" }],
  });
  const apply = (...lines: string[]) => ({
    tool_name: "apply_patch",
    tool_input: { command: ["*** Begin Patch", ...lines, "*** End Patch"].join("\n") },
  });

  test("an added file carrying one is denied, and the reason names it and what to do instead", async () => {
    const driven = await install(FORBIDDING);
    await driven.fire("SessionStart", { source: "startup" });
    const { reply } = await driven.fire("PreToolUse", apply("*** Add File: src/a.ts", "+// eslint-disable-next-line", "+run();"));
    const specific = reply?.hookSpecificOutput;
    expect(specific?.permissionDecision, "the patch landed carrying the comment").toBe("deny");
    expect(carried(reply)).toContain("src/a.ts:1 carries the machine-read directive `eslint-disable-next-line`");
    expect(carried(reply)).toContain("Fix what the tool is reporting, or stop running the tool on this file");
  });

  test("an update is placed in the file on disk, and only what the hunk adds is judged", async () => {
    const cwd = temporary("skills-codex-project-");
    mkdirSync(join(cwd, "src"));
    writeFileSync(join(cwd, "src/b.ts"), "// see #41\none();\ntwo();\n");
    const driven = await install(FORBIDDING);
    await driven.fire("SessionStart", { source: "startup", cwd });

    const clean = await driven.fire("PreToolUse", { ...apply("*** Update File: src/b.ts", "@@", " one();", "-two();", "+three();"), cwd });
    expect(clean.reply, "a patch was refused for the pointer the file already held").toBeUndefined();

    const pointing = await driven.fire("PreToolUse", { ...apply("*** Update File: src/b.ts", "@@", " one();", "+// see #9110"), cwd });
    expect(carried(pointing.reply)).toContain('src/b.ts:3 points at a record or a ticket ("#9110")');
  });
});

describe("a patch carrying a separator a Rule forbids in a doc", () => {
  const FORBIDDING = indexWith({
    rules: [{ name: "writing-for-people", triggers: [{ predicate: "always" }], text: RULE_TEXT, forbid: "prose" }],
  });
  const adding = (path: string) => ({
    tool_name: "apply_patch",
    tool_input: { command: ["*** Begin Patch", `*** Add File: ${path}`, "+It builds — and then it ships.", "*** End Patch"].join("\n") },
  });

  const repository = (): string => {
    const dir = temporary("skills-codex-repository-");
    mkdirSync(join(dir, ".git"));
    return dir;
  };

  test("an added people doc carrying an em dash is denied, and the reason says to end the sentence or use a comma", async () => {
    const cwd = repository();
    const driven = await install(FORBIDDING);
    await driven.fire("SessionStart", { source: "startup", cwd });
    const { reply } = await driven.fire("PreToolUse", { ...adding("docs/guide.md"), cwd });
    expect(reply?.hookSpecificOutput?.permissionDecision, "the patch landed carrying the em dash").toBe("deny");
    expect(carried(reply)).toContain("docs/guide.md:1 carries `—`, an em dash. End the sentence, or use a comma");
  });

  test.each(["docs/adr/0001-a-record.md", "CHANGELOG.md"])("the same patch adding %s is let through", async (path) => {
    const cwd = repository();
    const driven = await install(FORBIDDING);
    await driven.fire("SessionStart", { source: "startup", cwd });
    const { reply } = await driven.fire("PreToolUse", { ...adding(path), cwd });
    expect(reply).toBeUndefined();
  });
});

describe("the Dispatcher getting out of the way", () => {
  test("an index generated for another harness says so in the log and refuses nothing", async () => {
    const driven = await install({ ...ALWAYS, harness: "claude-code" });
    const { reply, log } = await driven.fire("UserPromptSubmit", { prompt: "make a start" });
    expect(reply, "a broken Dispatcher interfered with the turn").toBeUndefined();
    expect(log.join("\n")).toContain("broken dispatcher");
    expect(log.join("\n")).toContain("claude-code");
  });

  test("a payload that is not JSON still ends the hook cleanly", async () => {
    const driven = await install(ALWAYS);
    const proc = Bun.spawn([process.execPath, join(driven.home, "..", "dispatcher", ENTRY), "UserPromptSubmit"], {
      stdin: new TextEncoder().encode("not json"),
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, HOME: driven.home, XDG_STATE_HOME: join(driven.home, ".local", "state") },
    });
    const [out, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
    await proc.exited;
    expect(proc.exitCode, `the hook exited ${proc.exitCode}, which Codex reads as a refusal: ${stderr}`).toBe(0);
    expect(stderr, "stderr on a non-zero exit is the reason Codex blocks with").toBe("");
    expect(JSON.parse(out)).toHaveProperty("hookSpecificOutput");
  });
});

describe("the dispatch log", () => {
  test("every action produced has a line, on the one log every Dispatcher shares", async () => {
    const driven = await install(ALWAYS);
    await driven.fire("SessionStart", { source: "startup" });
    const { log } = await driven.fire("UserPromptSubmit", { prompt: "make a start" });
    expect(log.length, "a Rule fired and nothing recorded that it had").toBeGreaterThan(0);
    expect(log.join("\n")).toContain("naming");
    expect(log.every((line) => line.includes(" s1 ")), "a log line does not say which session it was").toBe(true);
  });
});

describe("what the repository's package.json declares", () => {
  readsWhatTheRepositoryDeclares(RIG);

  test("a Rule the project switches off stays off at a later patch, in the next hook process", async () => {
    const driven = await install(declaring(RIG));
    const dir = await repoSwitchingTypescriptOff(driven);
    const patched = await driven.fire("PreToolUse", { cwd: dir, ...patch("src/a.ts") });
    expect(patched.reply, "the switched-off Rule was delivered").toBeUndefined();
  });
});

walksOutsideAGitRepository(RIG);

describe("the verdict gate at the Stop hook", () => {
  test("a hold Codex sends back as the next prompt does not reset the count, so failing checks still let the session go", async () => {
    const scratch = scratchRepo("commands:\n  test: echo '(fail) the thing'; exit 1\n");
    const driven = await install(indexWith());
    await driven.fire("SessionStart", { source: "startup", cwd: scratch.dir });
    await driven.fire("UserPromptSubmit", { prompt: "change it", cwd: scratch.dir });

    const replies: Array<Record<string, unknown> | undefined> = [];
    for (let n = 1; n <= 5; n += 1) {
      writeFileSync(join(scratch.dir, "a.txt"), `edit ${n}\n`);
      const { reply } = await driven.fire("Stop", { cwd: scratch.dir, last_assistant_message: "done", stop_hook_active: n > 1 });
      replies.push(reply);
      if (reply?.decision !== "block") break;
      await driven.fire("UserPromptSubmit", { prompt: reply.reason, cwd: scratch.dir });
    }
    expect(replies.map((reply) => reply?.decision ?? "let go")).toEqual(["block", "block", "let go"]);
    expect(replies[0]?.reason).toContain("(fail) the thing");
    expect(replies[2]?.systemMessage).toContain("let go with it failing");
  }, 30_000);

  test("a stop where nothing changed since the prompt runs nothing", async () => {
    const scratch = scratchRepo("commands:\n  test: exit 1\n");
    const driven = await install(indexWith());
    await driven.fire("SessionStart", { source: "startup", cwd: scratch.dir });
    await driven.fire("UserPromptSubmit", { prompt: "what is this", cwd: scratch.dir });
    const { reply, log } = await driven.fire("Stop", { cwd: scratch.dir, last_assistant_message: "it is a repo" });
    expect(reply).toBeUndefined();
    expect(log.join("\n")).not.toContain(" verify ");
  });
});

describe("a read of a Body's SKILL.md", () => {
  test("Codex reads it through its shell, so the shell call that ran logs no pull", async () => {
    const SKILL = "library/writing/references/unslop/SKILL.md";
    const driven = await install(indexWith({ hub: [{ name: "unslop", skill: SKILL }] }));
    const body = join(driven.home, "library", "writing", "references", "unslop");
    mkdirSync(body, { recursive: true });
    writeFileSync(join(body, "SKILL.md"), "# unslop\n");
    const entry = join(driven.home, ".agents", "skills", "unslop");
    mkdirSync(dirname(entry), { recursive: true });
    symlinkSync(body, entry);
    await driven.fire("SessionStart", { source: "startup" });
    const { log } = await driven.fire("PostToolUse", {
      tool_name: "Bash",
      tool_input: { command: `cat ${join(entry, "SKILL.md")}` },
      tool_response: "# unslop\n",
    });
    expect(log.join("\n")).not.toContain("pull unslop");
  });
});
