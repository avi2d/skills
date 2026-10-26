import { mkdirSync, writeFileSync } from "node:fs";
import type { Reporter, TestModule } from "vitest/node";
import { resultFor, table, type RunRecord } from "../src/eval/ablation";
import { recordText, sweepFile, SWEEP_PAGE, type Prose, type SweepRecord } from "../src/eval/eval-sweeps";
import type { Settings } from "./settings";

declare module "vitest" {
  interface TaskMeta {
    ablation?: RunRecord;
    prose?: Prose;
  }
  interface ProvidedContext {
    reportDir: string;
    sweepDir: string;
  }
}

export type Sweep = { sweepDir: string; startedAt: string; runId: string; commit: string };

export class AblationReporter implements Reporter {
  private readonly sweep: Sweep;
  private readonly settings: Settings;

  constructor(sweep: Sweep, settings: Settings) {
    this.sweep = sweep;
    this.settings = settings;
  }

  onTestRunEnd(modules: ReadonlyArray<TestModule>): void {
    const refusals = modules.flatMap((module) => module.errors().map((error) => error.message));
    const tests = modules.flatMap((module) => [...module.children.allTests()]);
    const runs = tests.flatMap((test) => test.meta().ablation ?? []);
    const missing = tests.filter((test) => test.meta().ablation === undefined).map((test) => test.fullName);
    if (refusals.length > 0) process.stderr.write(`${refusals.join("\n")}\n`);
    if (runs.length === 0) {
      if (tests.length > 0) process.stdout.write(`\nablation: none of ${tests.length} planned runs recorded, so the sweep keeps no record\n`);
      return;
    }
    const { model, thinking, repeats } = this.settings;
    const prose = tests.map((test) => test.meta().prose).find((found) => found !== undefined);
    const record: SweepRecord = { startedAt: this.sweep.startedAt, runId: this.sweep.runId, commit: this.sweep.commit, ...(prose === undefined ? {} : { prose }), model, thinking, repeats, planned: tests.length, missing, runs };
    const path = `${this.sweep.sweepDir}/${sweepFile(record.startedAt, record.runId)}`;
    mkdirSync(this.sweep.sweepDir, { recursive: true });
    writeFileSync(path, recordText(record), { flag: "wx" });
    const rules = [...new Set(runs.map((run) => run.rule))];
    const lines = [
      "",
      `ablation: ${runs.length} of ${tests.length} planned runs recorded, ${model} at ${thinking}`,
      ...(missing.length > 0 ? [`no run record, so a failure of the sweep rather than a verdict: ${missing.join(", ")}`] : []),
      table(rules.map((rule) => resultFor(rule, model, repeats, runs))),
      `record: ${path}`,
      `commit it with ${SWEEP_PAGE} as \`bun run docs\` rewrites it`,
      "",
    ];
    process.stdout.write(lines.join("\n"));
  }
}
