import { afterAll, beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CLAUDE_BUNDLE } from "../../src/generate/bundle";
import { carriage } from "../../src/dispatcher/dispatch";
import { CONTEXT_LIMIT, HAND_OFF_WAIT_SECONDS, PROMPT_HOOKS } from "../../src/dispatcher/claude-dispatcher";
import { counted, git, type Scratch } from "./gated-repo";
import { carriageFor } from "../lib/dispatch";
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
  type Fired,
} from "./lib/hook-dispatcher";
import { carried, type Reply } from "./lib/reply";

const RIG = rigFor(CLAUDE_BUNDLE, "claude-code", "skills-cc-");
afterAll(RIG.remove, { timeout: CAPPED_TREE_MS });
setDefaultTimeout(HOOK_TEST_MS);
const { install, indexWith, scratchRepo, temporary } = RIG;

const ALWAYS = alwaysOn(RIG);

describe("a Rule reaching the model", () => {
  let driven: Driven;
  beforeEach(async () => {
    driven = await install(ALWAYS);
  }, HOOK_TEST_MS);

  test("it arrives on prompt submission, as the context Claude Code injects", async () => {
    await driven.fire("SessionStart", { source: "startup" });
    const { reply } = await driven.fire("UserPromptSubmit", { prompt: "make a start" });
    const specific = reply?.hookSpecificOutput;
    expect(specific?.hookEventName, "the reply names the wrong hook, so Claude Code discards it").toBe("UserPromptSubmit");
    expect(carried(reply)).toContain(RULE_TEXT);
  });

  test("it arrives as the core's own carriage, so both Dispatchers put the same words in front of the model", async () => {
    await driven.fire("SessionStart", { source: "startup" });
    const { reply } = await driven.fire("UserPromptSubmit", { prompt: "make a start" });
    expect(carried(reply)).toBe(carriage(ALWAYS, ["naming"]));
  });

  arrivesOnceAndAgainAfterCompaction(() => driven);

  test("every action is in the dispatch log", async () => {
    await driven.fire("SessionStart", { source: "startup" });
    const { log } = await driven.fire("UserPromptSubmit", { prompt: "one" });
    expect(log.join("\n")).toContain("inject naming");
  });
});

describe("a Rule denying a tool call", () => {
  const GUARD = indexWith({
    rules: [
      {
        name: "no-force-push",
        triggers: [{ predicate: "tool-call", tool: "Bash", argument: "command", matches: "*push*" }],
        text: RULE_TEXT,
      },
    ],
  });

  test("the call is denied, and the Rule is the reason", async () => {
    const driven = await install(GUARD);
    await driven.fire("SessionStart", { source: "startup" });
    const { reply } = await driven.fire("PreToolUse", { tool_name: "Bash", tool_input: { command: "git push --force" } });
    const specific = reply?.hookSpecificOutput;
    expect(specific?.permissionDecision, "the call was allowed, so the write lands before the Rule arrives").toBe("deny");
    expect(carried(reply)).toContain(RULE_TEXT);
  });

  test("a call the Rule says nothing about is not denied", async () => {
    const driven = await install(GUARD);
    await driven.fire("SessionStart", { source: "startup" });
    const { reply } = await driven.fire("PreToolUse", { tool_name: "Bash", tool_input: { command: "git status" } });
    expect(reply, "a Rule that did not match refused a call anyway").toBeUndefined();
  });

  test("a write is matched on the path Claude Code spells `file_path`", async () => {
    const driven = await install(
      indexWith({
        rules: [{ name: "typescript", triggers: [{ predicate: "file-matches", glob: "**/*.ts" }], text: RULE_TEXT }],
      }),
    );
    await driven.fire("SessionStart", { source: "startup" });
    const { reply } = await driven.fire("PreToolUse", { tool_name: "Write", tool_input: { file_path: "src/main.ts" } });
    expect(carried(reply), "the path argument was read wrong, so no file-matches Rule can ever fire").toContain(RULE_TEXT);
  });
});

const stamped = (entry: Record<string, unknown>): string => JSON.stringify({ timestamp: new Date(Date.now() + 1000).toISOString(), ...entry });
const answer = (): string => stamped({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "ok" }] } });
const added = (text: string): string =>
  stamped({ type: "attachment", attachment: { type: "hook_additional_context", content: [text], hookEvent: "UserPromptSubmit" } });
