import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { lstatSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Effect, Schema } from "effect";
import { REPO, graftsInto, link } from "../../src/generate/link";
import { UserConfigSource, type UserConfig } from "../../src/generate/user-config";
import { saidBy, valueOf } from "../lib/effect";

// Each test links into a fresh $HOME, which a loaded machine slows past bun's 5s default.
setDefaultTimeout(30_000);

const FROM = "harness/claude-code/settings.json";

const CONFIG_DIRS = [".claude-work", ".config/claude-other"];

const linkWith = (config: UserConfig, repo: string, home: string) =>
  link(repo, home).pipe(Effect.provideService(UserConfigSource, Effect.succeed(config)));

test("each Claude config dir the config names is given the checkout's hooks in its settings.json, and only those", () => {
  expect(graftsInto(CONFIG_DIRS)).toEqual({
    ".claude-work/settings.json": { from: FROM, keys: ["hooks"] },
    ".config/claude-other/settings.json": { from: FROM, keys: ["hooks"] },
  });
  expect(graftsInto([])).toEqual({});
});

describe("a Claude config dir's settings file", () => {
  const accounts = Object.keys(graftsInto(CONFIG_DIRS));
  const decodeObject = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)));
  const parsed = async (path: string) => decodeObject(await readFile(path, "utf8"));
  const ACCOUNT_OWN = { statusLine: { type: "command", command: "account-statusline", refreshInterval: 30 }, theme: "account-theme" };

  const seeded = async (accountFile: string | undefined) => {
    const root = await mkdtemp(join(tmpdir(), "skills-claude-account-"));
    const repo = `${root}/repo/`;
    const home = `${root}/home`;
    await cp(`${REPO}harness`, `${repo}harness`, { recursive: true });
    if (accountFile !== undefined) {
      for (const rel of accounts) {
        await mkdir(dirname(`${home}/${rel}`), { recursive: true });
        await writeFile(`${home}/${rel}`, accountFile);
      }
    }
    const tracked = await parsed(`${repo}${FROM}`);
    return { repo, home, tracked, discard: () => rm(root, { recursive: true, force: true }) };
  };
  const outcomesOf = async (repo: string, home: string, config: UserConfig = { claudeConfigDirs: CONFIG_DIRS }) =>
    (await valueOf(linkWith(config, repo, home))).filter((o) => accounts.includes(o.home));

  test("gains the checkout's hooks and keeps the account's own statusLine and theme, not the checkout's", async () => {
    const { repo, home, tracked, discard } = await seeded(JSON.stringify(ACCOUNT_OWN));
    try {
      expect(tracked.statusLine, "the checkout's statusLine matches the account's, so this proves nothing").not.toEqual(ACCOUNT_OWN.statusLine);
      expect(await outcomesOf(repo, home)).toEqual(accounts.map((rel) => ({ home: rel, state: "written", replaced: [] })));
      for (const rel of accounts) {
        expect(lstatSync(`${home}/${rel}`).isSymbolicLink(), "Claude Code would write the account's keys through a link into the checkout").toBe(false);
        expect(await parsed(`${home}/${rel}`)).toEqual({ ...ACCOUNT_OWN, hooks: tracked.hooks });
      }
    } finally {
      await discard();
    }
  });

  test("is kept as it is on the next link, so running it again changes nothing", async () => {
    const { repo, home, discard } = await seeded(JSON.stringify(ACCOUNT_OWN));
    try {
      await outcomesOf(repo, home);
      expect(await outcomesOf(repo, home)).toEqual(accounts.map((rel) => ({ home: rel, state: "kept" })));
    } finally {
      await discard();
    }
  });

  test("is written holding only the hooks for an account not yet logged into, rather than the checkout's whole settings", async () => {
    const { repo, home, tracked, discard } = await seeded(undefined);
    try {
      await outcomesOf(repo, home);
      for (const rel of accounts) expect(await parsed(`${home}/${rel}`)).toEqual({ hooks: tracked.hooks });
    } finally {
      await discard();
    }
  });

  test("has hooks of its own replaced with the checkout's, naming each with the value the account held", async () => {
    const ownHooks = { Stop: [{ hooks: [{ type: "command", command: "account-hook" }] }] };
    const { repo, home, tracked, discard } = await seeded(JSON.stringify({ ...ACCOUNT_OWN, hooks: ownHooks }));
    try {
      expect(await outcomesOf(repo, home)).toEqual(accounts.map((rel) => ({ home: rel, state: "written", replaced: [{ key: "hooks", was: ownHooks }] })));
      for (const rel of accounts) expect(await parsed(`${home}/${rel}`)).toEqual({ ...ACCOUNT_OWN, hooks: tracked.hooks });
    } finally {
      await discard();
    }
  });

  test("is refused when it holds no JSON object, naming it, and left as it was", async () => {
    const { repo, home, discard } = await seeded("{ not json");
    try {
      const [first = expect.unreachable("no account listed")] = accounts;
      expect(await saidBy(linkWith({ claudeConfigDirs: CONFIG_DIRS }, repo, home))).toContain(`${home}/${first}`);
      for (const rel of accounts) expect(await readFile(`${home}/${rel}`, "utf8")).toBe("{ not json");
    } finally {
      await discard();
    }
  });

  test("is left unwritten when the config names no Claude config dir, rather than grafted where no harness reads it", async () => {
    const { repo, home, discard } = await seeded(undefined);
    try {
      expect(await outcomesOf(repo, home, {})).toEqual([]);
      for (const rel of accounts) expect(lstatSync(`${home}/${rel}`, { throwIfNoEntry: false })).toBeUndefined();
    } finally {
      await discard();
    }
  });
});
