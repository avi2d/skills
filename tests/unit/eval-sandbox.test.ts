import { expect, test } from "bun:test";
import { CARRIAGE_VARIABLE, LIVE_ROOTS, isolatedEnv, liveRootHolding, type Sandbox } from "../../src/eval/eval-sandbox";
import { LINKS, MERGED } from "../../src/generate/link";

const home = "/Users/someone";

const sandbox: Sandbox = {
  root: "/tmp/skills-eval-x",
  home: "/tmp/skills-eval-x/home",
  agentDir: "/tmp/skills-eval-x/home/.pi/agent",
  tmp: "/tmp/skills-eval-x/tmp",
  repo: "/tmp/skills-eval-x/repo",
  carriage: "/tmp/skills-eval-x/carriage.md",
};

test("every path the linker manages, and every agent config root, is a live root or under one", () => {
  for (const rel of [...Object.keys(LINKS), ...Object.keys(MERGED), ".claude", ".pi/agent", ".codex", ".config/opencode", ".agents"]) {
    expect(liveRootHolding(`${home}/${rel}`, home), `~/${rel} is not held by any live root`).toBeDefined();
  }
  expect(LIVE_ROOTS.filter((root) => LIVE_ROOTS.some((other) => root.startsWith(`${other}/`))), "a live root is listed under another").toEqual([]);
});

test("a path beside a live root, or merely sharing its prefix, is not live", () => {
  expect(liveRootHolding(`${home}/.pi/agentless`, home)).toBeUndefined();
  expect(liveRootHolding(`${home}/.local/share/mise/installs/node/bin`, home)).toBeUndefined();
  expect(liveRootHolding("/tmp/skills-eval-x/home/.claude", home)).toBeUndefined();
  expect(liveRootHolding(`${home}/.pi/agent/bin`, home)).toBe(".pi/agent");
});

test("the agent's environment is built from nothing, so no variable naming a live config reaches it", () => {
  const env = isolatedEnv(
    sandbox,
    {
      HOME: home,
      PATH: `${home}/.pi/agent/bin:/usr/bin:${home}/.local/share/mise/shims:/bin:`,
      PI_CODING_AGENT_DIR: `${home}/.pi/agent`,
      PI_CODING_AGENT_SESSION_DIR: `${home}/.pi/agent/sessions`,
      CLAUDE_CONFIG_DIR: `${home}/.claude`,
      CODEX_HOME: `${home}/.codex`,
      XDG_CONFIG_HOME: `${home}/.config`,
      OPENCODE_API_KEY: "key",
      ANTHROPIC_API_KEY: "other",
    },
    ["OPENCODE_API_KEY", "ABSENT_KEY"],
    home,
  );
  expect(env).toEqual({
    HOME: sandbox.home,
    PI_CODING_AGENT_DIR: sandbox.agentDir,
    TMPDIR: sandbox.tmp,
    PATH: `/usr/bin:${home}/.local/share/mise/shims:/bin`,
    LANG: "en_US.UTF-8",
    TERM: "dumb",
    GIT_CONFIG_NOSYSTEM: "1",
    [CARRIAGE_VARIABLE]: sandbox.carriage,
    OPENCODE_API_KEY: "key",
  });
});
