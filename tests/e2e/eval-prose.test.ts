import { afterAll, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { proseOf } from "../../evals/prose";
import { git } from "./gated-repo";

const repo = mkdtempSync(join(tmpdir(), "skills-eval-prose-"));
const DIR = "library/a-domain/rules/a-rule";
const FILE = `${DIR}/SKILL.md`;
const FRESH_DIR = "library/a-domain/rules/b-rule";
const COMMITTED = "---\nname: a-rule\n---\n\nSay it once.\n";

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

function write(file: string, text: string): void {
  mkdirSync(join(repo, file, ".."), { recursive: true });
  writeFileSync(join(repo, file), text);
}

git(repo, "init", "-q");
write(FILE, COMMITTED);
git(repo, "add", "-A");
git(repo, "commit", "-q", "-m", "start");

afterAll(() => rmSync(repo, { recursive: true, force: true }));

test("a Rule file as HEAD holds it is hashed and marked committed", () => {
  expect(proseOf(`${repo}/`, [DIR])).toEqual({ files: { [FILE]: sha256(COMMITTED) }, uncommitted: false });
});

test("a Rule file edited since HEAD is hashed as it stands and marked uncommitted", () => {
  const edited = `${COMMITTED}Say it twice.\n`;
  write(FILE, edited);
  try {
    expect(proseOf(`${repo}/`, [DIR])).toEqual({ files: { [FILE]: sha256(edited) }, uncommitted: true });
  } finally {
    write(FILE, COMMITTED);
  }
});

test("a Rule file HEAD does not hold marks the sweep uncommitted beside one it does", () => {
  const fresh = "---\nname: b-rule\n---\n\nNew.\n";
  write(`${FRESH_DIR}/SKILL.md`, fresh);
  expect(proseOf(`${repo}/`, [DIR, FRESH_DIR])).toEqual({
    files: { [FILE]: sha256(COMMITTED), [`${FRESH_DIR}/SKILL.md`]: sha256(fresh) },
    uncommitted: true,
  });
});
