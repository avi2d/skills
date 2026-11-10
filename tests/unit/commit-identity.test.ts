import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

test.each([
  "git -c author.name=spark commit -m 'x'",
  "git -c committer.email=spark@example.invalid commit -m 'x'",
  "git --config-env=user.name=GIT_WHO commit -m 'x'",
  "git -cuser.name=spark commit -m 'x'",
  "sudo git -c user.name=spark commit -m 'x'",
  "env -u UNUSED GIT_AUTHOR_NAME=spark git commit -m 'x'",
  "env GIT_AUTHOR_NAME=spark git -c user.name=x commit -m 'x'",
])("a commit that sets its identity through %s is refused", (command) => {
  expect(refused(command)).toBe(COMMIT_IDENTITY_REFUSAL);
});

test("a cd that a subshell, a pipeline, or a function body discards never moves the commit target", () => {
  expect(refused(`(cd ${fixture} && git status); git commit --author=spark -m 'x'`)).toBe(COMMIT_IDENTITY_REFUSAL);
  expect(refused(`cd ${fixture} | cat && git commit --author=spark -m 'x'`)).toBe(COMMIT_IDENTITY_REFUSAL);
  expect(refused(`shim() { cd ${fixture}; }; git commit --author=spark -m 'x'`)).toBe(COMMIT_IDENTITY_REFUSAL);
  expect(refused("echo 'shim() {' && git commit --author=spark -m 'x'")).toBe(COMMIT_IDENTITY_REFUSAL);
  expect(refused(`(cd ${fixture} && git commit --author=spark -m 'x')`)).toBeUndefined();
});

test("the commit target follows the repository selectors, and the work tree never moves it", () => {
  expect(refused(`GIT_DIR=/repo/.git git commit --author=spark -m 'x'`, fixture)).toBe(COMMIT_IDENTITY_REFUSAL);
  expect(refused(`git --git-dir=${fixture} commit --author=spark -m 'x'`)).toBeUndefined();
  expect(refused(`git --work-tree=/repo commit --author=spark -m 'x'`, fixture)).toBeUndefined();
});

test("a .git file pointer moves the commit target, even from a subdirectory", () => {
  const pointed = join(fixture, "pointed");
  mkdirSync(join(pointed, "sub"), { recursive: true });
  writeFileSync(join(pointed, ".git"), "gitdir: /repo-external\n");
  expect(refused("git commit --author=spark -m 'x'", pointed)).toBe(COMMIT_IDENTITY_REFUSAL);
  expect(refused("git commit --author=spark -m 'x'", join(pointed, "sub"))).toBe(COMMIT_IDENTITY_REFUSAL);
});

test("a non-bash tool and a non-string command pass", () => {
  expect(commitIdentity("powershell", { command: "git commit --author=x" }, repo)).toBeUndefined();
  expect(commitIdentity("bash", {}, repo)).toBeUndefined();
});

const fixture = mkdtempSync(join(tmpdir(), "skills-commit-identity-"));
afterAll(() => rmSync(fixture, { recursive: true, force: true }));

test("a commit aimed into the temp directory stays exempt, and one aimed out of it is refused", () => {
  expect(refused(`git -C ${fixture} commit --author=spark -m 'x'`)).toBeUndefined();
  expect(refused(`git -C ${repo} commit --author=spark -m 'x'`, fixture)).toBe(COMMIT_IDENTITY_REFUSAL);
  expect(refused(`cd ${fixture} && git commit --author=spark -m 'x'`)).toBeUndefined();
  expect(refused(`cd ${repo} && git commit --author=spark -m 'x'`, fixture)).toBe(COMMIT_IDENTITY_REFUSAL);
});

test("a fixture repository under the temp directory stays exempt", () => {
  expect(refused("git commit --author=spark -m 'x'", fixture)).toBeUndefined();
  mkdirSync(join(fixture, "repo"), { recursive: true });
  expect(refused("GIT_AUTHOR_NAME=spark git commit -m 'x'", join(fixture, "repo"))).toBeUndefined();
});

test("a not yet created path under /tmp stays exempt through its nearest existing ancestor", () => {
  expect(refused("cd /tmp/skills-commit-identity-missing && git commit --author=spark -m 'x'")).toBeUndefined();
});

test("a target holding an unexpanded variable stays refused even from a temp working directory", () => {
  expect(refused("d=$(mktemp -d) && cd \"$d\" && git commit --author=spark -m 'x'")).toBe(COMMIT_IDENTITY_REFUSAL);
  expect(refused("cd \"$d\" && git commit --author=spark -m 'x'", fixture)).toBe(COMMIT_IDENTITY_REFUSAL);
});

test("a not yet created path under an unexpanded temp variable stays refused and names a literal path", () => {
  expect(refused("cd $TMPDIR/new && git commit --author=spark -m 'x'")).toBe(COMMIT_IDENTITY_REFUSAL);
  expect(refused("cd $TMPDIR/new && git commit --author=spark -m 'x'")).toContain("literal path");
});
