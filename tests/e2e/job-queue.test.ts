import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { skipReason } from "@avi2dg/checks/scripts/test-skips.ts";
import { Schema } from "effect";
import { CLAUDE_BUNDLE, CODEX_BUNDLE, ENTRY, INDEX, bundle } from "../../src/generate/bundle";
import type { Index } from "../../src/dispatcher/dispatch";
import { SEPARATE_CALLS, queued, steer } from "../../src/dispatcher/job-queue";
import { valueOf } from "../lib/effect";
import { closeSessions, load } from "../lib/pi";
import { HOOK_TEST_MS, rigFor, type Rig } from "./lib/hook-dispatcher";

setDefaultTimeout(HOOK_TEST_MS);

const repo = new URL("../../", import.meta.url).pathname;

const roots: string[] = [];
const temporary = (prefix: string): string => {
  const root = mkdtempSync(join(tmpdir(), prefix));
  roots.push(root);
  return root;
};

const CLAUDE = rigFor(CLAUDE_BUNDLE, "claude-code", "skills-cc-queue-");
const CODEX = rigFor(CODEX_BUNDLE, "codex", "skills-codex-queue-");

afterAll(async () => {
  await closeSessions();
  CLAUDE.remove();
  CODEX.remove();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function stubPueue(groups: readonly string[]): { path: string } {
  const dir = temporary("skills-pueue-stub-");
  const listed = JSON.stringify(Object.fromEntries(groups.map((group) => [group, { status: "Running", parallel_tasks: 1 }])));
  writeFileSync(
    join(dir, "pueue"),
    [
      "#!/bin/sh",
      `case "$1" in`,
      `group) echo '${listed}' ;;`,
      `add) while [ "$1" != "--" ]; do shift; done; shift; printf '%s' "$*" > "${dir}/queued"; echo 7 ;;`,
      `wait) exit 0 ;;`,
      `log) printf 'ran: %s\\n' "$(cat "${dir}/queued")" ;;`,
      "*) exit 1 ;;",
      "esac",
    ].join("\n"),
  );
  chmodSync(join(dir, "pueue"), 0o755);
  return { path: `${dir}:${process.env.PATH ?? ""}` };
}

const shell = (command: string): Record<string, unknown> => ({ tool_name: "Bash", tool_input: { command, description: "run it" } });

function rollout(sandbox: Record<string, unknown>): string {
  const path = join(temporary("skills-codex-rollout-"), "rollout.jsonl");
  const turn = { timestamp: "2026-10-07T00:00:00Z", type: "turn_context", payload: { model: "m", sandbox_policy: sandbox } };
  writeFileSync(path, `${JSON.stringify({ type: "session_meta", payload: { id: "s1" } })}\n${JSON.stringify(turn)}\n`);
  return path;
}

const FULL_ACCESS = { type: "danger-full-access" };

function hookHarness(name: string, rig: Rig, decision: string | undefined): void {
  describe(`${name} running a command through its PreToolUse hook`, () => {
    const index: Index = rig.indexWith();
    const bash = (command: string): Record<string, unknown> => ({ ...shell(command), transcript_path: rollout(FULL_ACCESS) });

    test("a whole test suite is rewritten to queue in the tests group, every other field kept", async () => {
      const { path } = stubPueue(["default", "tests", "gpu"]);
      const driven = await rig.install(index);
      const { reply, log } = await driven.fire("PreToolUse", bash("bun run test"), undefined, { PATH: path });
      expect(reply?.hookSpecificOutput?.permissionDecision).toBe(decision);
      expect(reply?.hookSpecificOutput?.updatedInput).toEqual({ command: queued("bun run test", "tests"), description: "run it" });
      expect(log).toContainEqual(expect.stringContaining("job-queue tests: queued the command through pueue"));
    });

    test("a model benchmark is rewritten to queue in the gpu group", async () => {
      const { path } = stubPueue(["default", "tests", "gpu"]);
      const driven = await rig.install(index);
      const { reply } = await driven.fire("PreToolUse", bash("llama-bench -m model.gguf"), undefined, { PATH: path });
      expect(reply?.hookSpecificOutput?.updatedInput?.command).toBe(queued("llama-bench -m model.gguf", "gpu"));
    });

    test("an eval run is rewritten to queue in the evals group with its concurrency capped", async () => {
      const { path } = stubPueue(["default", "tests", "gpu", "evals"]);
      const driven = await rig.install(index);
      const { reply, log } = await driven.fire("PreToolUse", bash("bun run eval"), undefined, { PATH: path });
      expect(reply?.hookSpecificOutput?.updatedInput?.command).toBe(queued("EVAL_CONCURRENCY=3 bun run eval", "evals"));
      expect(log).toContainEqual(expect.stringContaining("job-queue evals: queued the command through pueue"));
    });

    test("a call that needs both groups is refused with a word to run them as separate calls", async () => {
      const { path } = stubPueue(["default", "tests", "gpu"]);
      const driven = await rig.install(index);
      const { reply, log } = await driven.fire("PreToolUse", bash("bun test && llama-bench -m model.gguf"), undefined, { PATH: path });
      expect(reply?.hookSpecificOutput?.permissionDecision).toBe("deny");
      expect(reply?.hookSpecificOutput?.permissionDecisionReason).toBe(SEPARATE_CALLS);
      expect(reply?.hookSpecificOutput?.updatedInput).toBeUndefined();
      expect(log).toContainEqual(expect.stringContaining("job-queue tests and gpu: refused a call that mixes groups"));
    });

    test("a quick targeted test passes through untouched", async () => {
      const { path } = stubPueue(["default", "tests", "gpu"]);
      const driven = await rig.install(index);
      const { reply, log } = await driven.fire("PreToolUse", { ...bash("bun test tests/unit/glob.test.ts"), cwd: repo }, undefined, { PATH: path });
      expect(reply).toBeUndefined();
      expect(log.join("\n")).not.toContain("job-queue");
    });

    test("a heavy command passes through untouched where pueue has no such group", async () => {
      const { path } = stubPueue(["default"]);
      const driven = await rig.install(index);
      const { reply } = await driven.fire("PreToolUse", bash("bun test"), undefined, { PATH: path });
      expect(reply).toBeUndefined();
    });

    test("a heavy command passes through untouched where pueue is not installed", async () => {
      const driven = await rig.install(index);
      const { reply } = await driven.fire("PreToolUse", bash("bun test"), undefined, { PATH: join(temporary("skills-no-pueue-"), "bin") });
      expect(reply).toBeUndefined();
    });
  });
}

hookHarness("Claude Code", CLAUDE, undefined);
hookHarness("Codex", CODEX, "allow");

describe("Codex's sandbox around the command", () => {
  const index: Index = CODEX.indexWith();

  test.each([
    ["workspace-write with no network", { type: "workspace-write", network_access: false }],
    ["workspace-write with the network", { type: "workspace-write", network_access: true }],
    ["read-only", { type: "read-only" }],
  ])("a heavy command passes through untouched in a %s sandbox, because a queued job would run outside it", async (_name, sandbox) => {
    const { path } = stubPueue(["default", "tests"]);
    const driven = await CODEX.install(index);
    const { reply } = await driven.fire("PreToolUse", { ...shell("bun test"), transcript_path: rollout(sandbox) }, undefined, { PATH: path });
    expect(reply).toBeUndefined();
  });

  test("a heavy command passes through untouched when Codex names no rollout to read the sandbox from", async () => {
    const { path } = stubPueue(["default", "tests"]);
    const driven = await CODEX.install(index);
    const { reply } = await driven.fire("PreToolUse", shell("bun test"), undefined, { PATH: path });
    expect(reply).toBeUndefined();
  });
});

describe("an eval run's queued command, run by a real shell", () => {
  function evalSees(command: string): string {
    const dir = temporary("skills-eval-cap-");
    mkdirSync(join(dir, "sub"));
    const script = (name: string, lines: readonly string[]): void => {
      writeFileSync(join(dir, name), ["#!/bin/sh", ...lines].join("\n"));
      chmodSync(join(dir, name), 0o755);
    };
    script("pueue", [`case "$1" in`, `add) while [ "$1" != "--" ]; do shift; done; shift; sh -c "$1" > "${dir}/ran"; echo 7 ;;`, "wait) exit 0 ;;", `log) cat "${dir}/ran" ;;`, "esac"]);
    script("bun", ['echo "eval sees ${EVAL_CONCURRENCY:-the harness default}"']);
    const steered = steer(command, dir, () => ["evals"]);
    if (steered?.type !== "queue") throw new Error(`${command} was not queued`);
    const env = { ...process.env, PATH: `${dir}:${process.env.PATH ?? ""}`, N: "8", EVAL_CONCURRENCY: undefined };
    return execFileSync("sh", ["-c", steered.command], { cwd: dir, env, encoding: "utf8" });
  }

  test.each([
    "bun run eval",
    "cd sub && bun run eval",
    "true && bun run eval",
    "(bun run eval)",
    "export EVAL_CONCURRENCY=8; bun run eval",
    "EVAL_CONCURRENCY=8 bun run eval",
    'EVAL_CONCURRENCY="8" bun run eval',
    "EVAL_CONCURRENCY='8' bun run eval",
    "EVAL_CONCURRENCY=$N bun run eval",
    "env EVAL_CONCURRENCY=8 bun run eval",
    "nice -n 10 bun run eval",
  ])("%s reaches the eval with at most 3 agents abreast", (command) => {
    expect(evalSees(command)).toContain("eval sees 3");
  });

  test("a count already under the cap reaches the eval as it was asked", () => {
    expect(evalSees("EVAL_CONCURRENCY=2 bun run eval")).toContain("eval sees 2");
  });
});

describe("pi running a command through its tool_call event", () => {
  const bare: Index = { harness: "pi", rules: [], profiles: [], hub: [] };

  async function called(command: string, path: string): Promise<{ input: { command: string }; result: unknown }> {
    const dispatcher = await load(bare, { cwd: repo });
    const input = { command };
    const was = process.env.PATH;
    process.env.PATH = path;
    try {
      return { input, result: await dispatcher.call("bash", input) };
    } finally {
      process.env.PATH = was;
    }
  }

  test("a whole test suite is rewritten in place to queue in the tests group, and the call is not blocked", async () => {
    const { input, result } = await called("bun test", stubPueue(["default", "tests"]).path);
    expect(result).toBeUndefined();
    expect(input.command).toBe(queued("bun test", "tests"));
  });

  test("an eval run is rewritten in place to queue in the evals group with its concurrency capped", async () => {
    const { input, result } = await called("EVAL_CONCURRENCY=8 bun run eval", stubPueue(["default", "tests", "gpu", "evals"]).path);
    expect(result).toBeUndefined();
    expect(input.command).toBe(queued("EVAL_CONCURRENCY=3 bun run eval", "evals"));
  });

  test("a quick targeted test passes through untouched", async () => {
    const { input } = await called("bun test tests/unit/glob.test.ts", stubPueue(["default", "tests"]).path);
    expect(input.command).toBe("bun test tests/unit/glob.test.ts");
  });

  test("a call that needs both groups is blocked with a word to run them as separate calls", async () => {
    const { input, result } = await called("llama-bench -m model.gguf && bun test", stubPueue(["default", "tests", "gpu"]).path);
    expect(result).toEqual({ block: true, reason: SEPARATE_CALLS });
    expect(input.command).toBe("llama-bench -m model.gguf && bun test");
  });

  test("a heavy command passes through untouched where pueue has no such group", async () => {
    const { input } = await called("llama-bench -m model.gguf", stubPueue(["default", "tests"]).path);
    expect(input.command).toBe("llama-bench -m model.gguf");
  });
});

const pueued = Bun.which("pueued");

const decodeStatus = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Struct({ tasks: Schema.Record(Schema.String, Schema.Unknown) })));