const record = (path: string, ...entries: string[]): void => {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, `${entries.join("\n")}\n`);
};

describe("a Rule's arrival, read back from the transcript", () => {
  const refused = (text: string): string =>
    stamped({
      type: "user",
      toolDenialKind: "permission-rule",
      message: { role: "user", content: [{ type: "tool_result", content: text, is_error: true, tool_use_id: "toolu_1" }] },
    });
  const LOST = "broken naming: it was injected, and the transcript that followed recorded no trace of it, so it never reached the model";
  const promptedWithTranscript = async (): Promise<{ driven: Driven; transcript: string; reply: Reply | undefined }> => {
    const driven = await install(ALWAYS);
    const transcript = join(driven.home, "s1.jsonl");
    await driven.fire("SessionStart", { source: "startup", transcript_path: transcript });
    const { reply } = await driven.fire("UserPromptSubmit", { prompt: "one", transcript_path: transcript });
    return { driven, transcript, reply };
  };

  test("a reply the transcript holds is checked once, and nothing is said about it", async () => {
    const { driven, transcript, reply } = await promptedWithTranscript();
    record(transcript, added(carried(reply) ?? expect.unreachable("the hook carried nothing")), answer());
    const next = await driven.fire("PreToolUse", { tool_name: "Bash", tool_input: { command: "ls" }, transcript_path: transcript });
    const end = await driven.fire("SessionEnd", { transcript_path: transcript });
    expect([...next.log, ...end.log].join("\n")).not.toContain("broken");
  });

  test("a reply the harness never recorded is reported by name at the next hook", async () => {
    const { driven, transcript } = await promptedWithTranscript();
    record(transcript, answer());
    const { log } = await driven.fire("PreToolUse", { tool_name: "Bash", tool_input: { command: "ls" }, transcript_path: transcript });
    expect(log.join("\n")).toContain(LOST);
  });

  test("a transcript not yet written past the hook is waited on, and the session's end reads it as it stands", async () => {
    const { driven, transcript } = await promptedWithTranscript();
    const early = await driven.fire("Stop", { transcript_path: transcript });
    expect(early.log.join("\n"), "a transcript that had not caught up was read as a loss").not.toContain("naming");
    record(transcript, stamped({ type: "user", message: { role: "user", content: "one" } }));
    const end = await driven.fire("SessionEnd", { transcript_path: transcript });
    expect(end.log.join("\n")).toContain(LOST);
  });

  test("a Rule refused inside a sub-agent is looked for in that sub-agent's transcript", async () => {
    const driven = await install(
      indexWith({
        rules: [{ name: "naming", triggers: [{ predicate: "tool-call", tool: "Bash", argument: "command", matches: "*push*" }], text: RULE_TEXT }],
      }),
    );
    const transcript = join(driven.home, "s1.jsonl");
    await driven.fire("SessionStart", { source: "startup", transcript_path: transcript });
    const { reply } = await driven.fire("PreToolUse", {
      tool_name: "Bash",
      tool_input: { command: "git push" },
      transcript_path: transcript,
      agent_id: "a1",
    });
    record(join(driven.home, "s1", "subagents", "agent-a1.jsonl"), refused(carried(reply) ?? expect.unreachable("the hook carried nothing")), answer());
    record(transcript, answer());
    const { log } = await driven.fire("Stop", { transcript_path: transcript });
    expect(log.join("\n"), "the refusal was looked for in the main transcript, where Claude Code never writes it").not.toContain("broken");
  });
});

