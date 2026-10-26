import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Index } from "../../src/dispatcher/dispatch";
import { closeSessions, load } from "../lib/pi";
import { counted, declaringRepo, git, scratchRepo, type Scratch } from "./gated-repo";

setDefaultTimeout(30_000);

afterAll(closeSessions);

const logPath = (home: string): string => join(home, "state", "skills", "dispatch.log");

describe("repo-contains outside a git repository", () => {
  test("a directory whose walk hit the cap is asked of git once it becomes a repository", async () => {
    const python: Index = {
      harness: "pi",
      rules: [{ name: "python", triggers: [{ predicate: "repo-contains", glob: "**/*.py" }], text: "Pin every seed." }],
      profiles: [],
      hub: [],
    };
    const dispatcher = await load(python);
    for (let d = 0; d < 150; d += 1) {
      mkdirSync(join(dispatcher.home, "pad", `d${d}`), { recursive: true });
      for (let f = 0; f < 140; f += 1) writeFileSync(join(dispatcher.home, "pad", `d${d}`, `${f}.md`), "");
    }
    expect(await dispatcher.carried()).toBeUndefined();
    expect(readFileSync(logPath(dispatcher.home), "utf8")).toContain("hit its cap");
    writeFileSync(join(dispatcher.home, "a.py"), "");
    execFileSync("git", ["init", "-q"], { cwd: dispatcher.home });
    execFileSync("git", ["add", "a.py"], { cwd: dispatcher.home });
    expect(await dispatcher.carried(), "the partial walk was reused after git could answer").toContain("Pin every seed.");
  });
});

describe("the verdict gate before the session settles", () => {
  const made: Scratch[] = [];
  afterAll(() => {
    for (const scratch of made) scratch.remove();
  });

  const bare: Index = { harness: "pi", rules: [], profiles: [], hub: [] };

  const runsIn = (scratch: Scratch): number =>
    existsSync(scratch.counter) ? readFileSync(scratch.counter, "utf8").split("\n").filter(Boolean).length : 0;

  function repoCounting(command: string): Scratch {
    const scratch = scratchRepo(undefined);
    made.push(scratch);
    writeFileSync(join(scratch.dir, ".no-mistakes.yaml"), `commands:\n  test: ${counted(scratch.counter, command)}\n`);
    git(scratch.dir, "add", "-A");
    git(scratch.dir, "commit", "-q", "-m", "gate");
    git(scratch.dir, "update-ref", "refs/remotes/origin/main", "HEAD");
    return scratch;
  }

  test("checks that keep failing hold the settle and carry the run on, then let the session go after the bound", async () => {
    const scratch = repoCounting("echo '(fail) the thing'; exit 1");
    const dispatcher = await load(bare, { cwd: scratch.dir });
    await dispatcher.prompt("change it");
    const results = [];
    for (let n = 1; n <= 5; n += 1) {
      writeFileSync(join(scratch.dir, "a.txt"), `edit ${n}\n`);
      const result = await dispatcher.beforeSettle("done");
      results.push(result);
      if (!result?.continue) break;
    }
    expect(results.map((result) => result?.continue ?? false)).toEqual([true, true, false]);
    const shown = results.map((result) => {
      const entry = result?.entries?.[0];
      return entry?.type === "custom_message" && typeof entry.content === "string" ? entry.content : "";
    });
    expect(shown[0]).toContain("(fail) the thing");
    expect(shown[0]).toContain("hold 1 of 2");
    expect(shown[2], "the session was let go and nothing in it says so").toContain("let go with it failing");
    expect(dispatcher.notified.join("\n")).toContain("let go with it failing");
    expect(runsIn(scratch)).toBe(3);
  });

  test("a turn that changed nothing settles without running anything", async () => {
    const scratch = repoCounting("exit 1");
    const dispatcher = await load(bare, { cwd: scratch.dir });
    await dispatcher.prompt("what is this");
    expect(await dispatcher.beforeSettle("it is a repository")).toBeUndefined();
    expect(runsIn(scratch)).toBe(0);
  });

  test("a turn that settles after the session quit is not held and reads nothing from its stale ctx", async () => {
    const scratch = repoCounting("exit 1");
    const dispatcher = await load(bare, { cwd: scratch.dir });
    await dispatcher.prompt("change it");
    writeFileSync(join(scratch.dir, "a.txt"), "edit\n");
    await dispatcher.quit();
    expect(await dispatcher.beforeSettle("done")).toBeUndefined();
    expect(runsIn(scratch)).toBe(0);
  });

  test("an in-process sub-agent is not a session boundary, so it is not held", async () => {
    const scratch = repoCounting("exit 1");
    const dispatcher = await load(bare, { cwd: scratch.dir, sessionStart: false });
    await dispatcher.prompt("change it");
    writeFileSync(join(scratch.dir, "a.txt"), "edit\n");
    expect(await dispatcher.beforeSettle("done")).toBeUndefined();
    expect(runsIn(scratch)).toBe(0);
  });
});

describe("what the repository's package.json declares", () => {
  const made: string[] = [];
  afterAll(() => {
    for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  const declaring = (project: string): string => {
    const parent = mkdtempSync(join(tmpdir(), "skills-declaring-"));
    made.push(parent);
    return declaringRepo(parent, project);
  };

  const EFFECT = "Hold the error channel.";
  const DIRECTIVE = "// biome-ignore lint: the types are wrong";
  const declared: Index = {
    harness: "pi",
    rules: [
      { name: "naming", triggers: [{ predicate: "always" }], text: "Name it." },
      { name: "effect", triggers: [{ predicate: "declares", key: "effect" }], text: EFFECT },
      { name: "comment-discipline", triggers: [{ predicate: "always" }], text: "# Comments\n", forbid: "comments" },
    ],
    profiles: [],
    hub: [],
  };

  test("a Rule declared for fires at the prompt", async () => {
    const cwd = declaring(JSON.stringify({ dependencies: { effect: "4.0.0-rc.115" } }));
    const dispatcher = await load(declared, { cwd });
    expect(await dispatcher.carried()).toContain(EFFECT);
    expect(readFileSync(logPath(dispatcher.home), "utf8")).toContain("inject effect: declares matched effect");
  });

  test("a file that cannot be read is said once in the log, and the session carries on without it", async () => {
    const cwd = declaring("{");
    const dispatcher = await load(declared, { cwd });
    const carried = await dispatcher.carried();
    expect(carried).toContain("Name it.");
    expect(carried).not.toContain(EFFECT);
    await dispatcher.prompt("again");
    const said = readFileSync(logPath(dispatcher.home), "utf8").split("\n").filter((line) => line.includes("broken dispatcher"));
    expect(said).toEqual([expect.stringContaining(`${join(cwd, "package.json")} is not JSON`)]);
  });

  test("a Rule the project switches off refuses no write", async () => {
    const cwd = declaring(JSON.stringify({ skills: { rules: { off: ["comment-discipline"] } } }));
    const dispatcher = await load(declared, { cwd });
    await dispatcher.prompt("start");
    expect(await dispatcher.call("write", { path: "src/a.ts", content: `${DIRECTIVE}\nrun();\n` })).toBeUndefined();
  });
});
