import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { skipReason } from "@avi2dg/checks/scripts/test-skips.ts";
import { loadBodies } from "../../src/bodies/bodies";
import { valueOf } from "../lib/effect";

const repo = new URL("../../", import.meta.url).pathname;
const bodies = await valueOf(loadBodies(repo));
const linked = existsSync(`${repo}repos/effect`);

const INSIDE = /repos\/effect\/[\w./-]*[\w/-]/g;

test.skipIf(!linked)(
  skipReason(
    "it reads through the repos/effect link, so it runs only where checks-vendor linked it; `bun install` links it in CI, a checkout that skipped or outlived the fetch has none",
    "every path a Body sends a reader to inside the vendored tree is there",
    "local",
  ),
  () => {
  const named = [...new Set(bodies.flatMap((body) => [...body.skill.matchAll(INSIDE)].map(([path]) => path)))];
  expect(named, "no Body points into the vendored tree, so this checks nothing").not.toEqual([]);
  expect(named.filter((path) => !existsSync(`${repo}${path}`))).toEqual([]);
});
