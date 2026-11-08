import { afterAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigProvider, Effect } from "effect";
import { readUserConfig } from "../../src/generate/user-config";
import { saidBy, valueOf } from "../lib/effect";

const root = await mkdtemp(join(tmpdir(), "skills-user-config-"));
afterAll(() => rm(root, { recursive: true, force: true }));

const home = join(root, "home");

const readWith = (env: Record<string, string>) =>
  readUserConfig.pipe(Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromEnv({ env })));

const written = async (path: string, text: string) => {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, text);
  return path;
};

test("a home with no config reads as an empty config rather than failing", async () => {
  expect(await valueOf(readWith({ HOME: join(root, "bare-home") }))).toEqual({});
});

test("a SKILLS_CONFIG that names no file reads as an empty config rather than failing", async () => {
  expect(await valueOf(readWith({ HOME: home, SKILLS_CONFIG: join(root, "absent.json") }))).toEqual({});
});

test("the config under $HOME/.config/skills is read when nothing names another", async () => {
  await written(join(home, ".config/skills/config.json"), JSON.stringify({ claudeConfigDirs: [".claude-home"] }));
  expect(await valueOf(readWith({ HOME: home }))).toEqual({ claudeConfigDirs: [".claude-home"] });
});

test("XDG_CONFIG_HOME is read instead of $HOME/.config, not beside it", async () => {
  const xdg = join(root, "xdg");
  await written(join(xdg, "skills/config.json"), JSON.stringify({ claudeConfigDirs: [".claude-xdg"] }));
  expect(await valueOf(readWith({ HOME: home, XDG_CONFIG_HOME: xdg }))).toEqual({ claudeConfigDirs: [".claude-xdg"] });
});

test("SKILLS_CONFIG is read instead of the XDG config, not beside it", async () => {
  const named = await written(join(root, "named.json"), JSON.stringify({ claudeConfigDirs: [".claude-named"] }));
  expect(await valueOf(readWith({ HOME: home, XDG_CONFIG_HOME: join(root, "xdg"), SKILLS_CONFIG: named }))).toEqual({ claudeConfigDirs: [".claude-named"] });
});

test("a key the config does not declare is dropped rather than refused", async () => {
  const named = await written(join(root, "newer.json"), JSON.stringify({ claudeConfigDirs: [], keyOfANewerCheckout: true }));
  expect(await valueOf(readWith({ HOME: home, SKILLS_CONFIG: named }))).toEqual({ claudeConfigDirs: [] });
});

test("a config that holds no JSON is refused, naming the file", async () => {
  const named = await written(join(root, "broken.json"), "{ not json");
  expect(await saidBy(readWith({ HOME: home, SKILLS_CONFIG: named }))).toContain(`${named} is not a skills config`);
});

for (const dir of ["/etc/claude", "~/.claude-work", "../outside", ".claude/../../outside", ""]) {
  test(`a Claude config dir ${JSON.stringify(dir)} that escapes $HOME is refused rather than grafted`, async () => {
    const named = await written(join(root, "escaping.json"), JSON.stringify({ claudeConfigDirs: [".claude-work", dir] }));
    expect(await saidBy(readWith({ HOME: home, SKILLS_CONFIG: named }))).toContain("names no directory under $HOME");
  });
}