describe("Rules past what Claude Code shows of one hook, shared out among the prompt hooks", () => {
  const long = (name: string) => ({
    name,
    triggers: [{ predicate: "always" as const }],
    text: `# ${name}\n\n${`Every ${name} sentence is a sentence the model has to read. `.repeat(80)}`,
  });
  const LONG = indexWith({ rules: [long("alpha"), long("beta"), long("gamma")] });
  const ALL = ["alpha", "beta", "gamma"];

  const prompt = (driven: Driven, payload: Record<string, unknown>): Promise<Fired[]> =>
    Promise.all(
      Array.from({ length: PROMPT_HOOKS }, (_, i) => driven.fire("UserPromptSubmit", payload, i === 0 ? undefined : i + 1)),
    );

  test("each prompt hook carries a part within the limit, and together they carry every Rule whole, once", async () => {
    const driven = await install(LONG);
    await driven.fire("SessionStart", { source: "startup" });
    const said = (await prompt(driven, { prompt: "one", prompt_id: "p1" })).map(({ reply }) => carried(reply));
    expect(carriageFor(LONG, ALL).length, "the Rules fit one hook, so this proves nothing").toBeGreaterThan(CONTEXT_LIMIT);
    for (const part of said) expect(part?.length ?? 0).toBeLessThanOrEqual(CONTEXT_LIMIT);
    const together = said.filter((part) => part !== undefined).join("\n");
    for (const rule of LONG.rules) expect(together.split(rule.text), `${rule.name} is not whole in exactly one part`).toHaveLength(2);
    expect(said[0], "the first prompt hook no longer opens with the core's own carriage").toBe(carriage(LONG, ["alpha", "beta"]));
  });

  test("a prompt with nothing due lets every prompt hook go at once, with nothing to say", async () => {
    const driven = await install(LONG);
    await driven.fire("SessionStart", { source: "startup" });
    await prompt(driven, { prompt: "one", prompt_id: "p1" });
    const began = Date.now();
    const later = await prompt(driven, { prompt: "two", prompt_id: "p2" });
    expect(later.map(({ reply }) => reply), "an earlier prompt's part was handed out again").toEqual(later.map(() => undefined));
    expect(Date.now() - began, "a later prompt hook sat out its wait for a part that was never coming").toBeLessThan(HAND_OFF_WAIT_SECONDS * 1000);
  }, HOOK_TEST_MS);

  test("a first prompt hook that breaks still lets the others go at once", async () => {
    const driven = await install({ ...LONG, harness: "pi" });
    const began = Date.now();
    const said = await prompt(driven, { prompt: "one", prompt_id: "p1" });
    expect(said.map(({ reply }) => reply)).toEqual(said.map(() => undefined));
    expect(Date.now() - began, "the prompt was held for the whole wait because the first hook broke").toBeLessThan(HAND_OFF_WAIT_SECONDS * 1000);
    expect(driven.log().join("\n")).toContain("broken dispatcher");
  }, HOOK_TEST_MS);

  test("with no prompt_id to share it by, the first carries it all, says it will be previewed, and the rest carry nothing", async () => {
    const driven = await install(LONG);
    await driven.fire("SessionStart", { source: "startup" });
    const said = await prompt(driven, { prompt: "one" });
    expect(said.map(({ reply }) => carried(reply))).toEqual([carriage(LONG, ALL), ...said.slice(1).map(() => undefined)]);
    expect(driven.log().join("\n")).toContain("broken dispatcher: Claude Code named no prompt_id");
  });

  test("the transcript holding every part reads as delivered, and one holding the first alone names what the rest carried", async () => {
    for (const kept of [PROMPT_HOOKS, 1]) {
      const driven = await install(LONG);
      const transcript = join(driven.home, "s1.jsonl");
      await driven.fire("SessionStart", { source: "startup", transcript_path: transcript });
      const said = await prompt(driven, { prompt: "one", prompt_id: "p1", transcript_path: transcript });
      const recorded = said.slice(0, kept).flatMap(({ reply }) => carried(reply) ?? []);
      record(transcript, ...recorded.map(added), answer());
      const { log } = await driven.fire("PreToolUse", { tool_name: "Bash", tool_input: { command: "ls" }, transcript_path: transcript });
      const broken = log.filter((line) => line.includes(" broken ")).map((line) => line.split(" ")[3]);
      expect(broken, `with ${kept} of the prompt hooks' replies recorded`).toEqual(kept === 1 ? ["gamma:"] : []);
    }
  });

  test("a session that ends takes the parts it handed out with it", async () => {
    const driven = await install(LONG);
    await driven.fire("SessionStart", { source: "startup" });
    await prompt(driven, { prompt: "one", prompt_id: "p1" });
    const handed = join(driven.home, ".local", "state", "skills", "claude", "s1.parts");
    expect(existsSync(handed), "nothing was handed out, so this proves nothing").toBe(true);
    await driven.fire("SessionEnd", {});
    expect(existsSync(handed)).toBe(false);
  });
});

