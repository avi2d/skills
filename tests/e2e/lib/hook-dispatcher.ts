import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { ENTRY, INDEX, bundle, type Bundle } from "../../../src/generate/bundle";
import type { Index } from "../../../src/dispatcher/dispatch";
import type { Hook } from "../../../src/dispatcher/hook-harness";
import { valueOf } from "../../lib/effect";
import { declaringRepo, scratchRepo, type Scratch } from "../gated-repo";
import { carried, replyOf, type Reply } from "./reply";

const repo = new URL("../../../", import.meta.url).pathname;

export type Fired = { reply: Reply | undefined; log: string[]; stderr: string };

export type Driven = {
  home: string;
  fire: (hook: Hook, payload: Record<string, unknown>, slot?: number, env?: Record<string, string>) => Promise<Fired>;
  log: () => string[];
};

async function installed(spec: Bundle, index: unknown, root: string): Promise<Driven> {
  const home = join(root, "home");
  const dir = join(root, "dispatcher");
  mkdirSync(dir, { recursive: true });
  mkdirSync(home, { recursive: true });
  for (const [dest, bytes] of await valueOf(bundle(spec, repo))) {
    writeFileSync(join(dir, basename(dest)), bytes);
  }
  writeFileSync(join(dir, INDEX), JSON.stringify(index, null, 2));

  const logPath = join(home, ".local", "state", "skills", "dispatch.log");
  const readLog = (): string[] => (existsSync(logPath) ? readFileSync(logPath, "utf8").split("\n").filter(Boolean) : []);

  return {
    home,
    log: readLog,
    async fire(hook, payload, slot, env = {}) {
      const before = readLog().length;
      const proc = Bun.spawn([process.execPath, join(dir, ENTRY), slot === undefined ? hook : `${hook}/${slot}`], {
        stdin: new TextEncoder().encode(JSON.stringify({ session_id: "s1", cwd: root, ...payload })),
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, HOME: home, XDG_STATE_HOME: join(home, ".local", "state"), GIT_CEILING_DIRECTORIES: root, ...env },
      });
      const [out, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
      await proc.exited;
      expect(proc.exitCode, `the hook exited ${proc.exitCode}: ${stderr}`).toBe(0);
      return { reply: replyOf(out), log: readLog().slice(before), stderr };
    },
  };
}

export type Rig = {
  install: (index: unknown) => Promise<Driven>;
  indexWith: (over?: Partial<Index>) => Index;
  temporary: (prefix: string) => string;
  scratchRepo: typeof scratchRepo;
  remove: () => void;
};

// Each test spawns the bundle, which a loaded machine slows past bun's 5s default.
export const HOOK_TEST_MS = 60_000;

// Writing the capped walk's tree of 21,000 files, or `remove` deleting it, takes tens of seconds on a loaded machine.
export const CAPPED_TREE_MS = 120_000;

// Every directory `install`, `temporary` and `scratchRepo` make is one `remove` deletes.
export function rigFor(spec: Bundle, harness: Index["harness"], prefix: string): Rig {
  const roots: string[] = [];
  const temporary = (named: string): string => {
    const root = mkdtempSync(join(tmpdir(), named));
    roots.push(root);
    return root;
  };
  return {
    install: (index) => installed(spec, index, temporary(prefix)),
    indexWith: (over = {}) => ({ harness, rules: [], profiles: [], hub: [], ...over }),
    temporary,
    scratchRepo: (config, options) => {
      const scratch: Scratch = scratchRepo(config, options);
      roots.push(scratch.root);
      return scratch;
    },
    remove: () => {
      for (const root of roots) rmSync(root, { recursive: true, force: true });
    },
  };
}

export const RULE_TEXT = "Name every variable after what it holds.";

export const alwaysOn = ({ indexWith }: Rig): Index =>
  indexWith({ rules: [{ name: "naming", triggers: [{ predicate: "always" }], text: RULE_TEXT }] });

export function arrivesOnceAndAgainAfterCompaction(driven: () => Driven): void {
  test("it arrives once, however many prompts the session takes", async () => {
    await driven().fire("SessionStart", { source: "startup" });
    const first = await driven().fire("UserPromptSubmit", { prompt: "one" });
    const second = await driven().fire("UserPromptSubmit", { prompt: "two" });
    expect(carried(first.reply)).toContain(RULE_TEXT);
    expect(carried(second.reply), "the Rule was re-sent, so every turn pays for a Body the model already holds").toBeUndefined();
  });

  test("a compaction puts it back, because what the model was holding is gone", async () => {
    await driven().fire("SessionStart", { source: "startup" });
    await driven().fire("UserPromptSubmit", { prompt: "one" });
    await driven().fire("PreCompact", {});
    const after = await driven().fire("UserPromptSubmit", { prompt: "two" });
    expect(carried(after.reply), "the conversation was summarised away and the Rule was not re-injected").toContain(RULE_TEXT);
  });
}

