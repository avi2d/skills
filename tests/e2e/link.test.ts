import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync } from "node:fs";
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, readlink, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Schema } from "effect";
import { skipReason } from "@avi2dg/checks/scripts/test-skips.ts";
import { DEFAULT_GENERATED_ROOT } from "../../src/generate/bundle";
import { README } from "../../src/docs/docs";
import { MERGED, REPO, link, preflight } from "../../src/generate/link";
import { resolvedTargets, wouldDangle } from "../lib/dangling";
import { clonePaths } from "./lib/clone";
import { valueOf } from "../lib/effect";
import { GENERATED_ROOT, HUB, LINKS } from "../lib/generated-root";
import { HERDR_OWNED, ccSettings, codexHooks, piSettings, piSettingsFile } from "../lib/harness-settings";
import { fakePi } from "./lib/fake-pi";
import { trackedFiles } from "./lib/git";

// Each test spawns git or the linker, which a loaded machine slows past bun's 5s default.
setDefaultTimeout(30_000);

test("every declared link's target is one a clone can come by, and resolves in this checkout", async () => {
  const dangling = wouldDangle(LINKS, await clonePaths(REPO), await resolvedTargets(REPO, LINKS));
  expect(dangling, "the linker would install a symlink to nothing, or to nothing a clone can have").toEqual([]);
});

test("every merged file's source is one a clone can come by, and resolves in this checkout", async () => {
  const sources = Object.fromEntries(Object.entries(MERGED).map(([rel, { from }]) => [rel, from]));
  expect(wouldDangle(sources, await clonePaths(REPO), await resolvedTargets(REPO, sources))).toEqual([]);
});

