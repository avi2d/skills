import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
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

  // An empty repository would fail for want of the files it links, so both copies hold every file this checkout commits.
  let root = "";
  let clone = "";
  let worktree = "";
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "skills-copies-"));
    clone = join(root, "clone");
    worktree = join(root, "worktree");
    await Bun.$`git clone --quiet --shared ${REPO} ${clone}`.quiet();
    await Bun.$`git -C ${clone} worktree add --quiet --detach ${worktree}`.quiet();
  });
  afterAll(() => rm(root, { recursive: true, force: true }));

  test("is refused to a linked worktree, though its main checkout would link, and nothing is written into it", async () => {
    const { home, discard } = await account();
    try {
      const said = await saidBy(asAccount(home, link(`${worktree}/`, home)));
      expect(said).toMatch(/linked worktree/);
      expect(said).toContain(clone);
      expect(await readdir(home), "the refused run wrote into the account's home").toEqual([]);
    } finally {
      await discard();
    }
  });

  test("is refused to an untracked directory inside the main checkout that git attributes to the checkout", async () => {
    const { home, discard } = await account();
    const nested = join(clone, "skills-nested-copy");
    await mkdir(nested, { recursive: true });
    try {
      expect(await saidBy(asAccount(home, link(`${nested}/`, home)))).toMatch(/git does not check out/);
      expect(await readdir(home)).toEqual([]);
    } finally {
      await rm(nested, { recursive: true, force: true });
      await discard();
    }
  });

  test("is refused to a linked worktree of a bare repository without naming the bare directory", async () => {
    const { home, discard } = await account();
    const bareRoot = await mkdtemp(join(tmpdir(), "skills-bare-"));
    try {
      const bare = join(bareRoot, "bare.git");
      const wt = join(bareRoot, "wt");
      await Bun.$`git clone --quiet --bare ${clone} ${bare}`.quiet();
      await Bun.$`git -C ${bare} worktree add --quiet --detach ${wt}`.quiet();
      const said = await saidBy(asAccount(home, link(`${wt}/`, home)));
      expect(said).toMatch(/linked worktree of a bare repository/);
      expect(said).not.toContain(bare);
      expect(await readdir(home)).toEqual([]);
    } finally {
      await rm(bareRoot, { recursive: true, force: true });
      await discard();
    }
  });

  test("is refused to a copy git does not check out before it generates, when it is installed", async () => {
    const { home, discard } = await account();
    try {
      expect(await saidBy(asAccount(home, install("/nonexistent-skills-copy/", home, PI_NOT_INSTALLED)))).toMatch(/git does not check out/);
      expect(await readdir(home)).toEqual([]);
    } finally {
      await discard();
    }
  });

  test("is refused to a linked worktree when $HOME reaches it through a link", async () => {
    const { home, discard } = await account();
    try {
      await symlink(home, `${home}-alias`);
      expect(await saidBy(asAccount(home, link(`${worktree}/`, `${home}-alias`)))).toMatch(/linked worktree/);
      expect(await readdir(home)).toEqual([]);
    } finally {
      await rm(`${home}-alias`, { force: true });
      await discard();
    }
  });

  test("is linked from a main checkout away from ~/Projects/skills, though its path is itself a link to the checkout", async () => {
    const { home, discard } = await account();
    try {
      await mkdir(join(home, "code"));
      await symlink(clone, join(home, "code/skills"));
      const outcomes = await valueOf(asAccount(home, link(`${home}/code/skills/`, home)));
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
