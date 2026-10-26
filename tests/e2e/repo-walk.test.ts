import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repoFiles } from "../../src/dispatcher/repo-walk";
import { removeWalkDirs, walkDir } from "../lib/walk-dirs";

afterEach(removeWalkDirs);

describe("the fallback walk", () => {
  test("a directory that has become a repository is asked of git, not of a walk recorded before it was", () => {
    const dir = walkDir();
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src/a.ts"), "");
    execFileSync("git", ["init", "-q"], { cwd: dir });
    execFileSync("git", ["add", "src/a.ts"], { cwd: dir });
    const recorded = { files: [], capped: true };
    expect(repoFiles(dir, ["**/*.ts"], recorded)).toEqual({ files: ["src/a.ts"], tracked: true });
  });
});
