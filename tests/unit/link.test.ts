import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, lstatSync } from "node:fs";
import { cp, mkdir, mkdtemp, readdir, readlink, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DefaultResourceLoader } from "@earendil-works/pi-coding-agent";
import { REACHABLE, SKILL_FILE, consulted, dirOf, loadBodies, type Body } from "../../src/bodies/bodies";
import { DEFAULT_GENERATED_ROOT } from "../../src/generate/bundle";
import { MACOS_INDEX, filesUnder } from "../../src/platform/files";
import { active, checkout } from "../../src/generate/generate";
import { dormantRules, loadSelection, selected, type Selection } from "../../src/bodies/selection";
import { hub, reconcile, type HubOutcome } from "../../src/generate/hub";
import { MERGED, REPO, RETIRED, install, link, linksUnder } from "../../src/generate/link";
import { MACHINES, machineOn } from "../../src/generate/machine";
import { piLoads } from "../../src/generate/preflight";
import { GENERATED_ROOT, HUB, LINKS } from "../lib/generated-root";
import { isLinked } from "../lib/home";
import { HERDR_OWNED, ccSettings, codexHooks, piSettings, piSettingsFile } from "../lib/harness-settings";
import { saidBy, value, valueOf } from "../lib/effect";

setDefaultTimeout(30_000);

const UNCLONED = /\/(?:\.git|node_modules|generated(?:-\d+)?|repos)(?:\/|$)/;

const inNoClone = (path: string): boolean => UNCLONED.test(path);

test("the copy that stands in for a clone leaves out everything a clone does not carry", () => {
  const absent = [
    "/skills/.git/HEAD",
    "/skills/node_modules/x/index.js",
    "/skills/generated/pi/extension/index.ts",
    "/skills/generated/skills/unslop",
    "/skills/generated-12345/pi/extension/index.ts",
    "/skills/repos/effect",
    "/skills/repos/effect/packages/effect/src/Effect.ts",
  ];
  for (const path of absent) expect(inNoClone(path), `${path} would be copied into a stand-in clone`).toBe(true);

  const carried = ["/skills/src/generate/link.ts"];
  for (const path of carried) expect(inNoClone(path), `${path} is in a clone and the copy dropped it`).toBe(false);
});

const CLONE_TEST_MS = 30_000;

const PI_NOT_INSTALLED = "skills-test-pi-that-is-not-installed";

async function cloned(): Promise<{ repo: string; home: string; discard: () => Promise<void> }> {
  const into = await mkdtemp(join(tmpdir(), "skills-clone-"));
  await cp(REPO, `${into}/repo/`, { recursive: true, filter: (src) => !inNoClone(src.slice(REPO.length - 1)) });
  await symlink(`${REPO}node_modules`, `${into}/repo/node_modules`, "dir");
  const discard = async (): Promise<void> => {
    await rm(`${into}/repo/node_modules`, { force: true });
    await rm(into, { recursive: true, force: true });
  };
  return { repo: `${into}/repo/`, home: `${into}/home`, discard };
}

test("a clone with no generated tree and no Hub installs into $HOME with every link resolving", async () => {
  const { repo, home, discard } = await cloned();
  try {
    for (const root of [DEFAULT_GENERATED_ROOT, GENERATED_ROOT])
      expect(existsSync(`${repo}${root}`), `the copy carries ${root}/, so it is not the clone it stands in for`).toBe(false);
    expect(existsSync(`${repo}${HUB}`), "the copy arrived with a Hub a clone does not carry").toBe(false);
    const installed = await valueOf(install(repo, home, PI_NOT_INSTALLED));
    expect(installed.wrote, "the install wrote no generated files").toBeGreaterThan(0);
    const linked = installed.state === "linked" ? installed : expect.unreachable(`the preflight refused: ${installed.reasons.join("; ")}`);
    expect(linked.load.state, "the preflight found a pi this test never installed").toBe("no-pi");
    expect(linked.outcomes.filter((o) => o.state === "refused")).toEqual([]);
    const dangling = Object.keys(LINKS).filter((rel) => !existsSync(`${home}/${rel}`));
    expect(dangling, "a fresh clone pointed $HOME at paths nothing had written").toEqual([]);
  } finally {
    await discard();
  }
}, CLONE_TEST_MS);

