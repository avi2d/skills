import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { CLAUDE_BUNDLE, ENTRY, INDEX, bundle } from "../../src/generate/bundle";
import type { Index } from "../../src/dispatcher/dispatch";
import { DAY } from "../../src/report/dispatch-report";
import { valueOf } from "../lib/effect";

const repo = new URL("../../", import.meta.url).pathname;

setDefaultTimeout(30_000);

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function home(): string {
  const root = mkdtempSync(join(tmpdir(), "skills-report-"));
  roots.push(root);
  return root;
}

const stateOf = (at: string): string => join(at, ".local", "state");

async function reportIn(at: string) {
  const proc = Bun.spawn([process.execPath, "run", "dispatch-report"], {
    cwd: repo,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, XDG_STATE_HOME: stateOf(at) },
  });
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  await proc.exited;
  return { code: proc.exitCode, stdout, stderr };
}

async function claudeWrites(at: string, hooks: ReadonlyArray<readonly [string, Record<string, unknown>]>): Promise<void> {
  const dir = join(at, "dispatcher");
  mkdirSync(dir, { recursive: true });
  for (const [dest, bytes] of await valueOf(bundle(CLAUDE_BUNDLE, repo))) {
    writeFileSync(join(dir, basename(dest)), bytes);
  }
  const index: Index = {
    harness: "claude-code",
    rules: [{ name: "naming", triggers: [{ predicate: "always" }], text: "Name every variable after what it holds." }],
    profiles: [],
    hub: [],
  };
  writeFileSync(join(dir, INDEX), JSON.stringify(index));
  for (const [hook, payload] of hooks) {
    const proc = Bun.spawn([process.execPath, join(dir, ENTRY), hook], {
      stdin: new TextEncoder().encode(JSON.stringify({ session_id: "written-by-claude", cwd: at, ...payload })),
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, HOME: at, XDG_STATE_HOME: stateOf(at), GIT_CEILING_DIRECTORIES: at },
    });
    await proc.exited;
    expect(proc.exitCode, `${hook}: ${await new Response(proc.stderr).text()}`).toBe(0);
  }
}

function logged(at: string, lines: readonly string[]): void {
  const state = join(stateOf(at), "skills");
  mkdirSync(state, { recursive: true });
  writeFileSync(join(state, "dispatch.log"), `${lines.join("\n")}\n`);
}

describe("bun run dispatch-report", () => {
  test("reads back the log the Claude Code Dispatcher wrote to the same state directory", async () => {
    const at = home();
    await claudeWrites(at, [
      ["SessionStart", { source: "startup" }],
      ["UserPromptSubmit", { prompt: "make a start" }],
      ["PreCompact", { trigger: "auto" }],
      ["SessionEnd", { reason: "exit" }],
    ]);
    const { code, stdout, stderr } = await reportIn(at);
    expect(code, stderr).toBe(0);
    expect(stdout).toInclude("1 session wrote to it.");
    expect(stdout).toInclude("Inactive Rules that still reached a session, switched on by a project or from a build that carried them:\n  naming  1");
    expect(stdout).toInclude("  written-by-claude\n    naming: dropped, the session ended before a prompt it could inject at");
  });

  test("reads the last seven days", async () => {
    const at = home();
    const stamp = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY).toISOString();
    logged(at, [`${stamp(8)} eight-days-ago inject naming: always`, `${stamp(6)} six-days-ago inject naming: always`]);

    const week = await reportIn(at);
    expect(week.stdout).toInclude("over the 7 days to");
    expect(week.stdout).toInclude("1 session wrote to it.");
  });

  test("fails naming the log it looked for when there is none", async () => {
    const at = home();
    const { code, stderr } = await reportIn(at);
    expect(code).not.toBe(0);
    expect(stderr).toInclude(join(stateOf(at), "skills", "dispatch.log"));
  });
});
