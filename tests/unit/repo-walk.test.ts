import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { dispatch, repoGlobs, type Event, type Index } from "../../src/dispatcher/dispatch";
import { START } from "../../src/dispatcher/run-state";
import { WALK_MAX_ENTRIES, repoFiles, standing, walkFiles } from "../../src/dispatcher/repo-walk";
import { injected } from "../lib/dispatch";
import { base, removeWalkDirs, walkDir } from "../lib/walk-dirs";
import type { ScopeCondition } from "../../src/dispatcher/scope-condition";

afterEach(removeWalkDirs);

function tree(files: readonly string[]): string {
  const dir = walkDir();
  for (const file of files) {
    mkdirSync(join(dir, dirname(file)), { recursive: true });
    writeFileSync(join(dir, file), "");
  }
  return dir;
}

function outsideGit<T>(run: () => T): T {
  const was = process.env.GIT_CEILING_DIRECTORIES;
  process.env.GIT_CEILING_DIRECTORIES = base;
  try {
    return run();
  } finally {
    if (was === undefined) delete process.env.GIT_CEILING_DIRECTORIES;
    else process.env.GIT_CEILING_DIRECTORIES = was;
  }
}

const typescript: ScopeCondition = { predicate: "repo-contains", glob: "**/*.{ts,tsx}" };

const ruled = (trigger: ScopeCondition): Index => ({
  harness: "pi",
  rules: [{ name: "typescript-best-practices", triggers: [trigger], text: "# typescript-best-practices\n\nNarrow it.\n" }],
  profiles: [],
  hub: [],
});

describe("the fallback walk", () => {
  test("a non-repository holding a .ts file fires the TypeScript-scoped rules", () => {
    const dir = tree(["src/a.ts", "README.md"]);
    const found = outsideGit(() => repoFiles(dir, repoGlobs(ruled(typescript))));
    expect(found.walked?.capped).toBe(false);
    const step = dispatch(ruled(typescript), { type: "prompt", files: found.files }, START);
    expect(injected(step.actions)).toEqual(["typescript-best-practices"]);
  });

  test("a non-repository holding no match fires nothing", () => {
    const dir = tree(["main.rs", "Cargo.toml"]);
    const found = outsideGit(() => repoFiles(dir, repoGlobs(ruled(typescript))));
    expect(found.walked?.capped).toBe(false);
    const step = dispatch(ruled(typescript), { type: "prompt", files: found.files }, START);
    expect(step.actions).toEqual([]);
  });

  test("a match for one rule's glob does not end the walk before another rule's glob is asked", () => {
    const config: ScopeCondition = { predicate: "repo-contains", glob: "**/*.{yaml,yml}" };
    const index: Index = {
      ...ruled(typescript),
      rules: [
        { name: "comment-discipline", triggers: [config], text: "# comment-discipline\n\nSay less.\n" },
        ...ruled(typescript).rules,
      ],
    };
    const dir = tree(["config.yaml", "src/a.ts"]);
    const found = outsideGit(() => repoFiles(dir, repoGlobs(index)));
    expect(found.walked?.capped).toBe(false);
    const step = dispatch(index, { type: "prompt", files: found.files }, START);
    expect(injected(step.actions)).toEqual(["comment-discipline", "typescript-best-practices"]);
  });

  test("a rule already injected is not asked about again", () => {
    const index = ruled(typescript);
    const dir = tree(["src/a.ts"]);
    expect(repoGlobs(index, ["typescript-best-practices"])).toEqual([]);
    expect(outsideGit(() => repoFiles(dir, repoGlobs(index, ["typescript-best-practices"])))).toEqual({ files: [] });
  });

  test("a walk already recorded for the directory answers without walking again", () => {
    const dir = tree(["src/a.ts"]);
    const recorded = { files: ["lib/b.ts"], capped: true };
    expect(outsideGit(() => repoFiles(dir, ["**/*.ts"], recorded))).toEqual({ files: ["lib/b.ts"] });
  });

  test("the walk answers only the files that matched a glob", () => {
    const dir = tree(["README.md", "a.yaml", "b.yaml", "src/c.ts"]);
    expect(walkFiles(dir, ["**/*.yaml", "**/*.ts"])).toEqual({ files: ["a.yaml", "src/c.ts"], capped: false });
  });

  test("a tree larger than the cap terminates within the bound", () => {
    const lush = Array.from({ length: 120 }, (_, n) => `pkg/${n}.ts`);
    const dir = tree(lush);
    const walked = walkFiles(dir, ["**/*.md"], { maxDepth: 6, maxEntries: 50 });
    expect(walked.capped).toBe(true);
    expect(walked.files.length).toBeLessThanOrEqual(50);
  });

  test("the depth cap leaves deeper files out of the answer", () => {
    const dir = tree(["deep/a/b/c/d/e.ts"]);
    const walked = walkFiles(dir, ["**/*.ts"], { maxDepth: 2, maxEntries: WALK_MAX_ENTRIES });
    expect(walked).toEqual({ files: [], capped: false });
  });

  test("directories that never hold user source are not descended into", () => {
    const dir = tree(["node_modules/only.ts", ".git/HEAD", "Library/Caches/x.ts", "src/ok.ts"]);
    const walked = walkFiles(dir, ["**/*.ts"]);
    expect(walked.capped).toBe(false);
    expect(walked.files).toEqual(["src/ok.ts"]);
  });

  test("no repo-contains trigger answers nothing without touching the tree", () => {
    expect(repoFiles("/does/not/exist", [])).toEqual({ files: [] });
  });

  test("an unreadable directory answers what could be read", () => {
    expect(walkFiles("/does/not/exist", ["**/*.ts"])).toEqual({ files: [], capped: false });
  });
});

