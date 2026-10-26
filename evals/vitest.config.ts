import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { defineConfig } from "vitest/config";
import { SWEEPS, stampOf, startedAtOf } from "../src/eval/eval-sweeps";
import { AblationReporter } from "./reporter";
import { settingsFrom } from "./settings";

const settings = settingsFrom(process.env);

const root = new URL("../", import.meta.url).pathname;
const startedAt = startedAtOf(new Date());
const runId = randomUUID();
const reportDir = settings.reportDir ?? `${root}reports/evals/${stampOf(startedAt)}-${runId}`;
const sweepDir = settings.sweepDir ?? `${root}${SWEEPS}`;
const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const MINUTE = 60_000;

export default defineConfig({
  test: {
    root,
    include: ["evals/**/*.eval.ts"],
    fileParallelism: false,
    maxConcurrency: settings.concurrency,
    testTimeout: (settings.timeoutMinutes + 5) * MINUTE,
    provide: { reportDir, sweepDir },
    server: { deps: { inline: ["@avi2dg/checks"] } },
    reporters: ["vitest-evals/reporter", new AblationReporter({ sweepDir, startedAt, runId, commit }, settings)],
  },
});
