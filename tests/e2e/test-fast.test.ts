import { expect, setDefaultTimeout, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { REPO } from "../../src/generate/link";
import { git, scratchRepo } from "./gated-repo.ts";

setDefaultTimeout(60_000);

const PASSING = 'import { expect, test } from "bun:test";\ntest("passes", () => expect(1).toBe(1));\n';
const FAILING = 'import { expect, test } from "bun:test";\ntest("fails", () => expect(1).toBe(2));\n';

function write(dir: string, rel: string, content: string): void {
  const file = join(dir, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function base(dir: string): void {
  write(dir, "package.json", JSON.stringify({ name: "test-fast-fixture", type: "module" }));
  write(dir, join("tests", "unit", "a.test.ts"), PASSING);
}

function commit(dir: string, message: string): void {
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", message);
}

async function fast(dir: string, root: string): Promise<{ exitCode: number; text: string }> {
  const ran = await Bun.$`bun ${REPO}scripts/test-fast.ts`.cwd(dir).env({ TMPDIR: root }).quiet().nothrow();
  return { exitCode: ran.exitCode, text: ran.stdout.toString() + ran.stderr.toString() };
}

test("a change touching only unit files runs no e2e files", async () => {
  const { root, dir, remove } = scratchRepo(undefined);
  try {
    base(dir);
    commit(dir, "test: base fixture");
    write(dir, join("tests", "unit", "c.test.ts"), PASSING);
    commit(dir, "test: add a unit file");
    const out = await fast(dir, root);
    expect(out.text).toContain("the change touches no e2e test files, so only the unit tier ran");
    expect(out.exitCode).toBe(0);
  } finally {
    remove();
  }
});

test("a change touching an e2e file runs that file", async () => {
  const { root, dir, remove } = scratchRepo(undefined);
  try {
    base(dir);
    commit(dir, "test: base fixture");
    write(dir, join("tests", "e2e", "b.test.ts"), PASSING);
    commit(dir, "test: add an e2e file");
    const out = await fast(dir, root);
    expect(out.text).toContain("the change touches 1 e2e test file(s): tests/e2e/b.test.ts");
    expect(out.exitCode).toBe(0);
  } finally {
    remove();
  }
});

test("a failing touched e2e file fails the step", async () => {
  const { root, dir, remove } = scratchRepo(undefined);
  try {
    base(dir);
    commit(dir, "test: base fixture");
    write(dir, join("tests", "e2e", "b.test.ts"), FAILING);
    commit(dir, "test: add a failing e2e file");
    const out = await fast(dir, root);
    expect(out.exitCode).toBe(1);
  } finally {
    remove();
  }
});

test("a clone without the remote-tracking default branch fails before any tier runs", async () => {
  const { root, dir, remove } = scratchRepo(undefined, { trusted: false });
  try {
    base(dir);
    commit(dir, "test: base fixture");
    const out = await fast(dir, root);
    expect(out.text).toContain("cannot find where HEAD branched from origin/main");
    expect(out.text).not.toContain("tier ran");
    expect(out.text).not.toContain("e2e test file");
    expect(out.exitCode).toBe(2);
  } finally {
    remove();
  }
});
