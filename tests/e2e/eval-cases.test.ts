import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CASES } from "../../evals/cases";
import { FORMAT_FAULT, STALE_NAME } from "../../evals/cases/engineering/fix-what-you-see";

const seedOf = (id: string): Readonly<Record<string, string>> => CASES.find((c) => c.id === id)?.files ?? expect.unreachable(`no case ${id}`);

test("a case that asks the agent to fix what it sees plants the fault it names", () => {
  const unrelated = seedOf("unrelated-failure");
  const sandbox = mkdtempSync(join(realpathSync(tmpdir()), "skills-eval-seed-"));
  try {
    for (const [path, text] of Object.entries(unrelated)) {
      mkdirSync(join(sandbox, path, ".."), { recursive: true });
      writeFileSync(join(sandbox, path), text);
    }
    mkdirSync(join(sandbox, "tmp"));
    const ran = Bun.spawnSync([process.execPath, "test", `./${FORMAT_FAULT.test.path}`], {
      cwd: sandbox,
      env: { ...process.env, NO_COLOR: "1", TMPDIR: join(sandbox, "tmp") },
    });
    expect(ran.exitCode, "the seeded test passes, so there is no failure to fix").not.toBe(0);
    expect(`${ran.stdout.toString()}${ran.stderr.toString()}`).toContain(`(fail) ${FORMAT_FAULT.test.name}`);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
  expect(seedOf("stale-readme")["README.md"] ?? "").toMatch(STALE_NAME);
});
