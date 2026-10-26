import { expect, test } from "bun:test";
import { estimateCost } from "../../evals/pricing";
import type { RequestUsage } from "../../src/eval/eval-transcript";

const request = (input: number, output: number, cacheRead: number, cacheWrite: number, cacheWrite1h = 0): RequestUsage => ({
  input,
  output,
  cacheRead,
  cacheWrite,
  cacheWrite1h,
  cost: 0,
});

test("prices Claude bridge tokens from the published Anthropic model rates", () => {
  expect(estimateCost("claude-bridge/claude-opus-5-5", [request(100, 200, 300, 400)])).toBeCloseTo(0.00646, 10);
});

test("prices one-hour cache writes at the Anthropic rate", () => {
  expect(estimateCost("claude-bridge/claude-opus-5-5", [request(100, 200, 300, 400, 100)])).toBeCloseTo(0.00676, 10);
});

test("leaves unknown and already-priced usage unestimated", () => {
  expect(estimateCost("claude-bridge/not-in-pi-catalog", [request(1, 1, 0, 0)])).toBeUndefined();
  expect(estimateCost("opencode-go/muse-spark-1.3-contributor", [request(1, 1, 0, 0)])).toBeUndefined();
  expect(estimateCost("claude-bridge/claude-opus-5-5", [{ ...request(1, 1, 0, 0), cost: 0.001 }])).toBeUndefined();
});
