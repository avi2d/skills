import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CLAUDE_BUNDLE, CODEX_BUNDLE } from "../../src/generate/bundle";
import type { Index } from "../../src/dispatcher/dispatch";
import { refusedText } from "../../src/dispatcher/credential-reads";
import { closeSessions, load } from "../lib/pi";
import { HOOK_TEST_MS, rigFor, type Rig } from "./lib/hook-dispatcher";

setDefaultTimeout(HOOK_TEST_MS);

const CLAUDE = rigFor(CLAUDE_BUNDLE, "claude-code", "skills-cc-credential-");
const CODEX = rigFor(CODEX_BUNDLE, "codex", "skills-codex-credential-");

afterAll(async () => {
  await closeSessions();
  CLAUDE.remove();
  CODEX.remove();
});

const AUTH = ".pi/agent/auth.json";

const CLEAR: Record<string, string> = { PI_CODING_AGENT_DIR: "", CODEX_HOME: "", GH_CONFIG_DIR: "", CLAUDE_CONFIG_DIR: "" };

function planted(home: string): string {
  const path = join(home, AUTH);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ OPENAI_API_KEY: "sk-fixture" }));
  return path;
}

function hookHarness(name: string, rig: Rig): void {
  describe(`${name}'s PreToolUse hook`, () => {
    const index: Index = rig.indexWith();

    test("a Read of auth.json is denied with the key-names-only word, and the refusal is logged", async () => {
      const driven = await rig.install(index);
      const path = planted(driven.home);
      const { reply, log } = await driven.fire("PreToolUse", { tool_name: "Read", tool_input: { file_path: path } }, undefined, CLEAR);
      expect(reply?.hookSpecificOutput?.permissionDecision).toBe("deny");
      expect(reply?.hookSpecificOutput?.permissionDecisionReason).toBe(refusedText(path));
      expect(log).toContainEqual(expect.stringContaining(`credential-read: refused a read of ${path}`));
    });

    test("a cat of auth.json through Bash is denied, not let through by the shell", async () => {
      const driven = await rig.install(index);
      const path = planted(driven.home);
      const { reply } = await driven.fire("PreToolUse", { tool_name: "Bash", tool_input: { command: "cat ~/.pi/agent/auth.json" } }, undefined, CLEAR);
      expect(reply?.hookSpecificOutput?.permissionDecision).toBe("deny");
      expect(reply?.hookSpecificOutput?.permissionDecisionReason).toBe(refusedText(path));
    });

    test("jq 'keys' on auth.json is let through, not denied with the reads", async () => {
      const driven = await rig.install(index);
      planted(driven.home);
      const { reply } = await driven.fire("PreToolUse", { tool_name: "Bash", tool_input: { command: "jq 'keys' ~/.pi/agent/auth.json" } }, undefined, CLEAR);
      expect(reply?.hookSpecificOutput?.permissionDecision).toBeUndefined();
    });
  });
}

hookHarness("Claude Code", CLAUDE);
hookHarness("Codex", CODEX);

describe("pi's tool_call event", () => {
  const bare: Index = { harness: "pi", rules: [], profiles: [], hub: [] };

  test("a read of auth.json is blocked with the key-names-only word", async () => {
    const saved = { PI_CODING_AGENT_DIR: process.env.PI_CODING_AGENT_DIR, CODEX_HOME: process.env.CODEX_HOME, GH_CONFIG_DIR: process.env.GH_CONFIG_DIR, CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR };
    delete process.env.PI_CODING_AGENT_DIR;
    delete process.env.CODEX_HOME;
    delete process.env.GH_CONFIG_DIR;
    delete process.env.CLAUDE_CONFIG_DIR;
    try {
      const dispatcher = await load(bare);
      const path = planted(dispatcher.home);
      expect(await dispatcher.call("read", { path: "~/.pi/agent/auth.json" })).toEqual({ block: true, reason: refusedText(path) });
    } finally {
      for (const [name, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });

  test("a bash cat of auth.json is blocked, not rewritten and run", async () => {
    const saved = { PI_CODING_AGENT_DIR: process.env.PI_CODING_AGENT_DIR, CODEX_HOME: process.env.CODEX_HOME, GH_CONFIG_DIR: process.env.GH_CONFIG_DIR, CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR };
    delete process.env.PI_CODING_AGENT_DIR;
    delete process.env.CODEX_HOME;
    delete process.env.GH_CONFIG_DIR;
    delete process.env.CLAUDE_CONFIG_DIR;
    try {
      const dispatcher = await load(bare);
      const path = planted(dispatcher.home);
      const input = { command: "cat ~/.pi/agent/auth.json" };
      expect(await dispatcher.call("bash", input)).toEqual({ block: true, reason: refusedText(path) });
      expect(input.command).toBe("cat ~/.pi/agent/auth.json");
    } finally {
      for (const [name, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });

  test("a read of another file is let through, not blocked with the credential reads", async () => {
    const dispatcher = await load(bare);
    planted(dispatcher.home);
    expect(await dispatcher.call("read", { path: join(dispatcher.home, ".pi/agent/settings.json") })).toBeUndefined();
  });
});
