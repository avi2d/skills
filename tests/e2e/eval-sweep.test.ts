import { afterAll, beforeAll, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { resultFor } from "../../src/eval/ablation";
import { LIVE_ROOTS } from "../../src/eval/eval-sandbox";
import { parseSweep, SWEEPS } from "../../src/eval/eval-sweeps";
import { LINKS, REPO } from "../../src/generate/link";
import { value } from "../lib/effect";

const scratch = mkdtempSync(join(tmpdir(), "skills-eval-live-"));
const live = join(scratch, "home");
const targets = join(scratch, "targets");
const report = join(scratch, "report");
const sweeps = join(scratch, "sweeps");
const committed = join(REPO, SWEEPS);
const PROBE_RAN = join(live, ".pi/agent/probe-ran");
const SWEEP_MS = 180_000;

function describe(path: string, out: Map<string, string>): void {
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (stat === undefined) return;
  if (stat.isSymbolicLink()) out.set(path, `link -> ${readlinkSync(path)}`);
  else if (stat.isDirectory()) {
    out.set(path, "dir");
    for (const name of readdirSync(path).toSorted()) describe(join(path, name), out);
  } else out.set(path, `file ${stat.size} ${stat.mtimeMs} ${createHash("sha256").update(readFileSync(path)).digest("hex")}`);
}

function snapshot(): Map<string, string> {
  const out = new Map<string, string>();
  for (const root of LIVE_ROOTS) describe(join(live, root), out);
  describe(targets, out);
  return out;
}

type Ran = { exitCode: number; output: string };

let ran: Ran;
let before: Map<string, string>;
let history: string[];

beforeAll(() => {
  for (const rel of Object.keys(LINKS)) {
    const target = join(targets, rel);
    if (basename(rel).includes(".")) {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, "live\n");
    } else mkdirSync(target, { recursive: true });
    mkdirSync(dirname(join(live, rel)), { recursive: true });
    symlinkSync(target, join(live, rel));
  }
  const bin = join(live, ".pi/agent/bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, "skills-eval-probe"), `#!/bin/sh\necho ran >> '${PROBE_RAN}'\n`);
  chmodSync(join(bin, "skills-eval-probe"), 0o755);

  before = snapshot();
  history = readdirSync(committed);
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("EVAL_")));
  const done = Bun.spawnSync([process.execPath, "run", "eval"], {
    cwd: REPO,
    timeout: SWEEP_MS,
    env: {
      ...inherited,
      HOME: live,
      PATH: `${bin}:${dirname(process.execPath)}:${process.env["PATH"] ?? ""}`,
      PI_CODING_AGENT_DIR: join(live, ".pi/agent"),
      PI_CODING_AGENT_SESSION_DIR: join(live, ".pi/agent/sessions"),
      XDG_CONFIG_HOME: join(live, ".config"),
      CLAUDE_CONFIG_DIR: join(live, ".claude"),
      CODEX_HOME: join(live, ".codex"),
      EVAL_RULES: "comment-discipline",
      EVAL_CASES: "public-helper",
      EVAL_REPEATS: "2",
      EVAL_MAX_RUNS: "4",
      EVAL_MODEL: "scripted/agent",
      EVAL_THINKING: "off",
      EVAL_PROVIDER_EXTENSION: join(REPO, "tests/fixtures/eval/scripted-agent.ts"),
      EVAL_CREDENTIALS: "",
      EVAL_REPORT_DIR: report,
      EVAL_SWEEP_DIR: sweeps,
    },
  });
  ran = { exitCode: done.exitCode, output: `${done.stdout.toString()}${done.stderr.toString()}` };
}, SWEEP_MS);

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

test("a sweep reaches no live agent config, even with every variable that names one pointing at it", () => {
  expect(ran.exitCode, ran.output).toBe(0);
  expect(before.size, "the fake live home holds nothing, so an unchanged snapshot proves nothing").toBeGreaterThan(Object.keys(LINKS).length);
  const after = snapshot();
  const moved = [...new Set([...before.keys(), ...after.keys()])].filter((path) => before.get(path) !== after.get(path));
  expect(moved.map((path) => `${path.slice(scratch.length)}: ${before.get(path) ?? "absent"} => ${after.get(path) ?? "absent"}`)).toEqual([]);
});

test("the agent a sweep runs holds a HOME of its own, outside the live one", () => {
  const transcript = readFileSync(join(report, "runs/comment-discipline.public-helper.withheld.1.jsonl"), "utf8");
  const home = /agent-home=(\/[^\s"\\]+)/.exec(transcript)?.[1];
  expect(home, "the scripted agent's first command reported no HOME").toBeDefined();
  expect(home).toContain("skills-eval-");
  expect(home?.startsWith(live)).toBe(false);
});

test("the arm the rule reached is scored apart from the arm it did not, by the program that refuses the comment", () => {
  expect(ran.output).toContain("| comment-discipline | all, 2 repeat(s) | 2/2, 100% | 0/2, 0% | +100 pp |");
  const [file, ...others] = readdirSync(sweeps);
  expect(others, "one sweep wrote more than one record").toEqual([]);
  const name = file ?? expect.unreachable("the sweep wrote no record");
  const record = value(parseSweep(sweeps, name, readFileSync(join(sweeps, name), "utf8")));
  const head = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: REPO }).stdout.toString().trim();
  expect([record.model, record.thinking, record.repeats, record.planned, record.missing, record.commit]).toEqual(["scripted/agent", "off", 2, 4, [], head]);
  const result = resultFor("comment-discipline", record.model, record.repeats, record.runs);
  expect(result.arms).toMatchObject({ injected: { runs: 2, passed: 2, failed: 0 }, withheld: { runs: 2, passed: 0, failed: 2 } });
  expect(JSON.stringify(record.runs)).toContain("src/array.ts:1 opens a doc block");
  const injected = "library/engineering/rules/comment-discipline/SKILL.md";
  const changed = Bun.spawnSync(["git", "status", "--porcelain", "--", injected], { cwd: REPO }).stdout.toString().trim() !== "";
  expect(record.prose).toEqual({ files: { [injected]: createHash("sha256").update(readFileSync(join(REPO, injected))).digest("hex") }, uncommitted: changed });
});

test("a sweep told to keep its record elsewhere adds nothing to the committed history", () => {
  expect(readdirSync(committed)).toEqual(history);
});
