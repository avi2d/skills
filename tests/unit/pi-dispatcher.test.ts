import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Index, IndexedProfile } from "../../src/dispatcher/dispatch";
import { HELD, closeSessions, load, loadRaw } from "../lib/pi";

afterAll(closeSessions);

const ruled: Index = {
  harness: "pi",
  rules: [{ name: "unslop", triggers: [{ predicate: "always" }], text: "# unslop\n\nSay it plainly, every time." }],
  profiles: [],
  hub: [],
};

const logPath = (home: string): string => join(home, "state", "skills", "dispatch.log");

const loggedBuild = (home: string): string | undefined => readFileSync(logPath(home), "utf8").match(/ build ([0-9a-f]{12}|unreadable\(.*\))\n/)?.[1];

describe("the dispatch log names its build", () => {
  test("the first line of a session's log names the build, before anything else the session does", async () => {
    const dispatcher = await load(ruled);
    const lines = readFileSync(logPath(dispatcher.home), "utf8").trim().split("\n");
    expect(lines[0]).toMatch(/ build [0-9a-f]{12}$/);
  });

  test("two sessions loaded from the same bundle log the same build", async () => {
    const a = await load(ruled);
    const b = await load(ruled);
    expect(loggedBuild(a.home)).toBeDefined();
    expect(loggedBuild(a.home)).toBe(loggedBuild(b.home));
  });

  test("a bundle with different bytes logs a different build", async () => {
    const changed: Index = { ...ruled, rules: ruled.rules.map((r) => ({ ...r, text: `${r.text} (edited)` })) };
    const a = await load(ruled);
    const c = await load(changed);
    expect(loggedBuild(c.home)).toBeDefined();
    expect(loggedBuild(c.home)).not.toBe(loggedBuild(a.home));
  });
});

describe("the emitted directory is the whole of what loads", () => {
  test("the authoring modules are absent, and a Rule still fires without them", async () => {
    const dispatcher = await load(ruled);
    for (const gone of ["scope-condition.ts", "fields.ts"]) {
      expect(existsSync(join(dispatcher.home, "extension", gone)), gone).toBe(false);
    }
    expect(await dispatcher.carried()).toContain("Say it plainly, every time.");
  });
});

describe("an exact Profile in pi", () => {
  const fields = { skills: [], references: [] };
  const profiles: IndexedProfile[] = [
    { name: "default", models: [], rules: ["unslop"], ...fields },
    { name: "local", models: ["ollama/a-model"], rules: ["unslop", "prove-it-works"], ...fields, tools: ["read", "write", "edit", "bash"] },
  ];
  const index: Index = {
    harness: "pi",
    rules: [
      { name: "prove-it-works", triggers: [{ predicate: "always" }], text: "# prove-it-works\n\nRun it." },
      { name: "unslop", triggers: [{ predicate: "always" }], text: "# unslop\n\nSay it plainly." },
    ],
    profiles,
    hub: [],
  };

  test("the exact profile injects its Rules and trims tools to its complete list", async () => {
    const dispatcher = await load(index, { provider: "ollama" });
    expect(await dispatcher.carried()).toContain("Run it.");
    expect(await dispatcher.carried()).toContain("Say it plainly.");
    expect(dispatcher.tools()).toEqual(["read", "bash", "edit", "write"]);
  });

  test("a different model gets the default Rules and keeps its tools", async () => {
    const dispatcher = await load(index, { provider: "ollama", modelId: "another-model" });
    expect(await dispatcher.carried()).not.toContain("Run it.");
    expect(dispatcher.tools()).toEqual(HELD);
  });

  test("an unreported model gets default Rules and tools", async () => {
    const dispatcher = await load(index);
    expect(await dispatcher.carried()).not.toContain("Run it.");
    expect(dispatcher.tools()).toEqual(HELD);
  });

  test("a tool the Profile names and this pi does not have is not asked for", async () => {
    const dispatcher = await load(index, { provider: "ollama", held: ["read", "bash", "web_search"] });
    expect(dispatcher.tools()).toEqual(["read", "bash"]);
  });

  test("a --tools allowlist narrower than the Profile is kept on the trim and on the switch away", async () => {
    const dispatcher = await load(index, { provider: "anthropic", active: ["read", "web_search"], all: HELD });
    await dispatcher.switchTo("ollama", "a-model");
    expect(dispatcher.tools()).toEqual(["read"]);
    await dispatcher.switchTo("anthropic");
    expect(dispatcher.tools()).toEqual(["read", "web_search"]);
  });

  test("the trim is in the dispatch log, with the Profile that asked for it", async () => {
    const dispatcher = await load(index, { provider: "ollama" });
    expect(readFileSync(logPath(dispatcher.home), "utf8")).toMatch(/trim local: .*ollama\/a-model, keeping rules \[unslop, prove-it-works\] and tools \[read, bash, edit, write\]/);
  });

  test("switching away restores tools the session opened holding", async () => {
    const dispatcher = await load(index, { provider: "ollama", active: ["read", "web_search"], all: HELD });
    expect(dispatcher.tools()).toEqual(["read"]);
    await dispatcher.switchTo("anthropic");
    expect(dispatcher.tools()).toEqual(["read", "web_search"]);
    expect(await dispatcher.carried()).not.toContain("Run it.");
    expect(readFileSync(logPath(dispatcher.home), "utf8")).toMatch(/trim default: .*Profile without tools/);
  });
});

