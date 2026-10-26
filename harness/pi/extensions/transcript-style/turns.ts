import type { AssistantMessage, Message } from "@earendil-works/pi-ai";
import { convertToLlm, estimateTokens, type SessionEntry, sessionEntryToContextMessages } from "@earendil-works/pi-coding-agent";

export type CallUsage = {
  readonly input: number;
  readonly output: number;
  readonly cacheRead: number;
  readonly cacheWrite: number;
  readonly reasoning: number | undefined;
  readonly cost: number;
};

export type Turn = { readonly number: number; readonly usage: CallUsage | undefined };

export type ToolTokens = { readonly basis: "measured" | "estimated"; readonly tokens: number };

export type Ledger = {
  readonly turns: number;
  readonly turnsByTimestamp: ReadonlyMap<number, Turn>;
  readonly tools: ReadonlyMap<string, ToolTokens>;
};

export const EMPTY_LEDGER: Ledger = { turns: 0, turnsByTimestamp: new Map(), tools: new Map() };

export const contextOf = (usage: CallUsage): number => usage.input + usage.cacheRead + usage.cacheWrite;

export function callUsage({ usage, stopReason }: Pick<AssistantMessage, "usage" | "stopReason">): CallUsage | undefined {
  if (stopReason === "pending") return undefined;
  const reported: CallUsage = {
    input: usage.input,
    output: usage.output,
    cacheRead: usage.cacheRead,
    cacheWrite: usage.cacheWrite,
    reasoning: usage.reasoning,
    cost: usage.cost.total,
  };
  return contextOf(reported) + reported.output > 0 ? reported : undefined;
}

// Earlier context the next request no longer carries in full, so growth across it is no measure of what was appended.
const RESETS_CONTEXT: ReadonlySet<SessionEntry["type"]> = new Set(["compaction", "branch_summary", "context_edit"]);

type Previous = { readonly context: number; readonly output: number; readonly model: string };
type Appended = { readonly toolCallId: string | undefined; readonly estimate: number };

// A request carries the previous request's context, its output and whatever was appended after it, so the growth beyond that output is what the appended messages cost: measured for a lone message, and split by estimated share otherwise.
function attribute(growth: number, appended: readonly Appended[], tools: Map<string, ToolTokens>): void {
  const total = appended.reduce((sum, { estimate }) => sum + estimate, 0);
  if (growth <= 0 || total === 0) return;
  const basis = appended.length === 1 ? "measured" : "estimated";
  for (const { toolCallId, estimate } of appended) {
    if (toolCallId) tools.set(toolCallId, { basis, tokens: Math.round((growth * estimate) / total) });
  }
}

type Building = {
  readonly turnsByTimestamp: Map<number, Turn>;
  readonly tools: Map<string, ToolTokens>;
  turns: number;
  previous: Previous | undefined;
  appended: Appended[];
};

function append(building: Building, message: Message): void {
  const estimate = estimateTokens(message);
  const toolCallId = message.role === "toolResult" ? message.toolCallId : undefined;
  if (toolCallId) building.tools.set(toolCallId, { basis: "estimated", tokens: estimate });
  building.appended.push({ toolCallId, estimate });
}

function call(building: Building, message: AssistantMessage): void {
  building.turns += 1;
  const usage = callUsage(message);
  building.turnsByTimestamp.set(message.timestamp, { number: building.turns, usage });
  if (!usage) return;
  const model = `${message.provider}/${message.model}`;
  if (building.previous?.model === model) attribute(contextOf(usage) - building.previous.context - building.previous.output, building.appended, building.tools);
  building.previous = { context: contextOf(usage), output: usage.output, model };
  building.appended = [];
}

export function buildLedger(branch: readonly SessionEntry[]): Ledger {
  const building: Building = { turnsByTimestamp: new Map(), tools: new Map(), turns: 0, previous: undefined, appended: [] };
  for (const entry of branch) {
    if (RESETS_CONTEXT.has(entry.type)) building.previous = undefined;
    if (entry.type === "message" && entry.message.role === "assistant") call(building, entry.message);
    else for (const message of convertToLlm(sessionEntryToContextMessages(entry))) append(building, message);
  }
  const { turns, turnsByTimestamp, tools } = building;
  return { turns, turnsByTimestamp, tools };
}

export function compact(tokens: number): string {
  if (tokens < 1000) return `${tokens}`;
  if (tokens < 9950) return `${(tokens / 1000).toFixed(1)}k`;
  if (tokens < 999_500) return `${Math.round(tokens / 1000)}k`;
  return `${(tokens / 1_000_000).toFixed(1)}M`;
}

export type Figure = { readonly role: "lead" | "detail"; readonly text: string };

export function callFigures(usage: CallUsage): Figure[] {
  const thinking = usage.reasoning ? ` (${compact(usage.reasoning)} thinking)` : "";
  const figures: Figure[] = [
    { role: "lead", text: `in ${compact(contextOf(usage))}` },
    { role: "lead", text: `out ${compact(usage.output)}${thinking}` },
    { role: "detail", text: `R${compact(usage.cacheRead)} W${compact(usage.cacheWrite)}` },
  ];
  if (usage.cost > 0) figures.push({ role: "detail", text: `$${usage.cost < 0.01 ? usage.cost.toFixed(4) : usage.cost.toFixed(2)}` });
  return figures;
}

export const HEAVY_TOOL_TOKENS = 10_000;

export function toolFigure({ basis, tokens }: ToolTokens): string {
  return basis === "measured" ? `+${compact(tokens)}` : `≈${compact(tokens)}`;
}

export const turnLabel = (turn: Pick<Turn, "number">): string => `turn ${turn.number}`;