describe("a checkout whose pi settings pi wrote into through the old link", () => {
  const SETTINGS = ".pi/agent/settings.json";
  const FROM = "harness/pi/settings.json";
  const decodeObject = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)));

  const dirtied = async (changes: Readonly<Record<string, unknown>>) => {
    const root = await mkdtemp(join(tmpdir(), "skills-pi-dirtied-"));
    const repo = `${root}/repo/`;
    const home = `${root}/home`;
    await mkdir(`${repo}harness/pi`, { recursive: true });
    await cp(`${REPO}${FROM}`, `${repo}${FROM}`);
    await Bun.$`git init -q && git add -A && git -c user.name=test -c user.email=test@example.invalid commit -q -m base`.cwd(repo).quiet();
    await writeFile(`${repo}${FROM}`, JSON.stringify({ ...piSettingsFile, ...changes }, null, 2));
    await mkdir(`${home}/.pi/agent`, { recursive: true });
    await symlink(`${repo}${FROM}`, `${home}/${SETTINGS}`);
    const status = async () => (await Bun.$`git status --porcelain`.cwd(repo).text()).trim();
    const live = async () => decodeObject(await readFile(`${home}/${SETTINGS}`, "utf8"));
    return { repo, home, status, live, discard: () => rm(root, { recursive: true, force: true }) };
  };

  test("is clean after one link when pi's own keys are all it holds, and the machine keeps its deviceId", async () => {
    const { repo, home, status, live, discard } = await dirtied({ lastChangelogVersion: "1.0.0", deviceId: "device-of-this-machine" });
    try {
      expect(await status(), "the seeded checkout is not dirty, so this proves nothing").not.toBe("");
      const outcomes = await valueOf(link(repo, home));
      expect(outcomes).toContainEqual({ home: SETTINGS, state: "restored", from: FROM });
      expect(await status(), "the checkout is still dirty").toBe("");
      expect(await live()).toMatchObject({ deviceId: "device-of-this-machine", lastChangelogVersion: "1.0.0" });
      expect((await lstat(`${home}/${SETTINGS}`)).isSymbolicLink()).toBe(false);
    } finally {
      await discard();
    }
  });

  const LOADS = `[ "$1" = --version ] && { echo 9.9.9; exit 0; }
for arg; do extension=$arg; done
exec "${process.execPath}" -e 'const { default: load } = await import(Bun.argv.at(-1)); load();' "$extension"`;
  const REFUSES = `[ "$1" = --version ] && { echo 9.9.9; exit 0; }
echo 'Failed to load extension "x": boom' >&2
exit 1`;

  test.each([
    ["loaded", LOADS],
    ["refused", REFUSES],
  ] as const)("a preflight pi %s changes neither the checkout nor the settings pi reads through the old link", async (state, script) => {
    const { repo, home, status, live, discard } = await dirtied({ lastChangelogVersion: "1.0.0", deviceId: "device-of-this-machine" });
    const { pi, discard: discardPi } = await fakePi(script);
    try {
      const before = { status: await status(), live: await live() };
      expect((await valueOf(preflight(repo, pi))).state).toBe(state);
      expect({ status: await status(), live: await live() }).toEqual(before);
      expect((await lstat(`${home}/${SETTINGS}`)).isSymbolicLink(), "the preflight replaced the live link").toBe(true);
    } finally {
      await discardPi();
      await discard();
    }
  });

  test("keeps an edit beyond pi's own keys for whoever made it, and restores nothing", async () => {
    const { repo, home, status, live, discard } = await dirtied({ theme: "dark", deviceId: "device-of-this-machine" });
    try {
      const outcomes = await valueOf(link(repo, home));
      expect(outcomes.filter((o) => o.state === "restored")).toEqual([]);
      expect(await status()).toBe(`M ${FROM}`);
      expect(await live()).toMatchObject({ deviceId: "device-of-this-machine", theme: "dark" });
    } finally {
      await discard();
    }
  });

  test("keeps a staged edit beyond pi's own keys, though the working file differs from HEAD only in them", async () => {
    const { repo, home, status, discard } = await dirtied({ theme: "dark" });
    try {
      await Bun.$`git add ${FROM}`.cwd(repo).quiet();
      await writeFile(`${repo}${FROM}`, JSON.stringify({ ...piSettingsFile, deviceId: "device-of-this-machine" }, null, 2));
      const outcomes = await valueOf(link(repo, home));
      expect(outcomes.filter((o) => o.state === "restored")).toEqual([]);
      expect(await status()).toBe(`MM ${FROM}`);
      expect(decodeObject(await Bun.$`git show :./${FROM}`.cwd(repo).text())).toMatchObject({ theme: "dark" });
    } finally {
      await discard();
    }
  });

  test("a machine file with a wrong or missing $schema ends up with the checkout's, while pi's own keys stay the machine's", async () => {
    for (const schema of ["https://example.invalid/other.schema.json", undefined]) {
      const root = await mkdtemp(join(tmpdir(), "skills-pi-schema-"));
      const repo = `${root}/repo/`;
      const home = `${root}/home`;
      try {
        await mkdir(`${repo}harness/pi`, { recursive: true });
        await cp(`${REPO}${FROM}`, `${repo}${FROM}`);
        await mkdir(`${home}/.pi/agent`, { recursive: true });
        await writeFile(
          `${home}/${SETTINGS}`,
          JSON.stringify({
            ...(schema === undefined ? {} : { $schema: schema }),
            deviceId: "device-of-this-machine",
            lastChangelogVersion: "9.9.9",
            trackingId: "tracking-of-this-machine",
            theme: "stale-theme",
          }, null, 2),
        );
        const outcomes = await valueOf(link(repo, home));
        expect(outcomes.find((o) => o.home === SETTINGS)?.state).toBe("written");
        const live = decodeObject(await readFile(`${home}/${SETTINGS}`, "utf8"));
        expect(live["$schema"]).toBe("https://pi.dev/schemas/settings.schema.json");
        expect(live).toMatchObject({
          deviceId: "device-of-this-machine",
          lastChangelogVersion: "9.9.9",
          trackingId: "tracking-of-this-machine",
        });
        expect(live["theme"]).toBe(piSettingsFile["theme"]);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  });
});

test("a clone's paths come from git and from what the install writes, ancestors included", async () => {
  const paths = await clonePaths(REPO);
  expect(paths.has("src/generate/link.ts"), "a tracked file is missing from what git reported").toBe(true);
  expect(paths.has("library/engineering/references/effect-patterns"), "a directory holding tracked files is not itself listed").toBe(true);
  expect(paths.has(`${GENERATED_ROOT}/pi/extension`), "the generator's own output is not among a clone's paths").toBe(
    true,
  );
  expect(paths.has(HUB), "the Hub the install reconciles is not among a clone's paths").toBe(true);
  expect(paths.has(".git"), "the tree was walked - .git is present in every checkout and tracked in none").toBe(false);
});

