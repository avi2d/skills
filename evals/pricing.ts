import { calculateCost, type Usage } from "@earendil-works/pi-ai";
import { getBuiltinModels } from "@earendil-works/pi-ai/providers/all";
import type { RequestUsage } from "../src/eval/eval-transcript";

const anthropicModels = getBuiltinModels("anthropic");

const needsEstimate = (request: RequestUsage): boolean =>
  request.cost === 0 && request.input + request.output + request.cacheRead + request.cacheWrite > 0;

const usageOf = (request: RequestUsage): Usage => ({
  input: request.input,
  output: request.output,
  cacheRead: request.cacheRead,
  cacheWrite: request.cacheWrite,
  cacheWrite1h: request.cacheWrite1h,
  totalTokens: request.input + request.output + request.cacheRead + request.cacheWrite,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
});

export function estimateCost(model: string, requests: readonly RequestUsage[]): number | undefined {
  const slash = model.indexOf("/");
  if (slash === -1) return undefined;
  const catalogModel = anthropicModels.find(({ id }) => id === model.slice(slash + 1));
  if (catalogModel === undefined) return undefined;
  const unpriced = requests.filter(needsEstimate);
  if (unpriced.length === 0) return undefined;
  return unpriced.reduce((cost, request) => cost + calculateCost(catalogModel, usageOf(request)).total, 0);
}