test("a clone whose Bodies do not generate installs nothing at all", async () => {
  const { repo, home, discard } = await cloned();
  try {
    await Bun.write(`${repo}library/writing/references/unslop/${SKILL_FILE}`, "---\nkind: reference\n---\n\nA Body with no name.\n");
    expect(await saidBy(install(repo, home, PI_NOT_INSTALLED))).toMatch(/library\/writing\/references\/unslop/);
    expect(existsSync(home), "$HOME was linked into a tree the generator refused to write").toBe(false);
  } finally {
    await discard();
  }
}, CLONE_TEST_MS);

describe("a path $HOME used to take from here", () => {
  const seeded = async (target: string) => {
    const home = await mkdtemp(join(tmpdir(), "skills-retire-"));
    await mkdir(join(home, ".claude"), { recursive: true });
    await symlink(target, join(home, ".claude/agents"));
    return home;
  };

  test("a link this repo put there is removed, and reported as retired", async () => {
    const home = await seeded(`${REPO}${HUB}`);
    try {
      const outcomes = await valueOf(link(REPO, home));
      expect(outcomes.find((o) => o.home === ".claude/agents")?.state).toBe("retired");
      expect(existsSync(join(home, ".claude/agents")), "a link into this repo outlived the entry that made it").toBe(false);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("a link pointing somewhere else is left alone, because it is not ours to remove", async () => {
    const elsewhere = await mkdtemp(join(tmpdir(), "skills-elsewhere-"));
    const home = await seeded(elsewhere);
    try {
      await valueOf(link(REPO, home));
      expect(existsSync(join(home, ".claude/agents")), "the linker deleted a path another owner had put there").toBe(true);
    } finally {
      await rm(home, { recursive: true, force: true });
      await rm(elsewhere, { recursive: true, force: true });
    }
  });

  test("link refuses a home outside the temporary scope while under test", async () => {
    // A NUL byte makes every filesystem call fail, so a deleted guard breaks loudly instead of writing home.
    expect(await saidBy(link(REPO, "/tmp\0skills-guard-probe"))).toMatch(/temporary scope/);
  });

  test("a path is owned or retired, never both", () => {
    const both = RETIRED.filter((rel) => rel in LINKS);
    expect(both, "the linker is told to install and to remove the same path").toEqual([]);
  });
});

test("every file under harness/ is reachable through the map of some machine", async () => {
  const targets = [...MACHINES.flatMap((machine) => Object.values(linksUnder(GENERATED_ROOT, machine))), ...Object.values(MERGED).map(({ from }) => from)];
  const covered = (path: string) => targets.some((t) => t === path || path.startsWith(`${t}/`));
  const inert: string[] = [];
  for (const rel of await valueOf(filesUnder(`${REPO}harness`))) {
    if (!covered(`harness/${rel}`)) inert.push(`harness/${rel}`);
  }
  expect(inert, "in the tree, in no link and no merged file - installed-looking and never read").toEqual([]);
});

const PI = `${REPO}node_modules/.bin/pi`;

test("pi loads haiku-compaction from a lone extension symlink and it registers the compact hook", async () => {
  const home = await mkdtemp(join(tmpdir(), "skills-haiku-lone-"));
  try {
    const agentDir = join(home, ".pi", "agent");
    const extensions = join(agentDir, "extensions");
    await mkdir(extensions, { recursive: true });
    const lone = join(extensions, "haiku-compaction.ts");
    await symlink(`${REPO}harness/pi/extensions/haiku-compaction.ts`, lone);
    expect(existsSync(join(extensions, "haiku-compaction")), "the lone extension file keeps a companion directory").toBe(false);
    const loaded = await valueOf(piLoads(REPO, PI, join(home, "load-check"), home));
    expect(loaded.state === "refused" ? loaded.reasons : [], "pi reports no failed extension").toEqual([]);
    expect(loaded.state, "pi loads every extension in the isolated home").toBe("loaded");
    process.env.JITI_FS_CACHE = "false";
    const loader = new DefaultResourceLoader({ cwd: home, agentDir, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true });
    await loader.reload();
    const { extensions: registered, errors } = loader.getExtensions();
    expect(errors, "pi reports no failed extension").toEqual([]);
    expect(registered.find((entry) => entry.path === lone)?.handlers.has("session_before_compact"), "the loaded haiku extension registers the compact hook").toBe(true);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("macOS links the Mac's crew dispatch rules, and every other platform the Windows machine's", () => {
  const rules = "Projects/firstmate/config/crew-dispatch.json";
  expect(linksUnder(GENERATED_ROOT, machineOn("darwin"))[rules]).toBe("harness/firstmate/crew-dispatch.mac.json");
  for (const os of ["linux", "win32"] as const) {
    expect(linksUnder(GENERATED_ROOT, machineOn(os))[rules], `${os} links the Mac's rules`).toBe("harness/firstmate/crew-dispatch.json");
  }
});

test("only macOS links the secondmate and supervision pins into the Mac firstmate home", () => {
  const pins = {
    "Projects/firstmate/config/secondmate-harness": "harness/firstmate/secondmate-harness",
    "Projects/firstmate/config/supervision-branch-model": "harness/firstmate/supervision-branch-model",
    "Projects/firstmate/config/supervision-branch-effort": "harness/firstmate/supervision-branch-effort",
  };
  const mac = linksUnder(GENERATED_ROOT, machineOn("darwin"));
  for (const [rel, target] of Object.entries(pins)) expect(mac[rel]).toBe(target);
  for (const os of ["linux", "win32"] as const) {
    const other = linksUnder(GENERATED_ROOT, machineOn(os));
    for (const rel of Object.keys(pins)) expect(rel in other, `${os} links a pin only the Mac home carries`).toBe(false);
  }
});

test("every platform links the no-mistakes config generation writes for that machine", () => {
  for (const os of ["darwin", "linux", "win32"] as const) {
    expect(linksUnder(GENERATED_ROOT, machineOn(os))[".no-mistakes/config.yaml"], os).toBe(`${GENERATED_ROOT}/no-mistakes/config.yaml`);
  }
});

test("a no-mistakes config kept by hand is refused and left as it was, rather than replaced by the link", async () => {
  const home = await mkdtemp(join(tmpdir(), "skills-no-mistakes-"));
  const config = join(home, ".no-mistakes/config.yaml");
  try {
    await Bun.write(config, "agent: claude\n");
    const outcomes = await valueOf(link(REPO, home));
    expect(outcomes.find((o) => o.home === ".no-mistakes/config.yaml")?.state).toBe("refused");
    expect(lstatSync(config).isSymbolicLink(), "the link replaced the file kept by hand").toBe(false);
    expect(await Bun.file(config).text(), "the settings kept by hand changed").toBe("agent: claude\n");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("a $HOME the map has not been installed into is told apart from one it has", async () => {
  const dir = await mkdtemp(join(tmpdir(), "skills-home-"));
  try {
    expect(await isLinked(dir), "an empty directory reads as a linked $HOME").toBe(false);
    await valueOf(link(REPO, dir));
    expect(await isLinked(dir), "`link()` ran over it and it still reads as unlinked").toBe(true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("every extension pi's settings enable is linked by the map or herdr's, not only the known ones", () => {
  for (const ext of piSettings.extensions ?? []) {
    const rel = `.pi/agent/${ext}`;
    expect(
      rel in LINKS || rel in HERDR_OWNED,
      `pi enables ${ext} and nothing owns it - it would look installed while being a plain file in $HOME`,
    ).toBe(true);
  }
});

function ownerOf(rel: string): { owner: string; rest: string } | undefined {
  const segments = rel.split("/");
  for (let i = segments.length; i > 0; i--) {
    const owner = segments.slice(0, i).join("/");
    if (owner in LINKS || owner in HERDR_OWNED) return { owner, rest: segments.slice(i).join("/") };
  }
  return undefined;
}

test.each([
  ["claude code", ccSettings.hooks],
  ["codex", codexHooks.hooks],
])("every path a %s hook runs is linked by the map or herdr's, and the file is there", (harness, hooks) => {
  const commands = Object.values(hooks ?? {})
    .flat()
    .flatMap((m) => m.hooks)
    .map((h) => h.command ?? "");
  for (const command of commands) {
    for (const [, rel = expect.unreachable("the pattern captures the path after $HOME")] of command.matchAll(/\$HOME\/([^\s"']+)/g)) {
      const found = ownerOf(rel) ?? expect.unreachable(`a hook runs ~/${rel} and nothing owns it`);
      const target = LINKS[found.owner];
      if (target === undefined) continue;
      const path = [REPO + target, found.rest].filter(Boolean).join("/");
      expect(existsSync(path), `a hook runs ~/${rel}, which resolves to ${path}, and there is no such file`).toBe(true);
    }
  }
  expect(commands.length, `the hook list was read wrong - ${harness} enables at least the Dispatcher`).toBeGreaterThan(0);
});

test("the settings select the theme by its frozen name", () => {
  expect(piSettings.theme, "pi's settings select a theme it will not find").toBe("terminal");
  expect(ccSettings.theme, "claude code's settings select a theme it will not find").toBe("custom:terminal");
});

test("pi adds codemode to its default tools and hides the others behind it", () => {
  const tools = piSettings.defaultTools ?? [];
  expect(tools, "pi starts with codemode inactive").toContain("+codemode");
  expect(
    tools.filter((tool) => !/^[+-]/.test(tool)),
    "a plain name in defaultTools replaces pi's read, bash, edit and write instead of adding to them",
  ).toEqual([]);
  expect(piSettings.codemode?.mode ?? "on", "without codemode `only` the model sees the ordinary tools beside codemode").toBe("only");
});

test("pi compacts each claude-bridge model and each per-token worker model at about 150k of its registered window, and no other model early", async () => {
  const { SettingsManager, shouldCompact } = await import("@earendil-works/pi-coding-agent");
  const { getBuiltinModel } = await import("@earendil-works/pi-ai/providers/all");
  const settings = SettingsManager.inMemory(piSettingsFile);
  const defaults = SettingsManager.inMemory({});
  const bridgeCompactsAt = ({ id, contextWindow }: { id: string; contextWindow: number }, tokens: number) =>
    shouldCompact(tokens, contextWindow, settings.getCompactionSettings({ provider: "claude-bridge", id }));
  for (const claude of [
    getBuiltinModel("anthropic", "claude-fable-5-1"),
    getBuiltinModel("anthropic", "claude-opus-5"),
    getBuiltinModel("anthropic", "claude-opus-5-5"),
    getBuiltinModel("anthropic", "claude-sonnet-5"),
    getBuiltinModel("anthropic", "claude-sonnet-5-5"),
    getBuiltinModel("anthropic", "claude-haiku-5-5"),
  ]) {
    const { id } = claude;
    expect(bridgeCompactsAt(claude, 150_000), `${id} compacts at 150k rather than past it`).toBe(false);
    expect(bridgeCompactsAt(claude, 150_001), `${id} runs past 150k`).toBe(true);
    expect(
      settings.getCompactionKeepRecentTokens({ provider: "claude-bridge", id }),
      `${id} keeps a 10k tail, under pi's 20k default`,
    ).toBe(10_000);
  }
  for (const worker of [
    getBuiltinModel("openrouter", "deepseek/deepseek-v4-pro-0813"),
    getBuiltinModel("openrouter", "z-ai/glm-5.3"),
    getBuiltinModel("opencode-go", "muse-spark-1.3-contributor"),
    getBuiltinModel("opencode-go", "deepseek-v4-pro"),
    getBuiltinModel("opencode-go", "glm-5.3"),
  ]) {
    const { provider, id } = worker;
    const workerCompactsAt = (tokens: number) =>
      shouldCompact(tokens, worker.contextWindow, settings.getCompactionSettings({ provider, id }));
    expect(workerCompactsAt(150_000), `${provider}/${id} compacts before 150k`).toBe(false);
    expect(workerCompactsAt(151_000), `${provider}/${id} runs past about 150k`).toBe(true);
    expect(settings.getCompactionKeepRecentTokens({ provider, id })).toBe(defaults.getCompactionKeepRecentTokens());
  }
  const openrouterMuse = getBuiltinModel("openrouter", "meta/muse-spark-1.3-contributor");
  expect(
    shouldCompact(
      151_000,
      openrouterMuse.contextWindow,
      settings.getCompactionSettings({ provider: "openrouter", id: openrouterMuse.id }),
    ),
    "muse is a worker on opencode-go only",
  ).toBe(false);
  expect(settings.getCompactionReserveTokens({ provider: "claude-bridge", id: "claude-sonnet-5" })).toBe(850_000);
  expect(bridgeCompactsAt(getBuiltinModel("anthropic", "claude-haiku-4-5"), 150_001), "a model with no point compacts early").toBe(false);
  expect(settings.getCompactionReserveTokens({ provider: "claude-bridge", id: "claude-haiku-4-5" })).toBe(
    defaults.getCompactionReserveTokens(),
  );
  expect(settings.getCompactionKeepRecentTokens({ provider: "claude-bridge", id: "claude-haiku-4-5" })).toBe(
    defaults.getCompactionKeepRecentTokens(),
  );
});

test("every compaction override is keyed by a provider and id that pi resolves it for", async () => {
  const { SettingsManager } = await import("@earendil-works/pi-coding-agent");
  const overrides = Object.entries(piSettings.compaction?.modelOverrides ?? {});
  expect(overrides.length, "no compaction override to check").toBeGreaterThan(0);
  const settings = SettingsManager.inMemory(piSettingsFile);
  const unmatched = overrides
    .filter(([key, { reserveTokens, keepRecentTokens }]) => {
      const [, provider, id] = /^([^/]+)\/(.+)$/.exec(key) ?? [];
      return (
        provider === undefined ||
        id === undefined ||
        settings.getCompactionReserveTokens({ provider, id }) !== reserveTokens ||
        (keepRecentTokens !== undefined && settings.getCompactionKeepRecentTokens({ provider, id }) !== keepRecentTokens)
      );
    })
    .map(([key]) => key);
  expect(unmatched, "pi never matches these keys, so each model keeps the 16384-token default reserve").toEqual([]);
});

test("the statusline is the frozen path, generated where the colors live", () => {
  expect(ccSettings.statusLine?.command).toBe("$HOME/.claude/cc-statusline");
});

describe("a Hub of links", () => {
  // A foreign link points into a tree the probe owns: a mutant that follows it must not reach the host's files.
  const probe = async (name: string) => {
    const repo = `${await mkdtemp(join(tmpdir(), `skills-hub-${name}-`))}/`;
    await symlink(`${REPO}library`, `${repo}library`, "dir");
    await mkdir(`${repo}${HUB}`, { recursive: true });
    const elsewhere = await mkdtemp(join(tmpdir(), "skills-elsewhere-"));
    const discard = async () => {
      await rm(repo, { recursive: true, force: true });
      await rm(elsewhere, { recursive: true, force: true });
    };
    return { repo, root: HUB, dir: `${repo}${HUB}`, elsewhere, discard };
  };
    const wanted = new Map([
    ["unslop", "library/writing/references/unslop"],
    ["how", "library/writing/references/how"],
  ]);
  const states = (outcomes: readonly HubOutcome[]): Record<string, string> =>
    Object.fromEntries(outcomes.map(({ entry, state }) => [entry, state]));

  test("an entry is a link to the Body's own directory, which is where its SKILL.md is read from", async () => {
    const { repo, root, dir, discard } = await probe("links");
    try {
      expect(states(await valueOf(reconcile(repo, root, wanted)))).toEqual({ unslop: "linked", how: "linked" });
      expect(await readlink(`${dir}/unslop`)).toBe(`${repo}library/writing/references/unslop`);
      expect(existsSync(`${dir}/unslop/${SKILL_FILE}`), "the link resolves to no Body").toBe(true);
      expect(lstatSync(`${dir}/unslop`).isSymbolicLink(), "the Hub holds a copy rather than a link").toBe(true);
    } finally {
      await discard();
    }
  });

  test("a second run keeps every link it made, so running it again changes nothing", async () => {
    const { repo, root, discard } = await probe("again");
    try {
      await valueOf(reconcile(repo, root, wanted));
      expect(states(await valueOf(reconcile(repo, root, wanted)))).toEqual({ unslop: "kept", how: "kept" });
    } finally {
      await discard();
    }
  });

  test("a body another installer put in the Hub survives a full re-link, and is reported as left alone", async () => {
    const { repo, root, dir, elsewhere, discard } = await probe("foreign");
    try {
      await valueOf(reconcile(repo, root, wanted));
      await mkdir(`${dir}/no-mistakes`, { recursive: true });
      await Bun.write(`${dir}/no-mistakes/${SKILL_FILE}`, "---\nname: no-mistakes\n---\n\nSomebody else's Body.\n");
      await symlink(elsewhere, `${dir}/elsewhere`);

      const outcomes = await valueOf(reconcile(repo, root, new Map([["unslop", "library/writing/references/unslop"]])));
      expect(states(outcomes)).toEqual({ "no-mistakes": "left", elsewhere: "left", unslop: "kept", how: "unlinked" });
      expect(await Bun.file(`${dir}/no-mistakes/${SKILL_FILE}`).text()).toContain("Somebody else's Body.");
      expect(await readlink(`${dir}/elsewhere`), "a link into somebody else's tree was repointed").toBe(elsewhere);
      expect(existsSync(`${dir}/how`), "a link this step made outlived the Body leaving the Hub").toBe(false);
    } finally {
      await discard();
    }
  });

  test("a root an earlier build wrote under the Hub is retired, and what another tool put there arrives in the Hub", async () => {
    const { repo, root, dir, discard } = await probe("roots");
    try {
      for (const old of ["pi", "claude-code"]) {
        await mkdir(`${dir}/${old}/no-mistakes`, { recursive: true });
        await symlink(`${repo}library/writing/references/unslop`, `${dir}/${old}/unslop`);
        await symlink(`${repo}library/writing/references/how`, `${dir}/${old}/how`);
        await Bun.write(`${dir}/${old}/no-mistakes/${SKILL_FILE}`, "---\nname: no-mistakes\n---\n\nSomebody else's Body.\n");
      }
      expect(states(await valueOf(reconcile(repo, root, wanted)))).toEqual({
        pi: "retired",
        "claude-code": "retired",
        "no-mistakes": "moved",
        unslop: "linked",
        how: "linked",
      });
      expect(existsSync(`${dir}/pi`), "the old root outlived its retirement").toBe(false);
      expect(existsSync(`${dir}/claude-code`), "the old root outlived its retirement").toBe(false);
      expect(await Bun.file(`${dir}/no-mistakes/${SKILL_FILE}`).text()).toContain("Somebody else's Body.");
      expect(states(await valueOf(reconcile(repo, root, wanted)))).toEqual({
        "no-mistakes": "left",
        unslop: "kept",
        how: "kept",
      });
    } finally {
      await discard();
    }
  });

  test("a retirement refuses when an old root and the Hub both hold a name with different bytes, naming both paths", async () => {
    const { repo, root, dir, discard } = await probe("clash");
    try {
      await mkdir(`${dir}/pi/no-mistakes`, { recursive: true });
      await mkdir(`${dir}/pi/zz-other`, { recursive: true });
      await symlink(`${repo}library/writing/references/how`, `${dir}/pi/how`);
      await symlink(`${repo}library/writing/references/unslop`, `${dir}/pi/unslop`);
      await Bun.write(`${dir}/pi/no-mistakes/${SKILL_FILE}`, "the older install\n");
      await Bun.write(`${dir}/pi/zz-other/${SKILL_FILE}`, "another tool's Body\n");
      await mkdir(`${dir}/no-mistakes`, { recursive: true });
      await Bun.write(`${dir}/no-mistakes/${SKILL_FILE}`, "the newer install\n");
      const before = (await readdir(`${dir}/pi`)).sort();

      const said = await saidBy(reconcile(repo, root, wanted));
      expect(said).toContain(`${dir}/pi/no-mistakes`);
      expect(said).toContain(`${dir}/no-mistakes`);
      expect((await readdir(`${dir}/pi`)).sort(), "the refused root lost an entry").toEqual(before);
      expect(await readlink(`${dir}/pi/how`)).toBe(`${repo}library/writing/references/how`);
      expect(existsSync(`${dir}/zz-other`), "an entry was moved out of a root that was then refused").toBe(false);
      expect(await Bun.file(`${dir}/pi/no-mistakes/${SKILL_FILE}`).text()).toBe("the older install\n");
      expect(await Bun.file(`${dir}/no-mistakes/${SKILL_FILE}`).text()).toBe("the newer install\n");
    } finally {
      await discard();
    }
  });

  test("a Finder index beside a Body is neither moved nor a collision, in the old root or in the Hub", async () => {
    const { repo, root, dir, discard } = await probe("finder");
    try {
      await mkdir(`${dir}/pi`, { recursive: true });
      await symlink(`${repo}library/writing/references/unslop`, `${dir}/pi/unslop`);
      await Bun.write(`${dir}/pi/${MACOS_INDEX}`, "finder's index of the old root");
      await Bun.write(`${dir}/${MACOS_INDEX}`, "finder's index of the Hub");

      expect(states(await valueOf(reconcile(repo, root, wanted)))).toEqual({
        pi: "retired",
        [MACOS_INDEX]: "left",
        unslop: "linked",
        how: "linked",
      });
      expect(existsSync(`${dir}/pi`), "the old root outlived its retirement").toBe(false);
      expect(await Bun.file(`${dir}/${MACOS_INDEX}`).text()).toBe("finder's index of the Hub");
    } finally {
      await discard();
    }
  });

  test("a directory holding none of this step's links is left alone, whatever else is in it", async () => {
    const { repo, root, dir, elsewhere, discard } = await probe("foreign-root");
    try {
      await mkdir(`${dir}/pi`, { recursive: true });
      await Bun.write(`${dir}/pi/notes.md`, "somebody else's file\n");
      await symlink(elsewhere, `${dir}/pi/elsewhere`);
      await mkdir(`${dir}/empty`, { recursive: true });

      expect(states(await valueOf(reconcile(repo, root, wanted)))).toEqual({
        pi: "left",
        empty: "left",
        unslop: "linked",
        how: "linked",
      });
      expect(await Bun.file(`${dir}/pi/notes.md`).text()).toBe("somebody else's file\n");
    } finally {
      await discard();
    }
  });

  test("a link this step made is repointed when the Body moves, rather than left at the old path", async () => {
    const { repo, root, dir, discard } = await probe("moved");
    try {
      await valueOf(reconcile(repo, root, new Map([["how", "library/writing/skills/how"]])));
      expect(states(await valueOf(reconcile(repo, root, new Map([["how", "library/writing/references/how"]]))))).toEqual({
        how: "relinked",
      });
      expect(await readlink(`${dir}/how`)).toBe(`${repo}library/writing/references/how`);
    } finally {
      await discard();
    }
  });

  test("every skills root $HOME holds points at the one Hub the build reconciles", () => {
    const installed = Object.entries(LINKS).filter(([home]) => home.endsWith("/skills"));
    expect(installed.length, "no link installs a skills root, so this proves nothing").toBeGreaterThan(1);
    for (const [home, target] of installed) {
      expect(target, `${home} points somewhere the build does not reconcile`).toBe(HUB);
    }
  });

  const switchOff = (selection: Selection, body: Body): Selection => ({
    defaultModels: selection.defaultModels,
    profiles: selection.profiles.map((profile) => ({
      ...profile,
      [body.kind === "rule" ? "rules" : body.kind === "skill" ? "skills" : "references"]:
        (body.kind === "rule" ? profile.rules : body.kind === "skill" ? profile.skills : profile.references).filter((name) => name !== body.name),
    })),
  });
  const consumersOf = (name: string, bodies: readonly Body[], seen: ReadonlySet<string> = new Set([name])): Body[] => {
    const direct = bodies.filter((body) => !seen.has(body.name) && consulted(body).includes(name));
    const reached = new Set([...seen, ...direct.map((body) => body.name)]);
    return [...direct, ...direct.flatMap((body) => consumersOf(body.name, bodies, reached))];
  };
  const checkedIn = async () => {
    const bodies = await valueOf(loadBodies(REPO));
    const selection = await valueOf(loadSelection(REPO));
    const offered = selected(bodies, selection).filter((body) => REACHABLE.includes(body.kind));
    expect(offered.length, "the Selection offers no Body, so this proves nothing").toBeGreaterThan(0);
    return { bodies, selection, offered };
  };

  test("a Body the Selection switches off, with every Body that consults it, is offered to no harness, and one a switched-off Rule consults is refused", async () => {
    const { bodies, selection, offered } = await checkedIn();
    const refused: string[] = [];
    for (const dropped of offered) {
      const consumers = consumersOf(dropped.name, bodies);
      const chosen = selected(bodies, [dropped, ...consumers].reduce(switchOff, selection));
      const checked = hub(chosen, dormantRules(bodies, chosen));
      const rules = consumers.filter((body) => body.kind === "rule");
      if (rules.length === 0) {
        expect(value(checked).has(dropped.name), `${dropped.name} is off and the Hub offered it`).toBe(false);
        continue;
      }
      refused.push(dropped.name);
      const said = await saidBy(checked);
      expect(said).toEndWith("which the Hub does not offer");
      expect(rules.map(dirOf), said).toContain(said.slice(0, said.indexOf(":")));
    }
    expect(refused).toEqual(expect.arrayContaining(["effect-patterns", "technical-writing", "unslop", "writing-for-agents"]));
  });

  test("a Body another Body consults cannot be switched off alone, so no pointer to it dangles", async () => {
    const { bodies, selection, offered } = await checkedIn();
    const pointedAt = offered.filter((body) => consumersOf(body.name, bodies).length > 0);
    expect(pointedAt.map((body) => body.name)).toEqual(expect.arrayContaining(["technical-writing", "unslop", "writing-for-agents"]));
    for (const dropped of pointedAt) {
      const chosen = selected(bodies, switchOff(selection, dropped));
      expect(await saidBy(hub(chosen, dormantRules(bodies, chosen)))).toInclude(`names "${dropped.name}", which the Hub does not offer`);
    }
  });

  test("the Hub a checkout reconciles holds what the install would write", async () => {
    const { repo, discard } = await cloned();
    try {
      await valueOf(checkout(repo));
      const { bodies, dormant } = await valueOf(active(repo));
      const links = value(hub(bodies, dormant));
      for (const [name, dir] of links) {
        expect(existsSync(`${repo}${HUB}/${name}`), `${HUB}/${name} is missing`).toBe(true);
        expect(await readlink(`${repo}${HUB}/${name}`), `${HUB}/${name} points elsewhere`).toBe(`${repo}${dir}`);
      }
      for (const entry of await readdir(`${repo}${HUB}`, { withFileTypes: true })) {
        if (!entry.isSymbolicLink()) continue;
        const points = await readlink(`${repo}${HUB}/${entry.name}`);
        if (!points.startsWith(repo)) continue;
        expect(links.has(entry.name), `${HUB}/${entry.name} is a link this repo made and no Body wants`).toBe(true);
      }
    } finally {
      await discard();
    }
  }, CLONE_TEST_MS);
});
