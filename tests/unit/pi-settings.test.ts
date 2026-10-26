import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { lstatSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Schema } from "effect";
import { REPO, link } from "../../src/generate/link";
import { piSettingsFile } from "../lib/harness-settings";
import { saidBy, valueOf } from "../lib/effect";

// Each test links into a fresh $HOME, which a loaded machine slows past bun's 5s default.
setDefaultTimeout(30_000);

describe("pi's settings file", () => {
  const SETTINGS = ".pi/agent/settings.json";
  const PI_OWN = ["deviceId", "lastChangelogVersion", "trackingId"];
  const decodeObject = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)));
  const parsed = async (path: string) => decodeObject(await readFile(path, "utf8"));
  const checkoutOnly = Object.fromEntries(Object.entries(piSettingsFile).filter(([key]) => !PI_OWN.includes(key)));

  const seeded = async () => {
    const root = await mkdtemp(join(tmpdir(), "skills-pi-settings-"));
    const repo = `${root}/repo/`;
    const home = `${root}/home`;
    await mkdir(`${repo}harness/pi`, { recursive: true });
    await cp(`${REPO}harness/pi/settings.json`, `${repo}harness/pi/settings.json`);
    const tracked = `${repo}harness/pi/settings.json`;
    return { repo, home, live: `${home}/${SETTINGS}`, tracked, discard: () => rm(root, { recursive: true, force: true }) };
  };
  const outcomeOf = async (repo: string, home: string) =>
    (await valueOf(link(repo, home))).find((o) => o.home === SETTINGS) ?? expect.unreachable(`link reported nothing for ~/${SETTINGS}`);

  test("is written as a file of the machine's own, holding the checkout's settings and none of the keys pi writes itself", async () => {
    const { repo, home, live, discard } = await seeded();
    try {
      expect(await outcomeOf(repo, home)).toEqual({ home: SETTINGS, state: "written", replaced: [] });
      expect(lstatSync(live).isSymbolicLink(), "pi would write its own keys through a link into the checkout").toBe(false);
      expect(await parsed(live)).toEqual(checkoutOnly);
    } finally {
      await discard();
    }
  });

  test("takes the keys pi writes itself, leaves the checkout's file as it was, and keeps them through the next link", async () => {
    const { repo, home, live, tracked, discard } = await seeded();
    try {
      await valueOf(link(repo, home));
      const before = await readFile(tracked, "utf8");
      const { SettingsManager } = await import("@earendil-works/pi-coding-agent");
      const pi = SettingsManager.create(home, `${home}/.pi/agent`);
      pi.setLastChangelogVersion("9.9.9");
      await pi.flush();
      await writeFile(live, JSON.stringify({ ...(await parsed(live)), deviceId: "device-of-this-machine" }, null, 2));

      expect(await readFile(tracked, "utf8"), "pi's write reached the checkout").toBe(before);
      expect(await outcomeOf(repo, home)).toEqual({ home: SETTINGS, state: "kept" });
      expect(await parsed(live)).toEqual({ ...checkoutOnly, lastChangelogVersion: "9.9.9", deviceId: "device-of-this-machine" });
    } finally {
      await discard();
    }
  });

  test("replaces a link into the checkout with a file of its own, keeping the deviceId pi wrote through the link", async () => {
    const { repo, home, live, tracked, discard } = await seeded();
    try {
      const dirtied = JSON.stringify({ ...piSettingsFile, lastChangelogVersion: "1.0.0", deviceId: "device-of-this-machine" }, null, 2);
      await writeFile(tracked, dirtied);
      await mkdir(`${home}/.pi/agent`, { recursive: true });
      await symlink(tracked, live);

      expect(await outcomeOf(repo, home)).toEqual({ home: SETTINGS, state: "written", replaced: [] });
      expect(lstatSync(live).isSymbolicLink(), "the link into the checkout is still there").toBe(false);
      expect(await parsed(live)).toEqual({ ...checkoutOnly, lastChangelogVersion: "1.0.0", deviceId: "device-of-this-machine" });
      expect(await readFile(tracked, "utf8"), "the linker wrote through the old link into the checkout").toBe(dirtied);
    } finally {
      await discard();
    }
  });

  test("replaces a setting changed inside pi with the checkout's, and names each one with the value pi held", async () => {
    const { repo, home, live, discard } = await seeded();
    try {
      await valueOf(link(repo, home));
      await writeFile(live, JSON.stringify({ ...(await parsed(live)), theme: "dark", hideThinkingBlock: false, deviceId: "kept" }, null, 2));

      expect(await outcomeOf(repo, home)).toEqual({
        home: SETTINGS,
        state: "written",
        replaced: [
          { key: "hideThinkingBlock", was: false },
          { key: "theme", was: "dark" },
        ],
      });
      expect(await parsed(live)).toEqual({ ...checkoutOnly, deviceId: "kept" });
    } finally {
      await discard();
    }
  });

  test("refuses a file that holds no JSON object, naming it, and leaves it as it was", async () => {
    const { repo, home, live, discard } = await seeded();
    try {
      await mkdir(`${home}/.pi/agent`, { recursive: true });
      await writeFile(live, "{ not json");
      expect(await saidBy(link(repo, home))).toContain(live);
      expect(await readFile(live, "utf8")).toBe("{ not json");
    } finally {
      await discard();
    }
  });
});
