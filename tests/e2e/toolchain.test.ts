import { expect, test } from "bun:test";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Schema } from "effect";

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
    if: Schema.optionalKey(Schema.Union([Schema.Boolean, Schema.String])),
    env: Schema.optionalKey(Names),
    "continue-on-error": Schema.optionalKey(Schema.Union([Schema.Boolean, Schema.String])),
  }),
  [Anything],
);
type WorkflowStep = typeof Step.Type;
const Job = Schema.StructWithRest(Schema.Struct({ steps: Schema.Array(Step) }), [Anything]);
const decodeWorkflow = Schema.decodeUnknownSync(Schema.StructWithRest(Schema.Struct({ jobs: Schema.Record(Schema.String, Job) }), [Anything]));
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

  expect(Object.values(workflow.jobs), "the ci workflow declares one job").toHaveLength(1);
});

test("the suite runs in a temp directory of its own, and anything it leaves there fails the job", () => {
  const [job = expect.unreachable("the ci workflow declares no job")] = Object.values(workflow.jobs);
  const suite = job.steps.findIndex((step) => step.run === "bun run test");
  const suiteTmp = job.steps[suite]?.env?.TMPDIR ?? expect.unreachable("the suite runs in the job's shared temp directory");
  const runnerTemp = mkdtempSync(join(tmpdir(), "skills-runner-temp-"));
  const resolveTmp = (value: string) => value.replaceAll("${{ runner.temp }}", runnerTemp);
  const sharesSuiteTmp = (step: (typeof job.steps)[number]) => step.env?.TMPDIR === suiteTmp;
  const runStep = (step: (typeof job.steps)[number]) =>
    Bun.spawnSync(["bash", "--noprofile", "--norc", "-eo", "pipefail", "-c", step.run ?? ""], {
      cwd: repo,
      env: { ...process.env, RUNNER_TEMP: runnerTemp, TMPDIR: resolveTmp(suiteTmp) },
    });
  try {
    const suiteDir = resolveTmp(suiteTmp);
    expect(suiteDir, "the suite's temp directory is not a directory under the runner's temp").toStartWith(`${runnerTemp}/`);
    for (const step of job.steps.slice(0, suite).filter(sharesSuiteTmp)) {
      expect(runStep(step).exitCode, `${step.run} fails before the suite runs`).toBe(0);
    }
    expect(readdirSync(suiteDir), "the suite's temp directory does not start out empty").toEqual([]);

    const checks = job.steps.slice(suite + 1).filter(sharesSuiteTmp);
    for (const step of checks) {
      expect(runStep(step).exitCode, `${step.run} fails a suite that left nothing behind`).toBe(0);
    }
    mkdirSync(join(suiteDir, "skills-read-index-left"));
    const failing = checks.filter((step) => runStep(step).exitCode !== 0);
    expect(failing.length, "nothing after the suite fails on what it left in its temp directory").toBeGreaterThan(0);
    for (const step of failing) {
      expect(step["continue-on-error"], `${step.run} lets the job pass when it fails`).toBeUndefined();
    }
  } finally {
    rmSync(runnerTemp, { recursive: true, force: true });
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
  ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_"))),
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
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

test("every required command runs on a pull request to main", () => {
  const ran = checksCiWiring(repo);
  expect(ran.output).toContain("pull requests to main");
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

type Context = Readonly<Record<string, string>>;

const substitute = (value: string, context: Context): string =>
  value.replaceAll(/\$\{\{\s*([\w.-]+)\s*\}\}/g, (_, path: string) => context[path] ?? "");

const runs = (condition: string, context: Context): boolean =>
  condition
    .replace(/^\s*\$\{\{([\s\S]*)\}\}\s*$/, "$1")
    .split("&&")
    .every((term) => {
      const trimmed = term.trim();
      if (["always()", "success()", "true"].includes(trimmed)) return true;
      if (trimmed === "false") return false;
      const [, path = "", operator, literal = ""] =
        /^([\w.-]+)\s*(==|!=)\s*'([^']*)'$/.exec(trimmed) ?? expect.unreachable(`the test cannot evaluate ${trimmed}`);
      return ((context[path] ?? "").toLowerCase() === literal.toLowerCase()) === (operator === "==");
    });

const gitIn = (dir: string, args: ReadonlyArray<string>): string => {
  const ran = Bun.spawnSync(["git", "-c", "user.name=ci", "-c", "user.email=ci@example.com", ...args], { cwd: dir, env: gitEnv });
  expect(ran.exitCode, `git ${args.join(" ")}: ${ran.stderr.toString()}`).toBe(0);
  return ran.stdout.toString().trim();
};

const contextAfterChange = (steps: ReadonlyArray<WorkflowStep>, changed: string, event: "pull_request" | "push"): Context => {
  const referenced = new Set(steps.flatMap((step) => [...String(step.if ?? "").matchAll(/steps\.([\w-]+)\.outputs\./g)].map((match) => match[1])));
  const dir = scratchRepo();
  try {
    gitIn(dir, ["commit", "-q", "--allow-empty", "-m", "base"]);
    const base = gitIn(dir, ["rev-parse", "HEAD"]);
    mkdirSync(join(dir, dirname(changed)), { recursive: true });
    writeFileSync(join(dir, changed), "change\n");
    gitIn(dir, ["add", "-A"]);
    gitIn(dir, ["commit", "-q", "-m", "change"]);
    const context: Record<string, string> = {
      "github.event_name": event,
      ...(event === "pull_request" ? { "github.event.pull_request.base.sha": base } : {}),
    };
    const output = join(dir, ".git", "github-output");
    for (const step of steps.filter((candidate) => candidate.id !== undefined && referenced.has(candidate.id))) {
      writeFileSync(output, "");
      const env = Object.fromEntries(Object.entries(step.env ?? {}).map(([name, value]) => [name, substitute(value, context)]));
      const ran = Bun.spawnSync(["bash", "--noprofile", "--norc", "-eo", "pipefail", "-c", step.run ?? ""], {
        cwd: dir,
        env: { ...gitEnv, ...env, GITHUB_OUTPUT: output },
      });
      expect(ran.exitCode, `step ${step.id} fails: ${ran.stderr.toString()}`).toBe(0);
      for (const line of readFileSync(output, "utf8").split("\n").filter(Boolean)) {
        const [name = "", ...value] = line.split("=");
        context[`steps.${step.id}.outputs.${name}`] = value.join("=");
      }
    }
    return context;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test("a code change and a push run the suite with its temp setup and leftover check, and a docs-only change skips them and still lints and builds", () => {
  const [job = expect.unreachable("the ci workflow declares no job")] = Object.values(workflow.jobs);
  const suiteTmp = job.steps.find((step) => step.run === "bun run test")?.env?.TMPDIR ?? expect.unreachable("the suite runs in the job's shared temp directory");
  const suiteSteps = job.steps.filter((step) => step.env?.TMPDIR === suiteTmp);
  const kept = ["bunx checks-commit-title", "bun run build", "git diff --exit-code", "bun run lint"];
  const keptSteps = job.steps.filter((step) => kept.includes(step.run ?? ""));
  expect(new Set(keptSteps.map((step) => step.run))).toEqual(new Set(kept));
  const scheduled = (selected: ReadonlyArray<WorkflowStep>, context: Context) =>
    Object.fromEntries(selected.map((step) => [step.run, runs(String(step.if ?? "success()"), context)]));
  const every = (selected: ReadonlyArray<WorkflowStep>, ran: boolean) => Object.fromEntries(selected.map((step) => [step.run, ran]));

  const code = contextAfterChange(job.steps, "src/feature.ts", "pull_request");
  const docs = contextAfterChange(job.steps, "docs/guide.md", "pull_request");
  const push = contextAfterChange(job.steps, "docs/guide.md", "push");
  expect(scheduled(suiteSteps, code), "a code change skips part of the suite").toEqual(every(suiteSteps, true));
  expect(scheduled(suiteSteps, push), "a push to main skips part of the suite").toEqual(every(suiteSteps, true));
  expect(scheduled(suiteSteps, docs), "a docs-only change still runs part of the suite").toEqual(every(suiteSteps, false));
  expect(scheduled(keptSteps, docs), "a docs-only change skips a check that holds its docs and title").toEqual(every(keptSteps, true));
}, { timeout: 3 * spawnStartupMs });

test("no dependency is a path only one checkout has, so a clone and a worktree install the same tree", () => {
  const local = declared.filter(([, spec]) => spec.startsWith("file:") || spec.startsWith("link:"));
  expect(local, "a dependency resolves beside this checkout, which a clone and a worktree do not come with").toEqual([]);
});

test("a dependency fetched from a repository names the commit, not a branch that moves under it", () => {
  const rangeOrTag = /^[^/:#]*$/;
  const loose = declared.filter(([, spec]) => !rangeOrTag.test(spec) && !/^(?:file|link):/.test(spec) && !/#[0-9a-f]{40}$/.test(spec));
  expect(loose, "a repository dependency is pinned to a ref that can move, so two installs are two trees").toEqual([]);
});