// Every path pueue reads or writes is under `root`, so this daemon never meets the machine's own.
function isolatedDaemon(): { env: Record<string, string>; stop: () => void } {
  const root = temporary("skills-pueued-");
  mkdirSync(join(root, "run"));
  const env = {
    PATH: process.env.PATH ?? "",
    HOME: root,
    XDG_RUNTIME_DIR: join(root, "run"),
    XDG_CONFIG_HOME: join(root, "config"),
    XDG_DATA_HOME: join(root, "data"),
    XDG_CACHE_HOME: join(root, "cache"),
    TMPDIR: root,
  };
  execFileSync("pueued", ["--daemonize"], { env, stdio: "ignore" });
  const stop = (): void => {
    const pid = Number(readFileSync(join(root, "run", "pueue.pid"), "utf8").trim());
    process.kill(pid);
    const gone = Date.now() + 10_000;
    while (spawnSync("kill", ["-0", String(pid)]).status === 0 && Date.now() < gone) Bun.sleepSync(50);
  };
  return { env, stop };
}

function addGroup(env: Record<string, string>, group: string): void {
  const ready = Date.now() + 10_000;
  while (spawnSync("pueue", ["group", "add", group], { env, stdio: "ignore" }).status !== 0) {
    if (Date.now() > ready) expect.unreachable("the isolated pueue daemon never answered");
    Bun.sleepSync(50);
  }
}

