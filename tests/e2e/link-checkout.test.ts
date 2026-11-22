import { expect, test } from "bun:test";
import { chmod, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigProvider, Effect } from "effect";
import { checkoutWarnings } from "../../src/generate/link";
import { valueOf } from "../lib/effect";
import { scratchGitEnv } from "./lib/git";

const $ = new Bun.$.Shell().env(scratchGitEnv);

const warningsWith = (repo: string, env: Record<string, string>) =>
  checkoutWarnings(repo).pipe(Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromEnv({ env })));

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

test("origin check does not replace the user's configured or environment SSH command", async () => {
  const repo = await mkdtemp(join(tmpdir(), "skills-link-ssh-"));
  const savedSsh = process.env.GIT_SSH_COMMAND;
  const savedLegacySsh = process.env.GIT_SSH;
  const savedConfigGlobal = process.env.GIT_CONFIG_GLOBAL;
  const savedConfigNoSystem = process.env.GIT_CONFIG_NOSYSTEM;
  const savedArgs = process.env.SKILLS_SSH_ARGS;
  const savedRepo = process.env.SKILLS_SSH_REPO;
  try {
    await Bun.$`git init -q -b main`.cwd(repo).quiet();
    await Bun.$`git -c user.name=test -c user.email=test@example.invalid commit -q --allow-empty -m base`.cwd(repo).quiet();
    await Bun.$`git update-ref refs/remotes/origin/main HEAD`.cwd(repo).quiet();
    await Bun.$`git remote add origin ssh://example.invalid/repo`.cwd(repo).quiet();
    const configured = join(repo, "configured-ssh");
    const environment = join(repo, "environment-ssh");
    const args = join(repo, "ssh-args");
    for (const command of [configured, environment]) {
      await Bun.write(command, '#!/bin/sh\nprintf "%s\\n" "$0 $*" > "$SKILLS_SSH_ARGS"\ncase "$1" in -G) exit 0;; esac\nexec git-upload-pack "$SKILLS_SSH_REPO"\n');
      await chmod(command, 0o755);
    }
    process.env.SKILLS_SSH_ARGS = args;
    process.env.SKILLS_SSH_REPO = repo;
    process.env.GIT_CONFIG_GLOBAL = "/dev/null";
    process.env.GIT_CONFIG_NOSYSTEM = "1";
    delete process.env.GIT_SSH_COMMAND;
    delete process.env.GIT_SSH;
    await Bun.$`git config core.sshCommand ${configured}`.cwd(repo).quiet();
    expect(await valueOf(warningsWith(repo, {}))).toEqual([]);
    expect(await readFile(args, "utf8")).toContain(`${configured} -o BatchMode=yes`);
    expect(await valueOf(warningsWith(repo, { GIT_SSH_COMMAND: environment }))).toEqual([]);
    expect(await readFile(args, "utf8")).toContain(`${environment} -o BatchMode=yes`);
    await Bun.$`git config --unset core.sshCommand`.cwd(repo).quiet();
    const legacy = join(repo, "legacy ssh");
    await Bun.write(legacy, '#!/bin/sh\nprintf "%s\\n" "$0 $*" > "$SKILLS_SSH_ARGS"\ncase "$1" in -G) exit 0;; esac\nexec git-upload-pack "$SKILLS_SSH_REPO"\n');
    await chmod(legacy, 0o755);
    expect(await valueOf(warningsWith(repo, { GIT_SSH: legacy }))).toEqual([]);
    expect(await readFile(args, "utf8")).toContain(`${legacy} -o BatchMode=yes`);
  } finally {
    if (savedSsh === undefined) delete process.env.GIT_SSH_COMMAND;
    else process.env.GIT_SSH_COMMAND = savedSsh;
    if (savedLegacySsh === undefined) delete process.env.GIT_SSH;
    else process.env.GIT_SSH = savedLegacySsh;
    if (savedConfigGlobal === undefined) delete process.env.GIT_CONFIG_GLOBAL;
    else process.env.GIT_CONFIG_GLOBAL = savedConfigGlobal;
    if (savedConfigNoSystem === undefined) delete process.env.GIT_CONFIG_NOSYSTEM;
    else process.env.GIT_CONFIG_NOSYSTEM = savedConfigNoSystem;
    if (savedArgs === undefined) delete process.env.SKILLS_SSH_ARGS;
    else process.env.SKILLS_SSH_ARGS = savedArgs;
    if (savedRepo === undefined) delete process.env.SKILLS_SSH_REPO;
    else process.env.SKILLS_SSH_REPO = savedRepo;
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
