import type { Action } from "./dispatch";

export function logLine(action: Action): string {
  return narrate(action).replace(/\r\n|\r|\n/g, "\\n");
}

function narrate(action: Action): string {
  switch (action.type) {
    case "inject":
      return `inject ${action.rule}: ${action.why}`;
    case "deliver":
      return `deliver ${action.rule}: ${action.why}`;
    case "queue":
      return `queue ${action.rule}: ${action.why}`;
    case "dropped":
      return `dropped ${action.rule}: ${action.why}`;
    case "broken":
      return `broken ${action.rule}: ${action.why}`;
    case "unjudged":
      return `unjudged ${action.rule}: ${action.why}`;
    case "switched":
      return `switched ${action.rule} ${action.to}: ${action.why}`;
    case "ignored":
      return `broken dispatcher: ${action.why}`;
    case "pull":
      return `pull ${action.body}: ${action.why}`;
    case "refuse":
      return `refuse ${action.rule}: ${action.why}`;
    case "withdraw":
      return `withdraw ${action.rule}: ${action.why}`;
    case "trim":
      return `trim ${action.profile}: ${action.why}, keeping rules [${action.rules.join(", ")}] and tools [${action.tools.join(", ")}]`;
    case "verify":
      return `verify ${action.tree}: ${action.checks.map((check) => `${check.name} (${check.command})`).join(", ")} in ${action.root}`;
    case "passed":
      return `passed ${action.tree}: ${action.checks.join(", ")} in ${action.seconds}s`;
    case "hold":
      return `hold ${action.tree}: ${action.check} failed, hold ${action.held} of ${action.of}`;
    case "release":
      return `release ${action.tree}: ${action.why}`;
    default:
      throw new Error(`no dispatch log line for ${JSON.stringify(action satisfies never)}`);
  }
}
