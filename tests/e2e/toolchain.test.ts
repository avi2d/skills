import { expect, test } from "bun:test";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Schema } from "effect";
import { scratchGitEnv } from "./lib/git";

const repo = new URL("../../", import.meta.url).pathname;

const json = async (rel: string): Promise<unknown> => JSON.parse(await Bun.file(`${repo}${rel}`).text());

const Anything = Schema.Record(Schema.String, Schema.Unknown);
const Names = Schema.Record(Schema.String, Schema.String);
const decodeTsconfig = Schema.decodeUnknownSync(
  Schema.Struct({
    extends: Schema.optionalKey(Schema.Union([Schema.String, Schema.Array(Schema.String)])),
    include: Schema.optionalKey(Schema.Array(Schema.String)),
    compilerOptions: Schema.optionalKey(Anything),
  }),
);
const decodeManifest = Schema.decodeUnknownSync(
  Schema.Struct({
    scripts: Names,
    dependencies: Schema.optionalKey(Names),
    devDependencies: Schema.optionalKey(Names),
  }),
);
const Step = Schema.StructWithRest(
  Schema.Struct({
    id: Schema.optionalKey(Schema.String),
    run: Schema.optionalKey(Schema.String),
  }),
  [Anything],
);
const Job = Schema.StructWithRest(
  Schema.Struct({
    steps: Schema.Array(Step),
    if: Schema.optionalKey(Schema.String),
    needs: Schema.optionalKey(Schema.Union([Schema.String, Schema.Array(Schema.String)])),
  }),
  [Anything],
);
const decodeWorkflow = Schema.decodeUnknownSync(
  Schema.StructWithRest(Schema.Struct({ on: Anything, jobs: Schema.Record(Schema.String, Job) }), [Anything]),
);
const decodeDiagnostics = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Struct({ summary: Schema.Struct({ filesChecked: Schema.Int, totalFiles: Schema.Int }) })),
);

const root = decodeTsconfig(await json("tsconfig.json"));

const spawnStartupMs = 10_000;
const spawnMsPerCheckedFile = 250;
const checkedCount = (root.include ?? []).flatMap((pattern) =>
  [...new Bun.Glob(pattern).scanSync({ cwd: repo, onlyFiles: true })]
);
const spawnTimeoutMs = spawnStartupMs + checkedCount.length * spawnMsPerCheckedFile;
const extended = root.extends === undefined ? [] : [root.extends].flat();
const bases = await Promise.all(
  extended.map(async (name) => decodeTsconfig(await json(name.startsWith("./") ? name : `node_modules/${name}`)).compilerOptions ?? {}),
);
const tsconfig = [...bases, root.compilerOptions].reduce<Record<string, unknown>>((merged, options) => ({ ...merged, ...options }), {});
const manifest = decodeManifest(await json("package.json"));
const { scripts } = manifest;
const declared = Object.entries({ ...manifest.dependencies, ...manifest.devDependencies });

const workflow = decodeWorkflow(Bun.YAML.parse(await Bun.file(`${repo}.github/workflows/ci.yml`).text()));

test("the flags the compiler decides a rule with are on, and stay on", () => {
  for (const flag of ["strict", "noUncheckedIndexedAccess", "erasableSyntaxOnly"]) {
    expect(tsconfig[flag], `tsconfig weakens ${flag}, and a rule body was deleted on the strength of it`).toBe(true);
  }
});

test("the typecheck reads every file in the project, so a silent pass is not one of its outcomes", () => {
  const ran = Bun.spawnSync([`${repo}node_modules/.bin/effect-tsgo`, "diagnostics", "--project", "tsconfig.json", "--format", "json"], {
    cwd: repo,
  });
  const { summary } = decodeDiagnostics(ran.stdout.toString());
  expect(summary.totalFiles, "the project holds no files to check").toBeGreaterThan(0);
  expect(summary.filesChecked, "the language service passed over the project without reading it").toBe(summary.totalFiles);
}, { timeout: spawnTimeoutMs });

test("both checks run where a violation fails the run", () => {
  expect(scripts.lint?.split(" && ")).toEqual(["oxlint", "checks-lint"]);
  const typecheck = (scripts.typecheck ?? "").split("&&").map((command) => command.trim().split(" ").slice(0, 2).join(" "));
  expect(typecheck, "the typecheck does not run both the compiler and the Effect diagnostics").toEqual(["tsc --noEmit", "effect-tsgo diagnostics"]);
});

const testJobs = Object.entries(workflow.jobs).filter(([, job]) => job.steps.some((step) => step.id === "test"));

test("each test job runs its tier through scripts/ci-test.sh, so a bare checks-ci test step cannot skip the tests that need the pinned e2e tools", () => {
  expect(testJobs.map(([name]) => name).toSorted()).toEqual(["e2e", "unit"]);
  for (const [name, job] of testJobs) {
    expect(job.steps.find((step) => step.id === "test")?.run, `the ${name} job runs its tier some other way`).toBe(`scripts/ci-test.sh ${name}`);
  }
});