test("neither the generated tree nor a Hub is in the index, so nothing but the install puts them on disk", async () => {
  const tracked = await trackedFiles(REPO);
  for (const root of [DEFAULT_GENERATED_ROOT, GENERATED_ROOT])
    expect(tracked.filter((p) => p.startsWith(`${root}/`)), `${root}/ is tracked again`).toEqual([]);
  expect(tracked.filter((p) => p.startsWith(`${HUB}/`)), "a Hub of links is tracked").toEqual([]);
});

test("a vendored library is ignored and in no index, so nothing but checks-vendor puts it on disk", async () => {
  // The link is what git sees: it refuses a path beyond a symlink rather than following it.
  const ignored = await Bun.$`git check-ignore repos/effect`.cwd(REPO).nothrow().quiet();
  expect(ignored.exitCode, "git would track the link to a vendored tree, so a clone of it is 41 MB of somebody else's source").toBe(0);

  const tracked = await trackedFiles(REPO);
  expect(tracked.filter((p) => p.startsWith("repos/")), "the pin lives in the prepare script, so nothing under repos/ is tracked").toEqual([]);
});

test("`bun run link` links a temporary $HOME from whichever copy runs it", async () => {
  const home = await mkdtemp(join(tmpdir(), "skills-run-link-"));
  try {
    const run = await Bun.$`bun run link`.cwd(REPO).env({ ...process.env, HOME: home }).nothrow().quiet();
    expect(run.exitCode, run.stderr.toString()).toBe(0);
    const missing = Object.keys(LINKS).filter((rel) => !existsSync(join(home, rel)));
    expect(missing, "the run left a link out of the temporary home").toEqual([]);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("the account's own home is read from the passwd record, which a temporary $HOME does not change", async () => {
  const home = await mkdtemp(join(tmpdir(), "skills-passwd-"));
  try {
    const script = `import { Effect } from "effect"; import { platform } from "./src/platform/platform"; import { AccountHome } from "./src/generate/link";
      console.log(await Effect.runPromise(Effect.provide(Effect.flatten(AccountHome), platform)));`;
    const run = await Bun.$`bun -e ${script}`.cwd(REPO).env({ ...process.env, HOME: home }).nothrow().quiet();
    expect(run.exitCode, run.stderr.toString()).toBe(0);
    const accountHome = run.stdout.toString().trim();
    expect(accountHome).toStartWith("/");
    expect(accountHome, "the account's home followed $HOME").not.toBe(home);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("the uninstall in the README removes every link the linker wrote, and leaves what it did not write", async () => {
  const home = await mkdtemp(join(tmpdir(), "skills-uninstall-"));
  const elsewhere = await mkdtemp(join(tmpdir(), "skills-elsewhere-"));
  try {
    await valueOf(link(REPO, home));
    await rm(join(home, ".codex/hooks.json"));
    await symlink(elsewhere, join(home, ".codex/hooks.json"));
    await mkdir(join(home, ".claude"), { recursive: true });
    await writeFile(join(home, ".claude/agents"), "not a link\n");

    const readme = await Bun.file(`${REPO}${README}`).text();
    const script = /```sh\n([\s\S]*?)```/.exec(readme)?.[1] ?? expect.unreachable(`${README} holds no sh block`);
    const run = await Bun.$`sh -c ${script}`.cwd(REPO).env({ ...process.env, HOME: home }).nothrow().quiet();
    expect(run.exitCode, run.stderr.toString()).toBe(0);

    const remaining = await Promise.all(
      Object.keys(LINKS).map((rel) => lstat(join(home, rel)).then(() => rel, () => undefined)),
    );
    const left = remaining.filter((rel) => rel !== undefined && rel !== ".codex/hooks.json");
    expect(left, "the uninstall left a link the linker wrote").toEqual([]);
    expect(await readlink(join(home, ".codex/hooks.json")), "the uninstall removed a link it did not write").toBe(elsewhere);
    expect(await Bun.file(join(home, ".claude/agents")).text(), "the uninstall removed a real file").toBe("not a link\n");
  } finally {
    await rm(home, { recursive: true, force: true });
    await rm(elsewhere, { recursive: true, force: true });
  }
});

const herdr = Bun.which("herdr");
if (!herdr) console.warn("[link] herdr is not installed - its integration files go unverified");

// herdr writes an integration where its variable points and ignores HOME for it.
const HERDR_AGENT_DIRS = {
  PI_CODING_AGENT_DIR: ".pi/agent",
  CLAUDE_CONFIG_DIR: ".claude",
  CODEX_HOME: ".codex",
  CURSOR_CONFIG_DIR: ".cursor",
  HERMES_HOME: ".hermes",
  COPILOT_HOME: ".copilot",
  GROK_CONFIG_DIR: ".grok",
  GROK_HOME: ".grok",
  KIMI_CODE_HOME: ".kimi-code",
  QWEN_HOME: ".qwen",
  XDG_CONFIG_HOME: ".config",
};
const agentDirsUnder = (root: string) =>
  Object.fromEntries(Object.entries(HERDR_AGENT_DIRS).map(([name, rel]) => [name, join(root, rel)]));

test.skipIf(!herdr)(
  skipReason(
    "it installs herdr's own integrations, so it runs only where herdr is installed, and a CI runner has none",
    "each herdr-owned file the settings enable is installed, and is the integration it claims",
  ),
  async () => {
    const home = await mkdtemp(join(tmpdir(), "skills-herdr-home-"));
    const staging = await mkdtemp(join(tmpdir(), "skills-herdr-staging-"));
    const runnerAgentDirs = await mkdtemp(join(tmpdir(), "skills-herdr-runner-"));
    try {
      const outcomes = await valueOf(link(REPO, home));
      expect(outcomes.filter((o) => o.state === "refused")).toEqual([]);
      await mkdir(join(staging, ".claude"), { recursive: true });
      await mkdir(join(staging, ".pi/agent/extensions"), { recursive: true });
      for (const { id } of Object.values(HERDR_OWNED)) {
        const installed = Bun.spawnSync(["herdr", "integration", "install", id], {
          stdout: "pipe",
          stderr: "pipe",
          env: { ...process.env, ...agentDirsUnder(runnerAgentDirs), HOME: staging, ...agentDirsUnder(staging) },
        });
        expect(installed.exitCode, `herdr could not install its ${id} integration: ${new TextDecoder().decode(installed.stderr)}`).toBe(0);
      }
      expect(await readdir(runnerAgentDirs, { recursive: true }), "herdr wrote into an agent directory the runner's environment names").toEqual([]);
      const enabled = new Set([
        ...(piSettings.extensions ?? []).map((ext) => `.pi/agent/${ext}`),
        ...[ccSettings.hooks, codexHooks.hooks].flatMap((hooks) =>
          Object.values(hooks ?? {})
            .flat()
            .flatMap((m) => m.hooks)
            .flatMap((h) =>
              [...(h.command ?? "").matchAll(/\$HOME\/([^\s"']+)/g)].map(
                ([, rel]) => rel ?? expect.unreachable("the pattern captures the path after $HOME"),
              ),
            ),
        ),
      ]);
      for (const [rel, expected] of Object.entries(HERDR_OWNED)) {
        expect(enabled.has(rel), `nothing the installed settings enable puts ~/${rel} there`).toBe(true);
        const staged = Bun.file(join(staging, rel));
        expect(await staged.exists(), `herdr's ${expected.id} integration installer wrote no ~/${rel}`).toBe(true);
        // The installer writes through the settings link into the repo, so it runs in staging.
        await mkdir(join(home, dirname(rel)), { recursive: true });
        await cp(join(staging, rel), join(home, rel));
        const head = (await Bun.file(join(home, rel)).text()).split("\n", 8).join("\n");
        expect(head, `~/${rel} does not say HERDR_INTEGRATION_ID=${expected.id}`).toContain(
          `HERDR_INTEGRATION_ID=${expected.id}`,
        );
        expect(head, `~/${rel} is not integration version ${expected.version} - re-read what it enables`).toContain(
          `HERDR_INTEGRATION_VERSION=${expected.version}`,
        );
      }
    } finally {
      await rm(home, { recursive: true, force: true });
      await rm(staging, { recursive: true, force: true });
      await rm(runnerAgentDirs, { recursive: true, force: true });
    }
  },
);