describe("a write carrying a comment a Rule forbids", () => {
  const forbidding: Index = {
    harness: "pi",
    rules: [{ name: "comment-discipline", triggers: [{ predicate: "always" }], text: "# Comments\n", forbid: "comments" }],
    profiles: [],
    hub: [],
  };
  const DIRECTIVE = "// biome-ignore lint: the types are wrong";

  test("the call is blocked, and the reason names the comment and what to do instead", async () => {
    const dispatcher = await load(forbidding);
    const result = await dispatcher.call("write", { path: "src/a.ts", content: `run();\n${DIRECTIVE}\n` });
    expect(result).toEqual({ block: true, reason: expect.stringContaining("src/a.ts:2 carries the machine-read directive `biome-ignore`") });
    expect(JSON.stringify(result)).toContain("Fix what the tool is reporting, or stop running the tool on this file");
  });

  test("every edit in the call is placed in the file on disk, relative to where the session stands", async () => {
    const dispatcher = await load(forbidding);
    mkdirSync(join(dispatcher.home, "src"), { recursive: true });
    writeFileSync(join(dispatcher.home, "src/b.ts"), "one();\ntwo();\n");
    const edits = [
      { oldText: "one();", newText: "uno();" },
      { oldText: "two();", newText: "two(); // see skills/skills#7" },
    ];
    const result = await dispatcher.call("edit", { path: "src/b.ts", edits });
    expect(result).toEqual({ block: true, reason: expect.stringContaining('src/b.ts:2 points at a record or a ticket ("skills/skills#7")') });
  });

  test("a path spelled with pi's leading `@` or `~` reads the file pi would write, so what it held is carried over", async () => {
    const dispatcher = await load(forbidding);
    mkdirSync(join(dispatcher.home, "src"), { recursive: true });
    writeFileSync(join(dispatcher.home, "src/held.ts"), `${DIRECTIVE}\nrun();\n`);
    for (const path of ["@src/held.ts", "~/src/held.ts"]) {
      const result = await dispatcher.call("write", { path, content: `${DIRECTIVE}\nrun();\nagain();\n` });
      expect(result, `${path} was refused for a comment the file already held`).toBeUndefined();
    }
  });

  test("a write carrying nothing it forbids goes ahead", async () => {
    const dispatcher = await load(forbidding);
    expect(await dispatcher.call("write", { path: "src/a.ts", content: "run();\n" })).toBeUndefined();
  });

  test("a shell redirect is no write the Dispatcher can read, so the Rule's text leaves it to the agent", async () => {
    const dispatcher = await load(forbidding);
    expect(await dispatcher.call("bash", { command: "echo '// @ts-ignore' > src/a.ts" })).toBeUndefined();
  });
});

