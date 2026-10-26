import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdir, mkdtemp, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { AccountHome, REPO, install, link } from "../../src/generate/link";
import { isLinked } from "../lib/home";
import { saidBy, valueOf } from "../lib/effect";

// Each test installs a tree, which a loaded machine slows past bun's 5s default.
setDefaultTimeout(30_000);

const PI_NOT_INSTALLED = "skills-test-pi-that-is-not-installed";

describe("the account's own home", () => {
  // The account's home stands in a temporary directory, so no test here can reach the real one.
  const account = async () => {
    const root = await mkdtemp(join(tmpdir(), "skills-account-"));
    const home = join(root, "home");
    await mkdir(home);
    return { home, discard: () => rm(root, { recursive: true, force: true }) };
  };

  const asAccount = <A, E, R>(home: string, effect: Effect.Effect<A, E, R>) => Effect.provideService(effect, AccountHome, Effect.succeed(home));

  test("is refused to a copy that is not ~/Projects/skills, and nothing is written into it", async () => {
    const { home, discard } = await account();
    try {
      expect(await saidBy(asAccount(home, link(REPO, home)))).toMatch(/Projects\/skills/);
      expect(await readdir(home), "the refused run wrote into the account's home").toEqual([]);
    } finally {
      await discard();
    }
  });

  test("is refused to a copy before it generates, when it is installed", async () => {
    const { home, discard } = await account();
    try {
      expect(await saidBy(asAccount(home, install("/nonexistent-skills-copy/", home, PI_NOT_INSTALLED)))).toMatch(/Projects\/skills/);
      expect(await readdir(home)).toEqual([]);
    } finally {
      await discard();
    }
  });

  test("is refused when $HOME reaches it through a link", async () => {
    const { home, discard } = await account();
    try {
      await symlink(home, `${home}-alias`);
      expect(await saidBy(asAccount(home, link(REPO, `${home}-alias`)))).toMatch(/Projects\/skills/);
      expect(await readdir(home)).toEqual([]);
    } finally {
      await rm(`${home}-alias`, { force: true });
      await discard();
    }
  });

  test("is linked from ~/Projects/skills, though that path is itself a link to the checkout", async () => {
    const { home, discard } = await account();
    try {
      await mkdir(join(home, "Projects"));
      await symlink(REPO, join(home, "Projects/skills"));
      const outcomes = await valueOf(asAccount(home, link(`${home}/Projects/skills/`, home)));
      expect(outcomes.filter((o) => o.state === "refused")).toEqual([]);
      expect(await isLinked(home)).toBe(true);
    } finally {
      await discard();
    }
  });

  test("is not what a temporary $HOME is, so any copy links into that", async () => {
    const { home: accountHome, discard } = await account();
    const home = await mkdtemp(join(tmpdir(), "skills-temporary-home-"));
    try {
      await valueOf(asAccount(accountHome, link(REPO, home)));
      expect(await isLinked(home)).toBe(true);
      expect(await readdir(accountHome)).toEqual([]);
    } finally {
      await rm(home, { recursive: true, force: true });
      await discard();
    }
  });
});