test("scripts/ci-test.sh runs the tier in an empty temp directory under the runner's and fails the job when the suite leaves anything there", () => {
  const runnerTemp = mkdtempSync(join(tmpdir(), "skills-runner-temp-"));
  const bin = mkdtempSync(join(tmpdir(), "skills-fake-bunx-"));
  const record = join(bin, "record");
  const fakeBunx = [
    "#!/bin/sh",
    `printf '%s|%s|%s|%s\\n' "$TEST_TIER" "$*" "$TMPDIR" "$(ls -A "$TMPDIR")" > ${record}`,
    'if [ -n "$LEAVE" ]; then mkdir "$TMPDIR/skills-read-index-left"; fi',
  ];
  writeFileSync(join(bin, "bunx"), `${fakeBunx.join("\n")}\n`);
  chmodSync(join(bin, "bunx"), 0o755);
  const run = (leave: boolean) =>
    Bun.spawnSync([`${repo}scripts/ci-test.sh`, "unit"], {
      cwd: repo,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}`, RUNNER_TEMP: runnerTemp, LEAVE: leave ? "1" : "" },
    });
  try {
    const clean = run(false);
    expect(clean.exitCode, clean.stderr.toString()).toBe(0);
    expect(readFileSync(record, "utf8")).toBe(`unit|checks-ci test|${runnerTemp}/suite-tmp|\n`);
    rmSync(join(runnerTemp, "suite-tmp"), { recursive: true });
    const dirty = run(true);
    expect(dirty.stderr.toString()).toContain("skills-read-index-left");
    expect(dirty.exitCode).toBe(1);
  } finally {
    rmSync(runnerTemp, { recursive: true, force: true });
    rmSync(bin, { recursive: true, force: true });
  }
});

test("the leftover check fails on an entry in the temp directory and passes on an empty one", () => {
  const dir = mkdtempSync(join(tmpdir(), "skills-tmp-clean-"));
  try {
    const run = () => Bun.spawnSync([`${repo}scripts/check-tmp-clean.sh`], { env: { ...process.env, TMPDIR: dir } });
    expect(run().exitCode).toBe(0);
    mkdirSync(join(dir, "skills-read-index-left"));
    const dirty = run();
    expect(dirty.stderr.toString()).toContain("skills-read-index-left");
    expect(dirty.exitCode).toBe(1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const gitEnv = {
  ...scratchGitEnv,
  PATH: `${repo}node_modules/.bin:${dirname(process.execPath)}:${process.env.PATH ?? ""}`,
};

const scratchRepo = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "skills-ci-wiring-"));
  const ran = Bun.spawnSync(["git", "init", "-q", "-b", "main"], { cwd: dir, env: gitEnv });
  expect(ran.exitCode, `git init: ${ran.stderr.toString()}`).toBe(0);
  return dir;
};

const checksCiWiring = (dir: string): { exitCode: number; output: string } => {
  const ran = Bun.spawnSync([`${repo}node_modules/.bin/checks-ci-wiring`], { cwd: dir, env: gitEnv });
  return { exitCode: ran.exitCode, output: `${ran.stdout.toString()}${ran.stderr.toString()}` };
};

test("the workflows are the set checks-workflows writes, so every required command runs on a pull request to main", () => {
  const ran = checksCiWiring(repo);
  expect(ran.output).toContain("holds the set checks-workflows writes");
  expect(ran.exitCode).toBe(0);
}, { timeout: spawnStartupMs });

test("a declared gate whose step leaves the workflows fails the wiring check, naming the gate", () => {
  const dir = scratchRepo();
  try {
    copyFileSync(`${repo}package.json`, join(dir, "package.json"));
    const workflows = join(dir, ".github/workflows");
    mkdirSync(workflows, { recursive: true });
    for (const name of readdirSync(`${repo}.github/workflows`)) {
      copyFileSync(`${repo}.github/workflows/${name}`, join(workflows, name));
    }
    const jobs = Object.fromEntries(
      Object.entries(workflow.jobs).map(([name, job]) => [name, { ...job, steps: job.steps.filter((step) => step.run !== "bun run typecheck") }]),
    );
    const withoutTypecheck = { ...workflow, jobs };
    writeFileSync(join(workflows, "ci.yml"), JSON.stringify(withoutTypecheck));
    const ran = checksCiWiring(dir);
    expect(ran.output).toContain("bun run typecheck");
    expect(ran.exitCode).toBe(1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, { timeout: spawnStartupMs });

test("the fleet-names scan runs in the docs job, which a docs-only change does not skip, so a docs edit that names the fleet fails its pull request", () => {
  expect(scripts["docs:build"]?.split(" && ")).toContain("bun test tests/e2e/fleet-names.test.ts");
  const docs = workflow.jobs["docs"] ?? expect.unreachable("ci.yml has no docs job");
  expect(docs.steps.map((step) => step.run)).toContain("bun run docs:build");
  expect(docs.if ?? "", "the docs job skips a docs-only change").not.toContain("docs-only");
  expect([workflow.jobs["checks"]?.needs ?? []].flat(), "the gate does not wait for the docs job").toContain("docs");
});

test("no dependency is a path only one checkout has, so a clone and a worktree install the same tree", () => {
  const local = declared.filter(([, spec]) => spec.startsWith("file:") || spec.startsWith("link:"));
  expect(local, "a dependency resolves beside this checkout, which a clone and a worktree do not come with").toEqual([]);
});

test("a dependency fetched from a repository names the commit, not a branch that moves under it", () => {
  const rangeOrTag = /^[^/:#]*$/;
  const loose = declared.filter(([, spec]) => !rangeOrTag.test(spec) && !/^(?:file|link):/.test(spec) && !/#[0-9a-f]{40}$/.test(spec));
  expect(loose, "a repository dependency is pinned to a ref that can move, so two installs are two trees").toEqual([]);
});
