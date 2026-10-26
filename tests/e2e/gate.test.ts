import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CHANGED_FILES, CHANGED_FILES_LIMIT_BYTES, changedFiles, fingerprint, sight, verify } from "../../src/dispatcher/gate";
import type { Check } from "../../src/dispatcher/verdict";
import { git, scratchRepo, type Scratch } from "./gated-repo";

setDefaultTimeout(30_000);

const made: Scratch[] = [];
afterEach(() => {
  for (const scratch of made.splice(0)) scratch.remove();
});

const repoWith = (config: string | undefined, options: { trusted?: boolean; setUp?: boolean } = {}): Scratch => {
  const scratch = scratchRepo(config, options);
  made.push(scratch);
  return scratch;
};

describe("where the gate reads the checks from", () => {
  test("a directory outside any repository has no gate", () => {
    const { root } = repoWith(undefined);
    expect(sight(root)).toBeUndefined();
  });

  test("the primary working tree is gated, and a linked worktree of the same repository is not, from anywhere in it", () => {
    const { root, dir } = repoWith("commands:\n  test: bun test\n");
    const linked = join(root, "linked");
    git(dir, "worktree", "add", "-q", "--detach", linked);
    mkdirSync(join(linked, "deep"));
    const primary = sight(dir);
    expect(primary && "gate" in primary ? primary.gate.root : primary).toBe(dir);
    expect(sight(linked), "a linked worktree was gated").toBeUndefined();
    expect(sight(join(linked, "deep")), "a directory inside a linked worktree was gated").toBeUndefined();
  });

  test("a checkout with skills.verdictGate off has no gate", () => {
    const { dir } = repoWith("commands:\n  test: bun test\n");
    const before = sight(dir);
    expect(before && "gate" in before ? before.gate.root : before, "an unset checkout was not gated").toBe(dir);
    git(dir, "config", "--local", "skills.verdictGate", "off");
    expect(sight(dir), "an opted-out checkout was gated").toBeUndefined();
    expect(sight(join(dir, "a.txt")), "an opted-out checkout was gated from a path inside it").toBeUndefined();
  });

  test("a checkout with any other skills.verdictGate value is still gated", () => {
    const { dir } = repoWith("commands:\n  test: bun test\n");
    git(dir, "config", "--local", "skills.verdictGate", "on");
    const found = sight(dir);
    expect(found && "gate" in found ? found.gate.root : found).toBe(dir);
  });

  test("the opt-out holds only the checkout that sets it", () => {
    const first = repoWith("commands:\n  test: bun test\n");
    const second = repoWith("commands:\n  test: bun test\n");
    git(first.dir, "config", "--local", "skills.verdictGate", "off");
    expect(sight(first.dir), "an opted-out checkout was gated").toBeUndefined();
    const kept = sight(second.dir);
    expect(kept && "gate" in kept ? kept.gate.root : kept).toBe(second.dir);
  });

  test("a repository with no .no-mistakes.yaml has no gate", () => {
    expect(sight(repoWith(undefined).dir)).toBeUndefined();
  });

  test("a clone no-mistakes was never set up for has no gate, whatever its file declares", () => {
    expect(sight(repoWith("commands:\n  test: bun test\n", { setUp: false }).dir)).toBeUndefined();
    expect(sight(repoWith("commands: {test: bun test}\n", { setUp: false }).dir), "a stranger's file was read at all").toBeUndefined();
  });

  test("a repository whose file declares no test or lint has no gate", () => {
    expect(sight(repoWith("commands:\n  prepare: bun install\n").dir)).toBeUndefined();
  });

  test("the checks are the default branch's, and asked for from anywhere in the tree", () => {
    const { dir } = repoWith("commands:\n  test: bun test\n  lint: oxlint\n");
    mkdirSync(join(dir, "deep"));
    const found = sight(join(dir, "deep"));
    expect(found && "gate" in found ? found.gate : found).toMatchObject({
      root: dir,
      checks: [
        { name: "test", command: "bun test" },
        { name: "lint", command: "oxlint" },
      ],
    });
  });

  test("a session editing the working tree's copy does not change the checks, unless the default branch allows repo commands", () => {
    const strict = repoWith("commands:\n  test: bun test\n");
    writeFileSync(join(strict.dir, ".no-mistakes.yaml"), "commands:\n  test: 'true'\n");
    const held = sight(strict.dir);
    expect(held && "gate" in held ? held.gate.checks : held).toEqual([{ name: "test", command: "bun test" }]);

    const open = repoWith("allow_repo_commands: true\ncommands:\n  test: bun test\n");
    writeFileSync(join(open.dir, ".no-mistakes.yaml"), "allow_repo_commands: true\ncommands:\n  test: bun test --bail\n");
    const honoured = sight(open.dir);
    expect(honoured && "gate" in honoured ? honoured.gate.checks : honoured).toEqual([{ name: "test", command: "bun test --bail" }]);
  });

  test("a repository with a .no-mistakes.yaml and no origin/HEAD says why it cannot be gated rather than going quiet", () => {
    const found = sight(repoWith("commands:\n  test: bun test\n", { trusted: false }).dir);
    expect(found && "unreadable" in found ? found.unreadable : found).toContain("no origin/HEAD");
  });

  test("a trusted file in a form the reader does not decode says so", () => {
    const found = sight(repoWith("commands: {test: bun test}\n").dir);
    expect(found && "unreadable" in found ? found.unreadable : found).toContain("block mapping");
  });
});

