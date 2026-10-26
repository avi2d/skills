import { expect, test } from "bun:test";
import { SWEEPS } from "../../src/eval/eval-sweeps";
import { REPO } from "../../src/generate/link";

const RECORDS = `${SWEEPS}/*.json`;

function git(...args: string[]): string {
  const done = Bun.spawnSync(["git", ...args], { cwd: REPO });
  expect(done.exitCode, done.stderr.toString()).toBe(0);
  return done.stdout.toString().trim();
}

// A branch squash-merges, so a record it adds and then drops before landing never reaches main.
function landed(): string {
  const main = Bun.spawnSync(["git", "rev-parse", "--verify", "-q", "origin/main"], { cwd: REPO });
  return main.exitCode === 0 ? git("merge-base", "HEAD", "origin/main") : git("rev-parse", "HEAD");
}

test("no commit edits, renames or deletes a sweep record once it has landed", () => {
  expect(git("log", "--diff-filter=MDRT", "--format=%h %s", "--name-status", landed(), "--", RECORDS)).toBe("");
});

test("no commit on this branch edits, renames or deletes a sweep record that has landed", () => {
  expect(git("diff", "--diff-filter=MDRT", "--name-status", landed(), "HEAD", "--", RECORDS)).toBe("");
});

test("no change waiting to be committed edits, renames or deletes a sweep record", () => {
  expect(git("diff", "HEAD", "--diff-filter=MDRT", "--name-status", "--", RECORDS)).toBe("");
});
