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

function commit(dir: string, message: string): void {
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", message);
}

async function local(dir: string, root: string): Promise<{ exitCode: number; text: string }> {
  const ran = await Bun.$`bun ${REPO}scripts/test-local.ts`.cwd(dir).env({ TMPDIR: root }).quiet().nothrow();
  return { exitCode: ran.exitCode, text: ran.stdout.toString() + ran.stderr.toString() };
}

test("the whole unit and e2e tiers run with no change touching them", async () => {
  const { root, dir, remove } = scratchRepo(undefined);
  try {
    write(dir, "package.json", JSON.stringify({ name: "test-local-fixture", type: "module" }));
    write(dir, join("tests", "unit", "a.test.ts"), PASSING);
    write(dir, join("tests", "e2e", "b.test.ts"), PASSING);
    commit(dir, "test: base fixture");
    const out = await local(dir, root);
    expect(out.text).toContain("tests/unit/a.test.ts");
    expect(out.text).toContain("tests/e2e/b.test.ts");
    expect(out.exitCode).toBe(0);
  } finally {
    remove();
  }
});

test("a failing unit test fails the step and no e2e file runs", async () => {
  const { root, dir, remove } = scratchRepo(undefined);
  try {
    write(dir, "package.json", JSON.stringify({ name: "test-local-fixture", type: "module" }));
    write(dir, join("tests", "unit", "a.test.ts"), FAILING);
    write(dir, join("tests", "e2e", "b.test.ts"), PASSING);
    commit(dir, "test: base fixture");
    const out = await local(dir, root);
    expect(out.text).toContain("tests/unit/a.test.ts");
    expect(out.text).not.toContain("tests/e2e/b.test.ts");
    expect(out.exitCode).toBe(1);
  } finally {
    remove();
  }
});
