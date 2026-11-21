import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkoutWarnings } from "../../src/generate/link";
import { valueOf } from "../lib/effect";

test("link warns for a non-main checkout and for main missing commits from origin/main, rather than treating stale settings as current", async () => {
  const repo = await mkdtemp(join(tmpdir(), "skills-link-checkout-"));
  try {
    await Bun.$`git init -q -b main`.cwd(repo).quiet();
    await Bun.write(join(repo, "settings.json"), "{}");
    await Bun.$`git add settings.json`.cwd(repo).quiet();
    await Bun.$`GIT_CONFIG_COUNT=0 git -c user.name=test -c user.email=test@example.invalid commit -q -m base`.cwd(repo).quiet();
    expect(await valueOf(checkoutWarnings(repo))).toContain("cannot compare HEAD with origin/main; fetch origin to check for updates");
    await Bun.$`git update-ref refs/remotes/origin/main HEAD`.cwd(repo).quiet();
    expect(await valueOf(checkoutWarnings(repo))).toEqual(["origin/main reflects the last fetch; fetch origin before linking to check for updates"]);
    await Bun.$`git switch -q -c newer`.cwd(repo).quiet();
    await Bun.write(join(repo, "settings.json"), '{"new":true}');
    await Bun.$`git add settings.json`.cwd(repo).quiet();
    await Bun.$`GIT_CONFIG_COUNT=0 git -c user.name=test -c user.email=test@example.invalid commit -q -m newer`.cwd(repo).quiet();
    await Bun.$`git update-ref refs/remotes/origin/main HEAD`.cwd(repo).quiet();
    expect(await valueOf(checkoutWarnings(repo))).toEqual([
      "checkout is on newer, not main",
      "origin/main reflects the last fetch; fetch origin before linking to check for updates",
    ]);
    await Bun.$`git switch -q main`.cwd(repo).quiet();
    expect(await valueOf(checkoutWarnings(repo))).toEqual([
      "checkout is missing 1 commit(s) from origin/main; fetch origin to check for updates",
    ]);
    await Bun.$`git switch -q --detach`.cwd(repo).quiet();
    expect(await valueOf(checkoutWarnings(repo))).toContain("checkout is on a detached HEAD, not main");
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});
