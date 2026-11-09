import { expect, test } from "bun:test";
import { CARRIAGE_VARIABLE, isolatedEnv, liveRootHolding, liveRootsFor, type Sandbox } from "../../src/eval/eval-sandbox";
import { LINKS, MERGED, graftsInto } from "../../src/generate/link";

const home = "/Users/someone";

const sandbox: Sandbox = {
  root: "/tmp/skills-eval-x",
  home: "/tmp/skills-eval-x/home",
  agentDir: "/tmp/skills-eval-x/home/.pi/agent",
  tmp: "/tmp/skills-eval-x/tmp",
  repo: "/tmp/skills-eval-x/repo",
  carriage: "/tmp/skills-eval-x/carriage.md",
};

const CONFIG_DIRS = [".claude-work", ".config/claude-other"];

const roots = liveRootsFor(CONFIG_DIRS);

test("every path the linker manages, every Claude config dir the config names, and every agent config root, is a live root or under one", () => {
  const managed = [...Object.keys(LINKS), ...Object.keys(MERGED), ...Object.keys(graftsInto(CONFIG_DIRS)), ...CONFIG_DIRS];
  for (const rel of [...managed, ".claude", ".pi/agent", ".codex", ".config/opencode", ".agents"]) {
    expect(liveRootHolding(roots, `${home}/${rel}`, home), `~/${rel} is not held by any live root`).toBeDefined();
  }
  expect(roots.filter((root) => roots.some((other) => root.startsWith(`${other}/`))), "a live root is listed under another").toEqual([]);
});

test("a Claude config dir no config names is not live", () => {
  expect(liveRootHolding(liveRootsFor([]), `${home}/.claude-work/sessions`, home)).toBeUndefined();
});

test("a path beside a live root, or merely sharing its prefix, is not live", () => {
  expect(liveRootHolding(roots, `${home}/.pi/agentless`, home)).toBeUndefined();
  expect(liveRootHolding(roots, `${home}/.local/share/mise/installs/node/bin`, home)).toBeUndefined();
  expect(liveRootHolding(roots, "/tmp/skills-eval-x/home/.claude", home)).toBeUndefined();
  expect(liveRootHolding(roots, `${home}/.pi/agent/bin`, home)).toBe(".pi/agent");
  expect(liveRootHolding(roots, `${home}/.claude-work/bin`, home)).toBe(".claude-work");
});

test("the agent's environment is built from nothing, so no variable naming a live config reaches it", () => {
  const env = isolatedEnv(
    sandbox,
    {
      HOME: home,
      PATH: `${home}/.pi/agent/bin:/usr/bin:${home}/.claude-work/bin:${home}/.local/share/mise/shims:/bin:`,
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
    roots,
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
