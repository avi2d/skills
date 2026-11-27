#!/usr/bin/env bun
import { runExitMain } from "@avi2dg/checks/core/main.ts";
import { runSteps } from "./run-steps";

const main = runSteps("build", [
    { command: "checks-effect-scope", args: [] },
    { command: "checks-changelog", args: [] },
]);

if (import.meta.main) runExitMain(main);