describe("a write carrying a comment a Rule forbids", () => {
  const FORBIDDING = indexWith({
    rules: [{ name: "comment-discipline", triggers: [{ predicate: "always" }], text: RULE_TEXT, forbid: "comments" }],
  });
  const DIRECTIVE = "// @ts-ignore the types are wrong";

  const project = (files: Record<string, string>): string => {
    const dir = temporary("skills-cc-project-");
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(join(dir, path, ".."), { recursive: true });
      writeFileSync(join(dir, path), text);
    }
    return dir;
  };

  test("a Write is denied, and the reason names the comment and what to do instead", async () => {
    const driven = await install(FORBIDDING);
    await driven.fire("SessionStart", { source: "startup" });
    const write = { tool_name: "Write", tool_input: { file_path: "src/a.ts", content: `${DIRECTIVE}\nconst a = 1;\n` } };
    const { reply, log } = await driven.fire("PreToolUse", write);
    const specific = reply?.hookSpecificOutput;
    expect(specific?.permissionDecision, "the write landed carrying the comment").toBe("deny");
    expect(carried(reply)).toContain("src/a.ts:1 carries the machine-read directive `@ts-ignore`");
    expect(carried(reply)).toContain("Fix what the tool is reporting, or stop running the tool on this file");
    expect(log.some((line) => line.includes("refuse comment-discipline: src/a.ts:1")), log.join("\n")).toBe(true);
  });

  test("the same Write is denied again, however often it is tried", async () => {
    const driven = await install(FORBIDDING);
    await driven.fire("SessionStart", { source: "startup" });
    const write = { tool_name: "Write", tool_input: { file_path: "src/a.ts", content: `${DIRECTIVE}\n` } };
    await driven.fire("PreToolUse", write);
    const { reply } = await driven.fire("PreToolUse", write);
    expect(reply?.hookSpecificOutput?.permissionDecision).toBe("deny");
  });

  test("an Edit is placed in the file on disk, so the reason names the line it would land on", async () => {
    const cwd = project({ "src/b.ts": "one();\ntwo();\nthree();\n" });
    const driven = await install(FORBIDDING);
    await driven.fire("SessionStart", { source: "startup", cwd });
    const edit = { tool_name: "Edit", tool_input: { file_path: "src/b.ts", old_string: "two();", new_string: "/** Two. */\ntwo();" } };
    const { reply } = await driven.fire("PreToolUse", { ...edit, cwd });
    expect(carried(reply)).toContain("src/b.ts:2 opens a doc block");
  });

  test("an Edit to a file that already held a banned comment is not denied for it", async () => {
    const cwd = project({ "src/c.ts": `${DIRECTIVE}\nconst c = 1;\n` });
    const driven = await install(FORBIDDING);
    await driven.fire("SessionStart", { source: "startup", cwd });
    const edit = { tool_name: "Edit", tool_input: { file_path: join(cwd, "src/c.ts"), old_string: "const c = 1;", new_string: "const c = 2;" } };
    const { reply } = await driven.fire("PreToolUse", { ...edit, cwd });
    expect(reply, "a write was refused for a comment it did not add").toBeUndefined();
  });

  test("an Edit with no old_string creates the file, so what it carries is judged as the whole of it", async () => {
    const cwd = project({});
    const driven = await install(FORBIDDING);
    await driven.fire("SessionStart", { source: "startup", cwd });
    const edit = { tool_name: "Edit", tool_input: { file_path: "src/new.ts", old_string: "", new_string: `run();\n${DIRECTIVE}\n` } };
    const { reply } = await driven.fire("PreToolUse", { ...edit, cwd });
    expect(reply?.hookSpecificOutput?.permissionDecision).toBe("deny");
    expect(carried(reply)).toContain("src/new.ts:2 carries the machine-read directive `@ts-ignore`");
  });

  test("a Write carrying only the comments the Rule keeps is let through", async () => {
    const driven = await install(FORBIDDING);
    await driven.fire("SessionStart", { source: "startup" });
    const write = { tool_name: "Write", tool_input: { file_path: "src/a.ts", content: "// The caller holds the lock.\nrun();\n" } };
    const { reply } = await driven.fire("PreToolUse", write);
    expect(reply).toBeUndefined();
  });
});

