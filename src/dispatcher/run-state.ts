import type { Listed } from "./repo-walk";
import type { GateState } from "./verdict";
import type { Project } from "./project";

export type RuleLifecycle = { state: "pending"; why: string } | { state: "injected" } | { state: "checked" };

export type RunState = {
  rules: Record<string, RuleLifecycle>;
  model?: string;
  holding?: string[];
  walked?: Record<string, Listed>;
  gate?: GateState;
  project?: Project;
};

export const START: RunState = { rules: {} };

export const lifecycleOf = (rules: Record<string, RuleLifecycle>, name: string): RuleLifecycle | undefined =>
  Object.hasOwn(rules, name) ? rules[name] : undefined;

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasOnly = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).every((key) => keys.includes(key));

const isStrings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string");

const isLifecycle = (value: unknown): value is RuleLifecycle => {
  if (!isRecord(value)) return false;
  switch (value.state) {
    case "pending":
      return hasOnly(value, ["state", "why"]) && typeof value.why === "string";
    case "injected":
    case "checked":
      return hasOnly(value, ["state"]);
    default:
      return false;
  }
};

const isRules = (value: unknown): value is Record<string, RuleLifecycle> =>
  isRecord(value) && Object.values(value).every(isLifecycle);

const isListed = (value: unknown): value is Listed =>
  isRecord(value) && hasOnly(value, ["files", "capped"]) && isStrings(value.files) && typeof value.capped === "boolean";

const isWalked = (value: unknown): value is Record<string, Listed> =>
  isRecord(value) && Object.values(value).every(isListed);

const isTree = (value: unknown): value is { root: string; tree: string; head?: string } =>
  isRecord(value) &&
  hasOnly(value, ["root", "tree", "head"]) &&
  typeof value.root === "string" &&
  typeof value.tree === "string" &&
  (value.head === undefined || typeof value.head === "string");

const isCheck = (value: unknown): value is { name: "test" | "lint"; command: string } =>
  isRecord(value) &&
  hasOnly(value, ["name", "command"]) &&
  (value.name === "test" || value.name === "lint") &&
  typeof value.command === "string";

const isFailure = (
  value: unknown,
): value is { outcome: "failed"; check: { name: "test" | "lint"; command: string }; status: string; tail: string } =>
  isRecord(value) &&
  hasOnly(value, ["outcome", "check", "status", "tail"]) &&
  value.outcome === "failed" &&
  isCheck(value.check) &&
  typeof value.status === "string" &&
  typeof value.tail === "string";

const isJudged = (value: unknown): value is NonNullable<GateState["judged"]> => {
  if (!isRecord(value) || typeof value.tree !== "string") return false;
  if (!hasOnly(value, ["tree", "failed"])) return false;
  return value.failed === undefined || isFailure(value.failed);
};

const isGateState = (value: unknown): value is GateState => {
  if (!isRecord(value) || typeof value.held !== "number") return false;
  if (!hasOnly(value, ["baseline", "judged", "held", "asked", "off"])) return false;
  if (value.baseline !== undefined && !isTree(value.baseline)) return false;
  if (value.asked !== undefined && typeof value.asked !== "string") return false;
  if (value.off !== undefined && typeof value.off !== "string") return false;
  if (value.judged === undefined) return true;
  return isJudged(value.judged);
};

const isProject = (value: unknown): value is Project => {
  if (!isRecord(value) || typeof value.path !== "string") return false;
  if (value.unreadable !== undefined) return hasOnly(value, ["path", "unreadable"]) && typeof value.unreadable === "string";
  return (
    hasOnly(value, ["path", "declares", "on", "off"]) &&
    Array.isArray(value.declares) &&
    value.declares.every((entry) => entry === "effect") &&
    isStrings(value.on) &&
    isStrings(value.off)
  );
};

const hasSessionFields = (value: Record<string, unknown>): boolean =>
  (value.model === undefined || typeof value.model === "string") &&
  (value.holding === undefined || isStrings(value.holding)) &&
  (value.walked === undefined || isWalked(value.walked)) &&
  (value.gate === undefined || isGateState(value.gate)) &&
  (value.project === undefined || isProject(value.project));

export const isRunState = (value: unknown): value is RunState =>
  isRecord(value) &&
  hasOnly(value, ["rules", "model", "holding", "walked", "gate", "project"]) &&
  isRules(value.rules) &&
  hasSessionFields(value);

type LegacyRunState = {
  injected: string[];
  checked: string[];
  pending: Record<string, string>;
  model?: string;
  holding?: string[];
  walked?: Record<string, Listed>;
  gate?: GateState;
  project?: Project;
};

const isLegacyPending = (value: unknown): value is Record<string, string> =>
  isRecord(value) && Object.values(value).every((entry) => typeof entry === "string");

const isLegacyRunState = (value: unknown): value is LegacyRunState =>
  isRecord(value) &&
  hasOnly(value, ["injected", "checked", "pending", "model", "holding", "walked", "gate", "project"]) &&
  isStrings(value.injected) &&
  isStrings(value.checked) &&
  isLegacyPending(value.pending) &&
  hasSessionFields(value);

const migratedRules = (legacy: LegacyRunState): Record<string, RuleLifecycle> => {
  const checked = new Set(legacy.checked);
  const rules: Record<string, RuleLifecycle> = {};
  for (const name of legacy.injected) rules[name] = checked.has(name) ? { state: "checked" } : { state: "injected" };
  for (const name of legacy.checked) {
    if (lifecycleOf(rules, name) === undefined) rules[name] = { state: "checked" };
  }
  for (const [name, why] of Object.entries(legacy.pending)) {
    if (lifecycleOf(rules, name) === undefined) rules[name] = { state: "pending", why };
  }
  return rules;
};

export const decodeRunState = (value: unknown): RunState | undefined => {
  if (isRunState(value)) return value;
  if (!isLegacyRunState(value)) return undefined;
  const rules = migratedRules(value);
  return {
    rules,
    ...(value.model === undefined ? {} : { model: value.model }),
    ...(value.holding === undefined ? {} : { holding: value.holding }),
    ...(value.walked === undefined ? {} : { walked: value.walked }),
    ...(value.gate === undefined ? {} : { gate: value.gate }),
    ...(value.project === undefined ? {} : { project: value.project }),
  };
};