const shown = ({ stdout, stderr }: { stdout: string; stderr: string }): string => `${stdout}${stderr}`;

test.skipIf(!pueued)(
  skipReason(
    "it starts a real pueue daemon, so it runs only where pueue is installed; the ci runner has none",
    "a queued command runs as a real job in the tests group, and its output and failure reach the caller",
  ),
  () => {
    const daemon = isolatedDaemon();
    try {
      addGroup(daemon.env, "tests");
      const failing = spawnSync("sh", ["-c", queued(`printf '%s\\n' "it's queued"; exit 3`, "tests")], { env: daemon.env, encoding: "utf8" });
      expect(shown(failing)).toContain("it's queued");
      expect(shown(failing)).toMatch(/queued as pueue task \d+ in group tests/);
      expect(shown(failing)).toContain("failed with exit code 3");
      expect(failing.status, "a failed job read as a passing command").not.toBe(0);

      const passing = spawnSync("sh", ["-c", queued("echo fine", "tests")], { env: daemon.env, encoding: "utf8" });
      expect(shown(passing)).toContain("fine");
      expect(passing.status).toBe(0);

      const { tasks } = decodeStatus(execFileSync("pueue", ["status", "--json", "--group", "tests"], { env: daemon.env, encoding: "utf8" }));
      expect(Object.keys(tasks), "the jobs did not land in the tests group").toHaveLength(2);
    } finally {
      daemon.stop();
    }
  },
);

