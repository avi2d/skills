import { defineConfig } from "@avi2dg/checks/knip";

export default defineConfig({
  entry: [
    "evals/**/*.eval.ts",
    "evals/vitest.config.ts",
    "evals/carry.ts",
    "evals/codex-token.ts",
    "harness/pi/extensions/**/*.ts",
    "scripts/replay-haiku-compaction.ts",
    "src/dispatcher/pi-dispatcher.ts",
    "tests/fixtures/eval/scripted-agent.ts",
    "tests/fixtures/herdr-pi-session.ts",
    "tests/fixtures/slow-mcp-server.ts",
  ],
});
