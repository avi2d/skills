import { defineConfig } from "@avi2dg/checks/oxlint";

export default defineConfig({
  effect: {
    excludeFiles: [
      // vitest runs each eval as an async test, and pi loads each extension as a plain async module.
      "evals/**",
      "harness/**",
      // A Dispatcher bundles these for a host that runs without Effect.
      "src/dispatcher/claude-dispatcher.ts",
      "src/dispatcher/codex-dispatcher.ts",
      "src/dispatcher/dispatch-log.ts",
      "src/dispatcher/dispatch.ts",
      "src/dispatcher/forbid.ts",
      "src/dispatcher/gate.ts",
      "src/dispatcher/gate-config.ts",
      "src/dispatcher/glob.ts",
      "src/dispatcher/hook-harness.ts",
      "src/dispatcher/job-queue.ts",
      "src/dispatcher/model-scope.ts",
      "src/dispatcher/pi-dispatcher.ts",
      "src/dispatcher/project.ts",
      "src/dispatcher/read-index.ts",
      "src/dispatcher/repo-walk.ts",
      "src/dispatcher/run-state.ts",
      "src/dispatcher/shell-words.ts",
      "src/dispatcher/transcript.ts",
      "src/dispatcher/verdict.ts",
    ],
  },
  ignorePatterns: ["repos/**", "generated/**", "node_modules/**"],
  overrides: [
    {
      files: ["evals/writing-judges.ts"],
      rules: {
        "eslint/max-lines": ["error", 480],
      },
    },
    {
      files: ["src/**/*.ts"],
      rules: {
        "eslint/no-restricted-properties": [
          "error",
          { object: "Bun", property: "file", message: "read and write through Effect's FileSystem, or node:fs in a module a Dispatcher bundles" },
          { object: "Bun", property: "write", message: "read and write through Effect's FileSystem, or node:fs in a module a Dispatcher bundles" },
          { object: "Bun", property: "spawn", message: "run a process through Effect's ChildProcessSpawner, or node:child_process in a module a Dispatcher bundles" },
          { object: "Bun", property: "spawnSync", message: "run a process through Effect's ChildProcessSpawner, or node:child_process in a module a Dispatcher bundles" },
          { object: "Bun", property: "$", message: "run a process through Effect's ChildProcessSpawner, or node:child_process in a module a Dispatcher bundles" },
        ],
      },
    },
  ],
});
