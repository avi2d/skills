import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { COMMIT_IDENTITY_REFUSAL, commitIdentity } from "../../src/dispatcher/commit-identity";

const repo = "/repo";
const refused = (command: string, cwd: string = repo): string | undefined => commitIdentity("bash", { command }, cwd);

test.each([
  "git commit --author='spark <spark@example.invalid>' -m 'x'",
  "git commit --author=spark -m 'x'",
  "git -c user.name=spark commit -m 'x'",
  "git -c user.email=spark@example.invalid commit -m 'x'",
  "git -cuser.name=spark commit -m 'x'",
  "GIT_AUTHOR_NAME=spark git commit -m 'x'",
  "GIT_COMMITTER_EMAIL=spark@example.invalid git commit -m 'x'",
  "export GIT_AUTHOR_NAME=spark && git commit -m 'x'",
  "env GIT_AUTHOR_NAME=spark git commit -m 'x'",
])("a commit that sets its own identity through %s is refused", (command) => {
  expect(refused(command)).toBe(COMMIT_IDENTITY_REFUSAL);
});

test.each([
  "git commit -m 'x'",
  "git -c core.pager=cat commit -m 'x'",
  "git status",
  "git commit -m '--author x'",
  "echo GIT_AUTHOR_NAME=spark",
  "GIT_AUTHOR_NAME=spark git status",
])("a commit that keeps the repository's identity, like %s, passes", (command) => {
  expect(refused(command)).toBeUndefined();
});

test("a non-bash tool and a non-string command pass", () => {
  expect(commitIdentity("powershell", { command: "git commit --author=x" }, repo)).toBeUndefined();
  expect(commitIdentity("bash", {}, repo)).toBeUndefined();
});

const fixture = mkdtempSync(join(tmpdir(), "skills-commit-identity-"));
afterAll(() => rmSync(fixture, { recursive: true, force: true }));

test("a fixture repository under the temp directory stays exempt", () => {
  expect(refused("git commit --author=spark -m 'x'", fixture)).toBeUndefined();
  mkdirSync(join(fixture, "repo"), { recursive: true });
  expect(refused("GIT_AUTHOR_NAME=spark git commit -m 'x'", join(fixture, "repo"))).toBeUndefined();
});