describe("the tree the gate judges", () => {
  test("it is the same while nothing changes, and changes with a tracked edit, a new file and a commit", () => {
    const { dir } = repoWith("commands:\n  test: bun test\n");
    const seen = new Set<string | undefined>([fingerprint(dir)]);
    expect(fingerprint(dir), "reading the tree twice gave two answers").toBe([...seen][0]);

    const changes: Array<[string, () => void]> = [
      ["a tracked edit", () => writeFileSync(join(dir, "a.txt"), "edited\n")],
      ["a new file", () => writeFileSync(join(dir, "b.txt"), "new\n")],
      ["a commit", () => git(dir, "commit", "-q", "-am", "edit")],
    ];
    for (const [label, change] of changes) {
      change();
      const now = fingerprint(dir);
      expect(seen.has(now), `${label} left the tree looking unchanged`).toBe(false);
      seen.add(now);
    }
  });

  test("an ignored file is not part of it, so installing dependencies or building costs no verify", () => {
    const { dir } = repoWith("commands:\n  test: bun test\n");
    const before = fingerprint(dir);
    mkdirSync(join(dir, "ignored"));
    writeFileSync(join(dir, "ignored", "out.js"), "built\n");
    expect(fingerprint(dir)).toBe(before);
  });
});

describe("the changed files a check runs with", () => {
  const check = (name: Check["name"], command: string): Check => ({ name, command });

  test("staged, unstaged and untracked paths are listed once and sorted, and a deletion is not", () => {
    const { dir } = repoWith(undefined);
    writeFileSync(join(dir, "a.txt"), "edited\n");
    writeFileSync(join(dir, "staged.sh"), "echo staged\n");
    git(dir, "add", "staged.sh", "a.txt");
    writeFileSync(join(dir, "a.txt"), "edited again\n");
    writeFileSync(join(dir, "untracked.sh"), "echo new\n");
    git(dir, "rm", "-q", ".gitignore");
    expect(changedFiles(dir)).toEqual(["a.txt", "staged.sh", "untracked.sh"]);
  });

  test("every check runs with the settle's changed files on SKILLS_CHANGED_FILES", async () => {
    const { dir } = repoWith(undefined);
    writeFileSync(join(dir, "a.txt"), "edited\n");
    writeFileSync(join(dir, "b.txt"), "new\n");
    const { verdict } = await verify(dir, [check("lint", `printf '%s' "$${CHANGED_FILES}" > seen.txt`)]);
    expect(verdict).toEqual({ outcome: "passed", checks: ["lint"] });
    expect(readFileSync(join(dir, "seen.txt"), "utf8")).toBe("a.txt\nb.txt");
  });

  test("a tree with nothing changed runs its checks with an empty listing", async () => {
    const { dir } = repoWith(undefined);
    expect(changedFiles(dir)).toEqual([]);
    const { verdict } = await verify(dir, [check("lint", `[ -z "$${CHANGED_FILES}" ]`)]);
    expect(verdict).toEqual({ outcome: "passed", checks: ["lint"] });
  });

  test("a listing past the limit leaves the variable unset, and the check still runs", async () => {
    const { dir } = repoWith(undefined);
    const name = (at: number): string => `${String(at).padStart(4, "0")}-${"x".repeat(200)}.sh`;
    const count = Math.ceil(CHANGED_FILES_LIMIT_BYTES / name(0).length) + 1;
    for (let at = 0; at < count; at += 1) writeFileSync(join(dir, name(at)), "");
    expect(changedFiles(dir).join("\n").length).toBeGreaterThan(CHANGED_FILES_LIMIT_BYTES);
    const { verdict } = await verify(dir, [check("lint", `[ -z "$\{${CHANGED_FILES}+set}" ]`)]);
    expect(verdict).toEqual({ outcome: "passed", checks: ["lint"] });
  });

  test("a check the system refuses to start is inconclusive, and the verdict still returns", async () => {
    const { dir } = repoWith(undefined);
    const padding = "SKILLS_TEST_PADDING";
    process.env[padding] = "x".repeat(4 * 1024 * 1024);
    try {
      const { verdict } = await verify(dir, [check("lint", "true")]);
      expect(verdict).toMatchObject({ outcome: "inconclusive", why: expect.stringContaining("`true` could not be started") });
    } finally {
      delete process.env[padding];
    }
  });

  test("files landed since the baseline commit are listed, even with a clean tree", async () => {
    const { dir } = repoWith(undefined);
    const base = git(dir, "rev-parse", "HEAD").trim();
    writeFileSync(join(dir, "landed.sh"), "echo landed\n");
    git(dir, "add", "landed.sh");
    git(dir, "commit", "-q", "-m", "land");
    expect(changedFiles(dir, base)).toEqual(["landed.sh"]);
    const { verdict } = await verify(dir, [check("lint", `printf '%s' "$${CHANGED_FILES}" > seen.txt`)], undefined, base);
    expect(verdict).toEqual({ outcome: "passed", checks: ["lint"] });
    expect(readFileSync(join(dir, "seen.txt"), "utf8")).toBe("landed.sh");
  });

  test("the listing unions the landed range with the working tree's own changes", () => {
    const { dir } = repoWith(undefined);
    const base = git(dir, "rev-parse", "HEAD").trim();
    writeFileSync(join(dir, "landed.sh"), "echo landed\n");
    git(dir, "add", "landed.sh");
    git(dir, "commit", "-q", "-m", "land");
    writeFileSync(join(dir, "a.txt"), "edited\n");
    writeFileSync(join(dir, "new.sh"), "echo new\n");
    expect(changedFiles(dir, base)).toEqual(["a.txt", "landed.sh", "new.sh"]);
  });

  test("a file the landing added and the tree then deleted is not listed", () => {
    const { dir } = repoWith(undefined);
    const base = git(dir, "rev-parse", "HEAD").trim();
    writeFileSync(join(dir, "landed.sh"), "echo landed\n");
    writeFileSync(join(dir, "kept.sh"), "echo kept\n");
    git(dir, "add", "landed.sh", "kept.sh");
    git(dir, "commit", "-q", "-m", "land");
    rmSync(join(dir, "landed.sh"));
    expect(changedFiles(dir, base)).toEqual(["kept.sh"]);
    git(dir, "rm", "-q", "--cached", "landed.sh");
    expect(changedFiles(dir, base)).toEqual(["kept.sh"]);
  });

  test("a landed file the tree then replaced with a directory is not listed, and the directory's own file is", () => {
    const { dir } = repoWith(undefined);
    const base = git(dir, "rev-parse", "HEAD").trim();
    writeFileSync(join(dir, "script.sh"), "echo landed\n");
    git(dir, "add", "script.sh");
    git(dir, "commit", "-q", "-m", "land");
    rmSync(join(dir, "script.sh"));
    mkdirSync(join(dir, "script.sh"));
    writeFileSync(join(dir, "script.sh", "inner.sh"), "echo inner\n");
    expect(changedFiles(dir, base)).toEqual(["script.sh/inner.sh"]);
  });

  test("a dangling symlink the settle added is listed", () => {
    const { dir } = repoWith(undefined);
    symlinkSync("missing.sh", join(dir, "link.sh"));
    expect(changedFiles(dir)).toEqual(["link.sh"]);
  });

  test("a baseline commit the repository no longer knows falls back to the working tree's changes", () => {
    const { dir } = repoWith(undefined);
    writeFileSync(join(dir, "a.txt"), "edited\n");
    expect(changedFiles(dir, "0".repeat(40))).toEqual(["a.txt"]);
  });

  test("a descendant still under the check in a process group of its own is killed when the budget runs out, and the verdict still returns", async () => {
    const { dir } = repoWith(undefined);
    const alive = join(dir, "alive");
    const escapee = join(dir, "escapee");
    const command = `set -m; (while true; do date +%s >> "${alive}"; sleep 1; done) & echo $! > "${escapee}"; `
      + `until [ -s "${alive}" ]; do sleep 0.1; done; wait`;
    const escapeePid = (): number | undefined => {
      const pid = existsSync(escapee) ? Number(readFileSync(escapee, "utf8").trim()) : NaN;
      return Number.isInteger(pid) && pid > 0 ? pid : undefined;
    };
    const signalled = (pid: number): string => {
      try {
        process.kill(pid, 0);
        return "alive";
      } catch (e) {
        return e instanceof Error && "code" in e ? String(e.code) : String(e);
      }
    };
    const cleanup = (): void => {
      const pid = escapeePid();
      if (pid === undefined) return;
      try {
        process.kill(pid, "SIGKILL");
      } catch {
      }
    };
    try {
      const began = Date.now();
      const { verdict } = await verify(dir, [check("test", command)], 10);
      expect(Date.now() - began, "the verdict hung past its budget").toBeLessThan(30_000);
      expect(verdict).toEqual({ outcome: "overran", why: `\`${command}\` was still running when the gate's 10s ran out` });
      expect(existsSync(alive), "the descendant never started writing inside the budget").toBe(true);
      const pid = escapeePid();
      if (pid !== undefined) {
        const reaped = Date.now() + 2000;
        while (signalled(pid) === "alive" && Date.now() < reaped) await new Promise((resolve) => setTimeout(resolve, 50));
        expect(signalled(pid), "the escaped child outlived the kill").toBe("ESRCH");
      }
      const lines = (): number => readFileSync(alive, "utf8").split("\n").filter((line) => line !== "").length;
      const first = lines();
      await new Promise((resolve) => setTimeout(resolve, 3000));
      expect(lines(), "the escaped child kept writing after the kill").toBe(first);
    } finally {
      cleanup();
    }
  }, 30_000);
});