describe("a write carrying a separator a Rule forbids in a doc", () => {
  const FORBIDDING = indexWith({
    rules: [{ name: "writing-for-people", triggers: [{ predicate: "always" }], text: RULE_TEXT, forbid: "prose" }],
  });
  const DASHED = "It builds — and then it ships.\n";

  const repository = (): string => {
    const dir = temporary("skills-cc-repository-");
    mkdirSync(join(dir, ".git"));
    return dir;
  };

  test("a Write to a people doc is denied, and the reason names the character and says to end the sentence or use a comma", async () => {
    const cwd = repository();
    const driven = await install(FORBIDDING);
    await driven.fire("SessionStart", { source: "startup", cwd });
    const write = { tool_name: "Write", tool_input: { file_path: join(cwd, "docs/guide.md"), content: DASHED } };
    const { reply, log } = await driven.fire("PreToolUse", { ...write, cwd });
    expect(reply?.hookSpecificOutput?.permissionDecision, "the write landed carrying the em dash").toBe("deny");
    expect(carried(reply)).toContain("docs/guide.md:1 carries `—`, an em dash. End the sentence, or use a comma");
    expect(log.some((line) => line.includes("refuse writing-for-people: docs/guide.md:1")), log.join("\n")).toBe(true);
  });

  test.each(["docs/adr/0001-a-record.md", "CHANGELOG.md"])("the same Write to %s is let through", async (path) => {
    const cwd = repository();
    const driven = await install(FORBIDDING);
    await driven.fire("SessionStart", { source: "startup", cwd });
    const { reply } = await driven.fire("PreToolUse", { tool_name: "Write", tool_input: { file_path: path, content: DASHED }, cwd });
    expect(reply).toBeUndefined();
  });
});

describe("the state one hook process leaves for the next", () => {
  test("a session that ends takes its state with it, so a reused id starts afresh", async () => {
    const driven = await install(ALWAYS);
    await driven.fire("SessionStart", { source: "startup" });
    await driven.fire("UserPromptSubmit", { prompt: "one" });
    await driven.fire("SessionEnd", {});
    const after = await driven.fire("UserPromptSubmit", { prompt: "two" });
    expect(carried(after.reply), "the state outlived the session, so a fresh one starts holding Rules it never saw").toContain(RULE_TEXT);
  });

  test("an index generated for another harness is refused in the log rather than acted on", async () => {
    const driven = await install({ ...ALWAYS, harness: "pi" });
    const { reply, log } = await driven.fire("UserPromptSubmit", { prompt: "one" });
    expect(reply).toBeUndefined();
    expect(log.join("\n")).toContain("broken dispatcher");
  });
});

describe("what the repository's package.json declares", () => {
  readsWhatTheRepositoryDeclares(RIG);

  test("a Rule the project switches off stays off at a later tool call, in the next hook process", async () => {
    const driven = await install(declaring(RIG));
    const dir = await repoSwitchingTypescriptOff(driven);
    const write = await driven.fire("PreToolUse", { cwd: dir, tool_name: "Write", tool_input: { file_path: join(dir, "a.ts"), content: "" } });
    expect(write.reply, "the switched-off Rule was delivered").toBeUndefined();
  });
});

walksOutsideAGitRepository(RIG);