describe("the walk recorded in a session's state", () => {
  const walked = { "/scratch": { files: ["a.ts"], capped: false } };

  test("a fresh session start forgets it", () => {
    const step = dispatch(ruled(typescript), { type: "session-start", carrying: false }, { ...START, walked });
    expect(step.state.walked).toBeUndefined();
  });

  test("a session carried on keeps it", () => {
    const step = dispatch(ruled(typescript), { type: "session-start", carrying: true }, { ...START, walked });
    expect(step.state.walked).toEqual(walked);
  });
});

describe("the path a write names its file by in its repository", () => {
  test("is the file's path from the nearest directory holding a .git, whether a directory or a worktree's file", () => {
    const dir = tree([".git/HEAD", "docs/guide.md", "nested/.git", "nested/docs/page.md"]);
    expect(standing(join(dir, "docs/guide.md")).inRepository()).toBe("docs/guide.md");
    expect(standing(join(dir, "nested/docs/page.md")).inRepository()).toBe("docs/page.md");
  });

  test("is found for a file the write creates, under directories that do not exist yet", () => {
    const dir = tree([".git/HEAD"]);
    expect(standing(join(dir, "docs/new/page.md")).inRepository()).toBe("docs/new/page.md");
  });

  test("is the real file's path when the write names it through a link from outside any repository", () => {
    const repository = tree([".git/HEAD", "global/AGENTS.md"]);
    const home = tree([".claude/.keep", ".config/.keep"]);
    symlinkSync(join(repository, "global/AGENTS.md"), join(home, ".claude/CLAUDE.md"));
    symlinkSync(repository, join(home, ".config/skills"));
    expect(standing(join(home, ".claude/CLAUDE.md")).inRepository()).toBe("global/AGENTS.md");
    expect(standing(join(home, ".config/skills/docs/new.md")).inRepository()).toBe("docs/new.md");
  });

  test("refuses a separator written through a link into a repository's agent file", () => {
    const repository = tree([".git/HEAD", "global/AGENTS.md"]);
    const home = tree([".claude/.keep"]);
    const link = join(home, ".claude/CLAUDE.md");
    symlinkSync(join(repository, "global/AGENTS.md"), link);
    const index: Index = {
      harness: "pi",
      rules: [{ name: "writing-for-people", triggers: [{ predicate: "always" }], text: "# People\n", forbid: "prose" }],
      profiles: [],
      hub: [],
    };
    const event: Event = { type: "tool-call", tool: "write", input: {}, writes: [link], changes: [{ path: link, before: standing(link), content: "Run the suite; it is fast.\n" }] };
    const refused = dispatch(index, event, START).actions.flatMap((action) => (action.type === "refuse" ? [action.text] : []));
    expect(refused).toHaveLength(1);
    expect(refused[0]).toContain("global/AGENTS.md:1 carries `;`, a semicolon");
  });

  test("is nothing for a file no repository holds", () => {
    const dir = tree(["docs/guide.md"]);
    expect(standing(join(dir, "docs/guide.md")).inRepository()).toBeUndefined();
  });
});
