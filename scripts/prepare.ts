#!/usr/bin/env bun
import { runExitMain } from "@avi2dg/checks/core/main.ts";
import { runSteps } from "./run-steps";

const main = runSteps("prepare", [
    { command: "checks-vendor", args: ["--library", "effect", "--package", "effect", "--repository", "https://github.com/Effect-TS/effect.git", "--tag", "effect@{version}", "--path", "packages/effect/package.json"] },
]);

if (import.meta.main) runExitMain(main);
