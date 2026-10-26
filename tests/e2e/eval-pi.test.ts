import { expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Duration } from "effect";
import { estimateCost } from "../../evals/pricing";
import { armRun, type Task } from "../../src/eval/eval-pi";
import { valueOf } from "../lib/effect";

const repo = fileURLToPath(new URL("../..", import.meta.url));
const fixture = fileURLToPath(new URL("../fixtures/eval/claude-bridge.jsonl", import.meta.url));
const quote = (path: string) => `'${path.replaceAll("'", "'\\''")}'`;

test("the runner records Claude bridge turns, cache tokens and an estimated cost", async () => {
  await mkdir(join(repo, "reports"), { recursive: true });
  const scratch = await mkdtemp(join(repo, "reports", "eval-pi-"));
  const pi = join(scratch, "pi");
  try {
    await writeFile(pi, `#!/bin/sh\n/bin/cat ${quote(fixture)}\n`);
    await chmod(pi, 0o755);
    const task: Task = {
      prompt: "read the seeded file",
      files: { "src/task.ts": "export const task = true;\n" },
      judge: { name: "fixture", judge: () => ({ passed: true, evidence: ["fixture output"] }) },
    };
    const run = await valueOf(
      armRun(
        { pi, model: "claude-bridge/claude-opus-5-5", thinking: "xhigh", extensions: [], timeout: Duration.seconds(30) },
        task,
        "",
        { HOME: process.env.HOME, PATH: process.env.PATH },
        [],
        {},
        estimateCost,
      ),
    );
    expect(run.verdict.outcome).toBe("pass");
    expect([run.spend.input, run.spend.output, run.spend.cacheRead, run.spend.cacheWrite]).toEqual([4, 269, 5245, 2378]);
    expect(run.spend.turns).toBe(2);
    expect(run.wroteTest).toBe(false);
    expect(run.spend.cost).toBeCloseTo(0.018335, 9);
    expect(run.spend.costEstimated).toBe(true);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});
