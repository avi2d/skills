#!/usr/bin/env bun
import { runExitMain } from "@avi2dg/checks/core/main.ts";
import { runSteps } from "./run-steps";

const main = runSteps("docs:build", [
    { command: "bun", args: ["run", "docs", "--check"] },
    { command: "bun", args: ["test", "tests/e2e/fleet-names.test.ts"] },
]);

if (import.meta.main) runExitMain(main);
