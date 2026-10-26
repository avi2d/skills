import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PROJECT_FILE, readProject } from "../../src/dispatcher/project";
import { git } from "./gated-repo";

describe("reading the package.json of the repository a session stands in", () => {
  const base = realpathSync(tmpdir());
  const made: string[] = [];
  afterEach(() => {
    for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  const scratch = (): string => {
    const dir = mkdtempSync(join(base, "skills-project-"));
    made.push(dir);
    return dir;
  };

  const initialised = (): string => {
    const dir = scratch();
    git(dir, "init", "-q");
    return dir;
  };

  test("the file at the git root is read from any directory under it", () => {
    const root = initialised();
    writeFileSync(join(root, PROJECT_FILE), JSON.stringify({ dependencies: { effect: "4.0.0-rc.115" } }));
    mkdirSync(join(root, "src", "deep"), { recursive: true });
    expect(readProject(join(root, "src", "deep"))).toEqual({ path: join(root, PROJECT_FILE), declares: ["effect"], on: [], off: [] });
  });

  test("a repository without the file declares nothing, and is no problem to report", () => {
    expect(readProject(initialised())).toBeUndefined();
  });

  test("a directory outside any repository has no root to read from", () => {
    const was = process.env.GIT_CEILING_DIRECTORIES;
    process.env.GIT_CEILING_DIRECTORIES = base;
    try {
      const dir = scratch();
      writeFileSync(join(dir, PROJECT_FILE), JSON.stringify({ dependencies: { effect: "4.0.0-rc.115" } }));
      expect(readProject(dir)).toBeUndefined();
    } finally {
      if (was === undefined) delete process.env.GIT_CEILING_DIRECTORIES;
      else process.env.GIT_CEILING_DIRECTORIES = was;
    }
  });

  test("a file that is there and cannot be read is unreadable, not absent", () => {
    const root = initialised();
    mkdirSync(join(root, PROJECT_FILE));
    const project = readProject(root) ?? expect.unreachable("a package.json that is a directory read as no file at all");
    expect("unreadable" in project && project.unreadable).toStartWith("could not be read: ");
  });
});
