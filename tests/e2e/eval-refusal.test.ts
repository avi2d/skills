import { afterAll, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { REPO } from "../../src/generate/link";

const scratch = mkdtempSync(join(tmpdir(), "skills-eval-refusal-"));
const report = join(scratch, "report");
const sweeps = join(scratch, "sweeps");
const REFUSAL_MS = 120_000;

function evalWith(knobs: Record<string, string>): { exitCode: number; output: string } {
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("EVAL_")));
  const done = Bun.spawnSync([process.execPath, "run", "eval"], {
    cwd: REPO,
    timeout: REFUSAL_MS,
    env: { ...inherited, EVAL_REPORT_DIR: report, EVAL_SWEEP_DIR: sweeps, ...knobs },
  });
  return { exitCode: done.exitCode, output: `${done.stdout.toString()}${done.stderr.toString()}` };
}

function leftBehind(): string[] {
  return [report, sweeps].filter((dir) => existsSync(dir));
}

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

test(
  "a sweep refused for its size tells the person running it why, and writes no report and no record",
  () => {
    const ran = evalWith({ EVAL_MAX_RUNS: "1" });
    expect(ran.exitCode).not.toBe(0);
    expect(ran.output).toContain("above the cap of 1");
    expect(leftBehind()).toEqual([]);
  },
  REFUSAL_MS,
);

test(
  "a sweep refused for missing credentials names the variable, and writes no report and no record",
  () => {
    const ran = evalWith({ EVAL_RULES: "comment-discipline", EVAL_CASES: "public-helper", EVAL_REPEATS: "1", EVAL_CREDENTIALS: "SKILLS_EVAL_UNSET_KEY" });
    expect(ran.exitCode).not.toBe(0);
    expect(ran.output).toContain("EVAL_CREDENTIALS names SKILLS_EVAL_UNSET_KEY");
    expect(leftBehind()).toEqual([]);
  },
  REFUSAL_MS,
);

test(
  "a model named without its provider is refused with the reason",
  () => {
    const ran = evalWith({ EVAL_MODEL: "claude-sonnet-5" });
    expect(ran.exitCode).not.toBe(0);
    expect(ran.output).toContain("EVAL_MODEL names its provider, as provider/model");
    expect(leftBehind()).toEqual([]);
  },
  REFUSAL_MS,
);
