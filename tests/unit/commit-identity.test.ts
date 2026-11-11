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

test("a target holding a variable the command never assigns stays refused even from a temp working directory", () => {
  expect(refused("cd \"$d\" && git commit --author=spark -m 'x'", fixture)).toBe(COMMIT_IDENTITY_REFUSAL);
});

test.each([
  "d=$(mktemp -d); cd \"$d\" && git init -q && git -c user.name=t -c user.email=t@example.com commit -q -m x",
  "d=$(mktemp -d) && cd \"$d\" && git commit --author=spark -m 'x'",
  "d=\"$(mktemp -d)\"; cd $d && git -c user.name=t commit -m x",
  "d=`mktemp -d`; git -C \"$d\" -c user.name=t commit -m x",
  "d=$(mktemp -d -t fixture.XXXXXX); git -C \"${d}\" -c user.name=t commit -m x",
  "d=$(mktemp -d /tmp/fixture.XXXXXX); cd \"$d\"; git -c user.name=t commit -m x",
  "R=$(mktemp -d); G=$R/repo; mkdir -p $G && cd $G && git init -q && git -c user.name=t commit -m x",
  "G=/tmp/x/repo; git -C $G -c user.name=t -c user.email=t@example.com commit -m x",
  "tmp=$(mktemp -d); cp /tmp/seed $tmp/ && cd $tmp && git init -q && git -c user.name=t commit -m x",
  "d=$(mktemp -d /tmp/d.XXXX); cd $d && git -c user.name=t commit -m x",
  "repo=$(mktemp -d); cd \"$repo\" && git init -q && git -c user.name=t commit -m \"init repo\"",
  "t=$(mktemp -d); cd $t && git init -q && git -c user.name=t commit -m x",
])("a commit into a temp directory held in a shell variable stays exempt: %s", (command) => {
  expect(refused(command)).toBeUndefined();
});

test.each([
  "d=/repo; cd \"$d\" && git -c user.name=t commit -m x",
  "d=$(pwd); cd \"$d\" && git -c user.name=t commit -m x",
  "d=$(git rev-parse --show-toplevel); git -C \"$d\" -c user.name=t commit -m x",
  "d=$(mktemp -d -p /repo); cd \"$d\" && git -c user.name=t commit -m x",
  "d=$(mktemp -d --tmpdir=/repo); cd \"$d\" && git -c user.name=t commit -m x",
  "d=$(mktemp -d /repo/fixture.XXXXXX); cd \"$d\" && git -c user.name=t commit -m x",
  "d=/tmp/x; d=/repo; cd \"$d\" && git -c user.name=t commit -m x",
  "d=$(mktemp -d) | cat; cd \"$d\" && git -c user.name=t commit -m x",
  "d=/tmp/x git -C $d -c user.name=t commit -m x",
  "d=$(mktemp -d) git -C \"$d\" -c user.name=t commit -m x",
  "d=$(mktemp -d) cd \"$d\" && git -c user.name=t commit -m x",
  "d=$(mktemp -d fixture.XXXXXX); cd \"$d\" && git -c user.name=t commit -m x",
  "d=$(mktemp -d -t /tmp/x.XXXX); cd \"$d\"; git -c user.name=t commit -m x",
  "f=$(mktemp -u); cd \"$f\"; git -c user.name=t commit -m x",
  "f=$(mktemp); cd \"$f\"; git -c user.name=t commit -m x",
  "d=$(mktemp -d); if [ -n \"$KEEP\" ]; then d=/repo; fi; git -C \"$d\" -c user.name=t commit -m x",
  "d=/tmp/x; for i in 1; do d=/repo; done; git -C $d -c user.name=t commit -m x",
  "d=$(mktemp -d); { d=/repo; }; git -C $d -c user.name=t commit -m x",
  "d=$(mktemp -d); ! d=/repo; git -C $d -c user.name=t commit -m x",
  "d=/tmp/x; read d < /tmp/f; git -C $d -c user.name=t commit -m x",
  "d=/tmp/x; f() { d=/repo; }; f; git -C $d -c user.name=t commit -m x",
  "test -n \"$CI\" && d=/tmp/x; git -C \"$d\" -c user.name=t commit -m x",
  "false && d=/tmp/x; git -C \"$d\" -c user.name=t commit -m x",
  "grep -q x f && d=/tmp/x; git -C \"$d\" -c user.name=t commit -m x",
  "d=/tmp/x; IFS= read -r d < f; git -C $d -c user.name=t commit -m x",
  "d=/tmp/x; printf -v d %s /repo; git -C $d -c user.name=t commit -m x",
  "d=/tmp/x; mapfile -t d < f; git -C $d -c user.name=t commit -m x",
  "d=/tmp/x; readarray -t d < f; git -C $d -c user.name=t commit -m x",
  "d=/tmp/x; getopts a d; git -C $d -c user.name=t commit -m x",
  "d=/tmp/x; d+=/../../repo; git -C $d -c user.name=t commit -m x",
  "d=/tmp/x; unset d; git -C \"$d\" -c user.name=t commit -m x",
  "d=/tmp/x; source ./f; git -C $d -c user.name=t commit -m x",
  "d=/tmp/x; . ./f; git -C $d -c user.name=t commit -m x",
  "d=$(mktemp -d); eval \"$(cat f)\"; git -C $d -c user.name=t commit -m x",
  "d=/tmp/x & git -C \"$d\" -c user.name=t commit -m x",
  "d=$(mktemp -d) & git -C \"$d\" -c user.name=t commit -m x",
  "true; d=/tmp/x & git -C \"$d\" -c user.name=t commit -m x",
  "export d=/tmp/x & git -C \"$d\" -c user.name=t commit -m x",
  "d=$(mktemp -d); cd \"$d\" & git -c user.name=t commit -m x",
  "git -c user.name=\"$(git config user.name)\" -c user.email=\"$(git config user.email)\" commit -m x",
])("a variable that does not resolve into the temp directory leaves the commit refused: %s", (command) => {
  expect(refused(command)).toBe(COMMIT_IDENTITY_REFUSAL);
});

test("a not yet created path under an unexpanded temp variable stays refused", () => {
  expect(refused("cd $TMPDIR/new && git commit --author=spark -m 'x'")).toBe(COMMIT_IDENTITY_REFUSAL);
});

test("a cd to a missing temp path linked with a semicolon never moves the commit target", () => {
  expect(refused("cd /tmp/skills-commit-identity-missing; git commit --author=spark -m 'x'")).toBe(
    COMMIT_IDENTITY_REFUSAL,
  );
});

test("a missing temp path the same command creates stays exempt through and-only links", () => {
  expect(
    refused("mkdir -p /tmp/skills-commit-identity-made && cd /tmp/skills-commit-identity-made && git commit --author=spark -m 'x'"),
  ).toBeUndefined();
});
