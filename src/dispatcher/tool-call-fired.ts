import { matchesGlob } from "./glob";
import type { ScopeCondition } from "./scope-condition";

export function toolCallFired(
  trigger: ScopeCondition,
  event: { tool: string; input: Record<string, unknown>; writes?: readonly string[] },
): { deliver: string } | { broken: string } | undefined {
  if (trigger.predicate === "file-matches") {
    const hit = event.writes?.find((path) => matchesGlob(trigger.glob, path));
    return hit === undefined ? undefined : { deliver: `file-matches matched ${hit}` };
  }
  if (trigger.predicate !== "tool-call" || trigger.tool.toLowerCase() !== event.tool.toLowerCase()) return undefined;
  const value = event.input[trigger.argument];
  if (typeof value === "string") {
    return matchesGlob(trigger.matches, value) ? { deliver: `tool-call matched ${trigger.tool}.${trigger.argument} against ${trigger.matches}` } : undefined;
  }
  const held = Object.keys(event.input).join(", ") || "nothing";
  return {
    broken:
      value === undefined
        ? `trigger names argument \`${trigger.argument}\`, and ${event.tool} was called with ${held}`
        : `trigger names argument \`${trigger.argument}\`, which ${event.tool} was called with as a ${typeof value}`,
  };
}