describe("a write carrying a separator a Rule forbids in a doc", () => {
  const forbidding: Index = {
    harness: "pi",
    rules: [{ name: "writing-for-people", triggers: [{ predicate: "always" }], text: "# People\n", forbid: "prose" }],
    profiles: [],
    hub: [],
  };
  const DASHED = "It builds — and then it ships.\n";

  const inRepository = async () => {
    const dispatcher = await load(forbidding);
    mkdirSync(join(dispatcher.home, ".git"));
    return dispatcher;
  };

  test("the call is blocked in a people doc, and the reason names the doc by its path in the repository", async () => {
    const dispatcher = await inRepository();
    const result = await dispatcher.call("write", { path: join(dispatcher.home, "docs/guide.md"), content: DASHED });
    expect(result).toEqual({ block: true, reason: expect.stringContaining("docs/guide.md:1 carries `—`, an em dash. End the sentence, or use a comma") });
  });

  test.each(["docs/adr/0001-a-record.md", "CHANGELOG.md"])("the same write to %s goes ahead", async (path) => {
    const dispatcher = await inRepository();
    expect(await dispatcher.call("write", { path, content: DASHED })).toBeUndefined();
  });
});

describe("a dispatcher whose index loads or does not", () => {
  test("a loaded dispatcher carries its Rules and logs no breakage", async () => {
    const dispatcher = await load(ruled);
    expect(await dispatcher.carried()).toContain("Say it plainly, every time.");
    expect(readFileSync(logPath(dispatcher.home), "utf8")).not.toContain("broken dispatcher");
  });

  test("a dispatcher whose index does not parse carries nothing, blocks nothing, and says so in the log", async () => {
    const dispatcher = await loadRaw("not json\n");
    expect(await dispatcher.carried()).toBeUndefined();
    expect(await dispatcher.call("write", { path: "src/a.ts", content: "run();\n" })).toBeUndefined();
    expect(await dispatcher.beforeSettle("done")).toBeUndefined();
    expect(readFileSync(logPath(dispatcher.home), "utf8")).toContain("broken dispatcher");
  });
});

describe("a run start from a custom message", () => {
  test("dispatches no prompt step, while a user prompt still does", async () => {
    const dispatcher = await load(ruled);
    const started = readFileSync(logPath(dispatcher.home), "utf8");
    await dispatcher.custom("Say it plainly, every time.");
    expect(readFileSync(logPath(dispatcher.home), "utf8"), "a custom run start dispatched a prompt step").toBe(started);
    await dispatcher.prompt("hello");
    expect(readFileSync(logPath(dispatcher.home), "utf8"), "a user prompt dispatched nothing").not.toBe(started);
  });
});

describe("a read of a Body's SKILL.md", () => {
  const SKILL = "library/writing/references/unslop/SKILL.md";

  const linked = async () => {
    const dispatcher = await load({ harness: "pi", rules: [], profiles: [], hub: [{ name: "unslop", skill: SKILL }] });
    const body = join(dispatcher.home, "library", "writing", "references", "unslop");
    mkdirSync(body, { recursive: true });
    writeFileSync(join(body, "SKILL.md"), "# unslop\n");
    const entry = join(dispatcher.home, ".agents", "skills", "unslop");
    mkdirSync(dirname(entry), { recursive: true });
    symlinkSync(body, entry);
    return { dispatcher, input: { path: join(entry, "SKILL.md") } };
  };

  test("it logs a pull naming the Body once the read returns, and never the path the Hub link resolved", async () => {
    const { dispatcher, input } = await linked();
    await dispatcher.call("read", input);
    expect(readFileSync(logPath(dispatcher.home), "utf8")).not.toContain("pull unslop");
    await dispatcher.result("read", input);
    const logged = readFileSync(logPath(dispatcher.home), "utf8");
    expect(logged).toContain("pull unslop: read unslop/SKILL.md");
    expect(logged).not.toContain(dispatcher.home);
  });

  test("a session whose file pi names with Windows separators is logged under the file's own name", async () => {
    const dispatcher = await load({ harness: "pi", rules: [], profiles: [], hub: [] }, { sessionFile: "C:\\Users\\avi\\.pi\\agent\\sessions\\repo\\opening_uuid.jsonl" });
    const logged = readFileSync(logPath(dispatcher.home), "utf8").split("\n").filter(Boolean);
    expect(logged.map((line) => line.split(" ")[1])).toEqual(logged.map(() => "opening_uuid.jsonl"));
  });

  test("a read that fails logs no pull", async () => {
    const { dispatcher, input } = await linked();
    await dispatcher.call("read", input);
    await dispatcher.result("read", input, true);
    expect(readFileSync(logPath(dispatcher.home), "utf8")).not.toContain("pull unslop");
  });
});
