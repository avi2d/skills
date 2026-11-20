import { expect, test } from "bun:test";
import { skipReason } from "@avi2dg/checks/scripts/test-skips.ts";
import { compactionPoints, dispatchedPiModels, reviewPiModels, withoutOverride } from "./lib/compaction-points";

test("every compaction override compacts at 150k of the window pi's catalog lists for its model, not at a reserve worked out from another window", async () => {
  const points = await compactionPoints();
  expect(points.length, "no compaction override to check").toBeGreaterThan(0);
  expect(points.filter(({ compactsAtPoint }) => !compactsAtPoint)).toEqual([]);
});

test("every model the generated review config runs on pi has a compaction override, so none keeps pi's default reserve near its window's end", () => {
  expect(reviewPiModels.length, "no review model to check").toBeGreaterThan(0);
  expect(withoutOverride(reviewPiModels)).toEqual([]);
});

test.skipIf(dispatchedPiModels === undefined)(
  skipReason(
    "SKILLS_DISPATCH_RULES_FILE names no dispatch rules file, so only the models the review config names are checked",
    "every model the dispatch rules run on pi has a compaction override, so none keeps pi's default reserve near its window's end",
  ),
  () => {
    const dispatched = dispatchedPiModels ?? [];
    expect(dispatched.length, "the dispatch rules name no pi model").toBeGreaterThan(0);
    expect(withoutOverride(dispatched)).toEqual([]);
  },
);