const claude = Bun.which("claude");

const usage = { input_tokens: 1, output_tokens: 1 };

const streamed = (events: ReadonlyArray<[string, unknown]>): Response =>
  new Response(events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join(""), {
    headers: { "content-type": "text/event-stream" },
  });

const toolUse = (command: string): Response =>
  streamed([
    ["message_start", { type: "message_start", message: { id: "m1", type: "message", role: "assistant", model: "claude", content: [], stop_reason: null, usage } }],
    ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_1", name: "Bash", input: {} } }],
    ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify({ command, description: "run it" }) } }],
    ["content_block_stop", { type: "content_block_stop", index: 0 }],
    ["message_delta", { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 1 } }],
    ["message_stop", { type: "message_stop" }],
  ]);

const said = (text: string): Response =>
  streamed([
    ["message_start", { type: "message_start", message: { id: "m2", type: "message", role: "assistant", model: "claude", content: [], stop_reason: null, usage } }],
    ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
    ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } }],
    ["content_block_stop", { type: "content_block_stop", index: 0 }],
    ["message_delta", { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 1 } }],
    ["message_stop", { type: "message_stop" }],
  ]);

async function claudeRuns(command: string): Promise<string> {
  const root = temporary("skills-cc-queue-live-");
  const dir = join(root, "dispatcher");
  for (const path of [dir, join(root, "work"), join(root, "config"), join(root, "tmp")]) mkdirSync(path, { recursive: true });
  for (const [dest, bytes] of await valueOf(bundle(CLAUDE_BUNDLE, repo))) writeFileSync(join(dir, basename(dest)), bytes);
  writeFileSync(join(dir, INDEX), JSON.stringify({ harness: "claude-code", rules: [], profiles: [], hub: [] }));
  const hook = { type: "command", command: `bun "${join(dir, ENTRY)}" PreToolUse`, timeout: 10 };
  writeFileSync(join(root, "settings.json"), JSON.stringify({ hooks: { PreToolUse: [{ matcher: "*", hooks: [hook] }] } }));

  const bodies: string[] = [];
  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const body = await req.text();
      if (!new URL(req.url).pathname.endsWith("/messages")) return Response.json({ input_tokens: 1 });
      bodies.push(body);
      return body.includes("tool_result") ? said("done") : toolUse(command);
    },
  });
  try {
    const proc = Bun.spawn([claude ?? expect.unreachable("a session runs only where claude is installed"), "-p", "--settings", join(root, "settings.json"), "--model", "claude-sonnet-5", "--permission-mode", "bypassPermissions", "run the tests"], {
      cwd: join(root, "work"),
      stdout: "pipe",
      stderr: "pipe",
      env: {
        PATH: stubPueue(["default", "tests"]).path,
        HOME: process.env.HOME ?? root,
        TMPDIR: join(root, "tmp"),
        CLAUDE_CONFIG_DIR: join(root, "config"),
        XDG_STATE_HOME: join(root, "state"),
        ANTHROPIC_BASE_URL: `http://127.0.0.1:${server.port}`,
        ANTHROPIC_API_KEY: "sk-stand-in",
        DISABLE_AUTOUPDATER: "1",
        DISABLE_TELEMETRY: "1",
        DISABLE_ERROR_REPORTING: "1",
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
      },
    });
    const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
    expect(await proc.exited, `claude -p failed: ${out}${err}`).toBe(0);
  } finally {
    await server.stop(true);
  }
  return bodies.find((body) => body.includes("tool_result")) ?? expect.unreachable("Claude Code never sent the tool's result back");
}

test.skipIf(!claude)(
  skipReason(
    "it drives a real `claude`, so it runs only where Claude Code is on PATH; the ci workflow installs a pinned one, a contributor's machine may not have it",
    "Claude Code runs the queued command the hook rewrote, and hands its output back to the model",
    "local",
  ),
  async () => {
    const result = await claudeRuns("bun run test");
    expect(result).toContain("ran: bun run test");
  },
  120_000,
);