describe("the verdict gate at the Stop hook", () => {
  async function gated(command: string | undefined, setUp = true): Promise<{ driven: Driven; scratch: Scratch; runs: () => number }> {
    const scratch = scratchRepo(undefined, { setUp });
    if (command !== undefined) {
      writeFileSync(join(scratch.dir, ".no-mistakes.yaml"), `commands:\n  test: ${counted(scratch.counter, command)}\n`);
      git(scratch.dir, "add", "-A");
      git(scratch.dir, "commit", "-q", "-m", "gate");
      git(scratch.dir, "update-ref", "refs/remotes/origin/main", "HEAD");
    }
    const driven = await install(indexWith());
    await driven.fire("SessionStart", { source: "startup", cwd: scratch.dir });
    await driven.fire("UserPromptSubmit", { prompt: "change it", cwd: scratch.dir });
    const runs = (): number => (existsSync(scratch.counter) ? readFileSync(scratch.counter, "utf8").split("\n").filter(Boolean).length : 0);
    return { driven, scratch, runs };
  }

  const edit = (scratch: Scratch, n: number): void => writeFileSync(join(scratch.dir, "a.txt"), `edit ${n}\n`);

  const stopsUnverified = async (driven: Driven, cwd: string): Promise<void> => {
    const { reply, log } = await driven.fire("Stop", { cwd });
    expect(reply).toBeUndefined();
    expect(log.join("\n")).not.toContain(" verify ");
  };

  test("checks that keep failing hold the stop with what they printed, and let the session go after the bound", async () => {
    const { driven, scratch, runs } = await gated("echo '(fail) the thing'; exit 1");
    const replies: Array<Record<string, unknown> | undefined> = [];
    const logged: string[] = [];
    for (let n = 1; n <= 5; n += 1) {
      edit(scratch, n);
      const { reply, log } = await driven.fire("Stop", { cwd: scratch.dir });
      replies.push(reply);
      logged.push(...log);
      if (reply?.decision !== "block") break;
    }
    expect(replies.map((reply) => reply?.decision ?? "let go")).toEqual(["block", "block", "let go"]);
    expect(replies[0]?.reason).toContain("(fail) the thing");
    expect(replies[0]?.reason).toContain("hold 1 of 2");
    expect(replies[2]?.systemMessage, "the session was let go and the human was not told").toContain("let go with it failing");
    expect(logged.filter((line) => / (verify|hold|release) /.test(line)).map((line) => line.split(" ")[2])).toEqual([
      "verify",
      "hold",
      "verify",
      "hold",
      "verify",
      "release",
    ]);
    expect(runs()).toBe(3);
  }, HOOK_TEST_MS);

  test("a stop where nothing changed since the prompt runs nothing", async () => {
    const { driven, scratch, runs } = await gated("exit 1");
    const { reply } = await driven.fire("Stop", { cwd: scratch.dir });
    expect(reply).toBeUndefined();
    expect(runs()).toBe(0);
  });

  test("a tree the checks passed is not verified again at the next stop", async () => {
    const { driven, scratch, runs } = await gated("exit 0");
    edit(scratch, 1);
    const first = await driven.fire("Stop", { cwd: scratch.dir });
    const second = await driven.fire("Stop", { cwd: scratch.dir });
    expect([first.reply, second.reply]).toEqual([undefined, undefined]);
    expect(first.log.join("\n")).toContain(" passed ");
    expect(runs()).toBe(1);
  });

  test("a clone no-mistakes was never set up for runs nothing at the stop, whatever its file declares", async () => {
    const { driven, scratch, runs } = await gated("exit 1", false);
    edit(scratch, 1);
    await stopsUnverified(driven, scratch.dir);
    expect(runs()).toBe(0);
  });

  test("a session in a linked worktree of a gated repository runs nothing at the stop", async () => {
    const { driven, scratch, runs } = await gated("exit 1");
    const linked = join(scratch.root, "linked");
    git(scratch.dir, "worktree", "add", "-q", "--detach", linked);
    await driven.fire("UserPromptSubmit", { prompt: "change it there", cwd: linked });
    writeFileSync(join(linked, "a.txt"), "edit in the linked worktree\n");
    await stopsUnverified(driven, linked);
    expect(runs()).toBe(0);
  });

  test("a stop the checks could not judge, for a command they run is missing, is let go unchecked and the human is told", async () => {
    const { driven, scratch } = await gated("skills-gate-not-installed");
    edit(scratch, 1);
    const { reply } = await driven.fire("Stop", { cwd: scratch.dir });
    expect(reply?.decision, "the stop was held on a failure the push gate would not report").toBeUndefined();
    expect(reply?.systemMessage).toContain("not installed in this checkout, so this settle is let go unchecked");
  });

  test("a repository that declares no checks is left alone", async () => {
    const { driven, scratch } = await gated(undefined);
    edit(scratch, 1);
    await stopsUnverified(driven, scratch.dir);
  });
});

describe("a read of a Body's SKILL.md", () => {
  test("it logs a pull naming the Body once the read has run", async () => {
    const SKILL = "library/writing/references/unslop/SKILL.md";
    const driven = await install(indexWith({ hub: [{ name: "unslop", skill: SKILL }] }));
    const body = join(driven.home, "library", "writing", "references", "unslop");
    mkdirSync(body, { recursive: true });
    writeFileSync(join(body, "SKILL.md"), "# unslop\n");
    const entry = join(driven.home, ".agents", "skills", "unslop");
    mkdirSync(dirname(entry), { recursive: true });
    symlinkSync(body, entry);
    await driven.fire("SessionStart", { source: "startup" });
    const call = { tool_name: "Read", tool_input: { file_path: join(entry, "SKILL.md") } };
    const before = await driven.fire("PreToolUse", call);
    expect(before.log.join("\n")).not.toContain("pull unslop");
    const after = await driven.fire("PostToolUse", call);
    expect(after.log.join("\n")).toContain("pull unslop: Read unslop/SKILL.md");
  });
});
