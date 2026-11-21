import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkoutWarnings } from "../../src/generate/link";
import { valueOf } from "../lib/effect";
import { scratchGitEnv } from "./lib/git";

const $ = new Bun.$.Shell().env(scratchGitEnv);

test("link warns for a non-main checkout and for main missing commits from origin/main, rather than treating stale settings as current", async () => {
  const repo = await mkdtemp(join(tmpdir(), "skills-link-checkout-"));
  try {
    await $`git init -q -b main`.cwd(repo).quiet();
    await Bun.write(join(repo, "settings.json"), "{}");
    await $`git add settings.json`.cwd(repo).quiet();
    await $`git -c user.name=test -c user.email=test@example.invalid commit -q -m base`.cwd(repo).quiet();
    expect(await valueOf(checkoutWarnings(repo))).toContain("cannot compare HEAD with origin/main; fetch origin to check for updates");
    await $`git update-ref refs/remotes/origin/main HEAD`.cwd(repo).quiet();
    expect(await valueOf(checkoutWarnings(repo))).toEqual([
      "cannot check origin/main for updates; fetch origin before linking to check for updates",
    ]);
    await $`git switch -q -c newer`.cwd(repo).quiet();
    await Bun.write(join(repo, "settings.json"), '{"new":true}');
    await $`git add settings.json`.cwd(repo).quiet();
    await $`git -c user.name=test -c user.email=test@example.invalid commit -q -m newer`.cwd(repo).quiet();
    await $`git update-ref refs/remotes/origin/main HEAD`.cwd(repo).quiet();
    expect(await valueOf(checkoutWarnings(repo))).toEqual([
      "checkout is on newer, not main",
      "cannot check origin/main for updates; fetch origin before linking to check for updates",
    ]);
    await $`git switch -q main`.cwd(repo).quiet();
    expect(await valueOf(checkoutWarnings(repo))).toEqual([
      "checkout is missing 1 commit(s) from origin/main; pull origin/main to check for updates",
    ]);
    await $`git switch -q --detach`.cwd(repo).quiet();
    expect(await valueOf(checkoutWarnings(repo))).toContain("checkout is on a detached HEAD, not main");
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("link stays quiet when ahead and warns when origin/main has commits HEAD lacks", async () => {
  const origin = await mkdtemp(join(tmpdir(), "skills-link-origin-"));
  const repo = await mkdtemp(join(tmpdir(), "skills-link-remote-"));
  const other = await mkdtemp(join(tmpdir(), "skills-link-other-"));
  try {
    await $`git init -q --bare -b main`.cwd(origin).quiet();
    await $`git config maintenance.auto false`.cwd(origin).quiet();
    await $`git init -q -b main`.cwd(repo).quiet();
    await Bun.write(join(repo, "settings.json"), "{}");
    await $`git add settings.json`.cwd(repo).quiet();
    await $`git -c user.name=test -c user.email=test@example.invalid commit -q -m base`.cwd(repo).quiet();
    await $`git remote add origin ${origin}`.cwd(repo).quiet();
    await $`git push -q origin main:main`.cwd(repo).quiet();
    await $`git fetch -q origin`.cwd(repo).quiet();
    expect(await valueOf(checkoutWarnings(repo))).toEqual([]);
    await $`git switch -q -c fm/main`.cwd(repo).quiet();
    await Bun.write(join(repo, "settings.json"), '{"fork":true}');
    await $`git add settings.json`.cwd(repo).quiet();
    await $`git -c user.name=test -c user.email=test@example.invalid commit -q -m fork`.cwd(repo).quiet();
    await $`git push -q origin fm/main`.cwd(repo).quiet();
    await $`git switch -q main`.cwd(repo).quiet();
    expect(await valueOf(checkoutWarnings(repo))).toEqual([]);
    await Bun.write(join(repo, "settings.json"), '{"new":true}');
    await $`git add settings.json`.cwd(repo).quiet();
    await $`git -c user.name=test -c user.email=test@example.invalid commit -q -m newer`.cwd(repo).quiet();
    expect(await valueOf(checkoutWarnings(repo))).toEqual([]);
    await $`git clone -q ${origin} ${other}`.quiet();
    await Bun.write(join(other, "settings.json"), '{"remote":true}');
    await $`git add settings.json`.cwd(other).quiet();
    await $`git -c user.name=test -c user.email=test@example.invalid commit -q -m remote`.cwd(other).quiet();
    await $`git push -q origin HEAD:main`.cwd(other).quiet();
    expect(await valueOf(checkoutWarnings(repo))).toEqual([
      "checkout differs from origin/main; pull origin/main to check for updates",
    ]);
  } finally {
    await rm(repo, { recursive: true, force: true });
    await rm(other, { recursive: true, force: true });
    await rm(origin, { recursive: true, force: true });
  }
});