const EFFECT = "Hold the error channel.";

export const declaring = ({ indexWith }: Rig): Index =>
  indexWith({
    rules: [
      { name: "naming", triggers: [{ predicate: "always" }], text: RULE_TEXT },
      { name: "effect", triggers: [{ predicate: "declares", key: "effect" }], text: EFFECT },
      { name: "typescript", triggers: [{ predicate: "file-matches", glob: "**/*.ts" }], text: "Type it." },
    ],
  });

export function readsWhatTheRepositoryDeclares(rig: Rig): void {
  test("a Rule declared for fires at the prompt, from any directory in the repository", async () => {
    const driven = await rig.install(declaring(rig));
    const dir = declaringRepo(join(driven.home, ".."), JSON.stringify({ dependencies: { effect: "4.0.0-rc.115" } }));
    mkdirSync(join(dir, "src"));
    await driven.fire("SessionStart", { source: "startup", cwd: join(dir, "src") });
    const { reply, log } = await driven.fire("UserPromptSubmit", { prompt: "one", cwd: join(dir, "src") });
    expect(carried(reply)).toContain(EFFECT);
    expect(log).toContainEqual(expect.stringContaining("inject effect: declares matched effect"));
  });

  test("a file that cannot be read is said once in the log, and the session carries on without it", async () => {
    const driven = await rig.install(declaring(rig));
    const dir = declaringRepo(join(driven.home, ".."), "{");
    await driven.fire("SessionStart", { source: "startup", cwd: dir });
    const first = await driven.fire("UserPromptSubmit", { prompt: "one", cwd: dir });
    expect(carried(first.reply)).toContain(RULE_TEXT);
    expect(carried(first.reply)).not.toContain(EFFECT);
    expect(first.log).toContainEqual(expect.stringContaining(`broken dispatcher: ${join(dir, "package.json")} is not JSON`));
    const second = await driven.fire("UserPromptSubmit", { prompt: "two", cwd: dir });
    expect(second.log.join("\n"), "the next hook process did not know it had been said").not.toContain("broken dispatcher");
  });
}

export async function repoSwitchingTypescriptOff(driven: Driven): Promise<string> {
  const dir = declaringRepo(join(driven.home, ".."), JSON.stringify({ skills: { rules: { off: ["typescript"] } } }));
  await driven.fire("SessionStart", { source: "startup", cwd: dir });
  const { log } = await driven.fire("UserPromptSubmit", { prompt: "one", cwd: dir });
  expect(log).toContainEqual(expect.stringContaining(`switched typescript off: ${join(dir, "package.json")} switches it off`));
  return dir;
}

export function walksOutsideAGitRepository(rig: Rig): void {
  describe("repo-contains outside a git repository", () => {
    const TYPESCRIPT = rig.indexWith({
      rules: [{ name: "typescript", triggers: [{ predicate: "repo-contains", glob: "**/*.ts" }], text: RULE_TEXT }],
    });

    test("a file written into a directory the walk finished makes its rule fire at the next prompt", async () => {
      const driven = await rig.install(TYPESCRIPT);
      const work = join(driven.home, "..", "work");
      mkdirSync(work);
      await driven.fire("SessionStart", { source: "startup", cwd: work });
      const first = await driven.fire("UserPromptSubmit", { prompt: "one", cwd: work });
      expect(carried(first.reply)).toBeUndefined();
      mkdirSync(join(work, "src"));
      writeFileSync(join(work, "src", "a.ts"), "");
      const second = await driven.fire("UserPromptSubmit", { prompt: "two", cwd: work });
      expect(carried(second.reply), "a walk that finished was reused, so the file the session wrote went unseen").toContain(RULE_TEXT);
    });

    test("a directory whose walk hit the cap is walked and logged once a session", async () => {
      const driven = await rig.install(TYPESCRIPT);
      const work = join(driven.home, "..", "work");
      for (let d = 0; d < 150; d += 1) {
        mkdirSync(join(work, `d${d}`), { recursive: true });
        for (let f = 0; f < 140; f += 1) writeFileSync(join(work, `d${d}`, `${f}.md`), "");
      }
      await driven.fire("SessionStart", { source: "startup", cwd: work });
      const first = await driven.fire("UserPromptSubmit", { prompt: "one", cwd: work });
      expect(first.log.join("\n")).toContain("hit its cap");
      writeFileSync(join(work, "a.ts"), "");
      const second = await driven.fire("UserPromptSubmit", { prompt: "two", cwd: work });
      expect(carried(second.reply), "the capped directory was walked again").toBeUndefined();
      expect(second.log.join("\n")).not.toContain("hit its cap");
    }, CAPPED_TREE_MS);
  });
}
