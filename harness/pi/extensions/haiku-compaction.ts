import { convertToLlm, serializeConversation } from "@earendil-works/pi-coding-agent";
import { contentText, uuidv7, type AssistantMessage, type Usage } from "@earendil-works/pi-ai";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { SessionBeforeCompactEvent, SessionBeforeCompactResult } from "@earendil-works/pi-coding-agent";

import type {
  BranchEntries,
  Context,
  FileOps,
  Pi,
  SessionModel,
  SummaryModel,
  SummaryRegistry,
} from "./haiku-compaction/file-ops";
import { historyPromptOf, SUMMARIZATION_SYSTEM_PROMPT, turnPrefixPromptOf } from "./haiku-compaction/prompts";
import { historyConversationOf } from "./haiku-compaction/tool-output";

export { historyPromptOf, SUMMARIZATION_SYSTEM_PROMPT, turnPrefixPromptOf } from "./haiku-compaction/prompts";
export { historyConversationOf } from "./haiku-compaction/tool-output";

export type {
  BranchEntries,
  Context,
  FileOps,
  Pi,
  SessionModel,
  SummaryModel,
  SummaryOptions,
  SummaryRegistry,
  SummaryRequest,
} from "./haiku-compaction/file-ops";

export function fileListsOf(ops: FileOps): { readFiles: string[]; modifiedFiles: string[] } {
  const modified = new Set([...ops.edited, ...ops.written]);
  return {
    readFiles: [...ops.read].filter((file) => !modified.has(file)).sort(),
    modifiedFiles: [...modified].sort(),
  };
}

export function withFileOps(summary: string, ops: FileOps): string {
  const { readFiles, modifiedFiles } = fileListsOf(ops);
  const sections: string[] = [];
  if (readFiles.length > 0) sections.push(`<read-files>\n${readFiles.join("\n")}\n</read-files>`);
  if (modifiedFiles.length > 0) sections.push(`<modified-files>\n${modifiedFiles.join("\n")}\n</modified-files>`);
  if (sections.length === 0) return summary;
  return `${summary}\n\n${sections.join("\n\n")}`;
}

function stringsInto(target: Set<string>, value: unknown): void {
  if (!Array.isArray(value)) return;
  for (const item of value) if (typeof item === "string") target.add(item);
}

function hookFileListsOf(entry: unknown): { readFiles: unknown; modifiedFiles: unknown } | undefined {
  if (typeof entry !== "object" || entry === null) return undefined;
  if (Reflect.get(entry, "type") !== "compaction") return undefined;
  if (!Reflect.get(entry, "fromHook")) return undefined;
  const details: unknown = Reflect.get(entry, "details");
  if (typeof details !== "object" || details === null) return undefined;
  return { readFiles: Reflect.get(details, "readFiles"), modifiedFiles: Reflect.get(details, "modifiedFiles") };
}

export function cumulativeFileOps(ops: FileOps, branchEntries: readonly unknown[]): FileOps {
  const read = new Set(ops.read);
  const edited = new Set(ops.edited);
  const written = new Set(ops.written);
  for (const entry of branchEntries) {
    const lists = hookFileListsOf(entry);
    if (!lists) continue;
    stringsInto(read, lists.readFiles);
    stringsInto(edited, lists.modifiedFiles);
  }
  return { read, edited, written };
}

export const HAIKU_PROVIDER = "claude-bridge";
export const HAIKU_MODEL = "claude-haiku-5-5";

export const MUSE_FAMILY = { provider: "opencode-go", idPrefix: "muse-spark" } as const;

const SUMMARIZED_BY_HAIKU = [{ provider: "claude-bridge", idPrefix: "" }, MUSE_FAMILY] as const;

const OPENAI_PROVIDERS = new Set<string>(["openai", "openai-codex"]);

const OPENAI_MODEL_IDS = new Set<string>(["gpt-6.1-sol", "gpt-6-astra", "gpt-6.1-terra", "gpt-6-luna"]);

export function summarizedByHaiku(model: SessionModel | undefined): boolean {
  if (typeof model?.provider !== "string") return false;
  const id: unknown = model.id;
  if (typeof id !== "string") return false;
  if (OPENAI_PROVIDERS.has(model.provider)) return OPENAI_MODEL_IDS.has(id);
  return SUMMARIZED_BY_HAIKU.some((family) => model.provider === family.provider && id.startsWith(family.idPrefix));
}

export function isMuseSession(model: SessionModel | undefined): boolean {
  if (typeof model?.provider !== "string") return false;
  const id: unknown = model.id;
  return model.provider === MUSE_FAMILY.provider && typeof id === "string" && id.startsWith(MUSE_FAMILY.idPrefix);
}

export function haikuCompactionEnabled(settings: unknown): boolean {
  if (typeof settings !== "object" || settings === null) return true;
  const section: unknown = Reflect.get(settings, "haikuCompaction");
  if (typeof section !== "object" || section === null) return true;
  return Reflect.get(section, "enabled") !== false;
}

export const NO_PRIOR_HISTORY = "No prior history.";

export function mergeSplitSummary(history: string, turnPrefix: string): string {
  return `${history}\n\n---\n\n**Turn Context (split turn):**\n\n${turnPrefix}`;
}

export function historyBudget(reserveTokens: number, maxTokens: number): number {
  return Math.min(Math.floor(0.8 * reserveTokens), maxTokens > 0 ? maxTokens : Number.POSITIVE_INFINITY);
}

export function turnPrefixBudget(reserveTokens: number, maxTokens: number): number {
  return Math.min(Math.floor(0.5 * reserveTokens), maxTokens > 0 ? maxTokens : Number.POSITIVE_INFINITY);
}

export function combineUsage(first: Usage, second: Usage): Usage {
  return {
    input: first.input + second.input,
    output: first.output + second.output,
    cacheRead: first.cacheRead + second.cacheRead,
    cacheWrite: first.cacheWrite + second.cacheWrite,
    ...(first.cacheWrite1h !== undefined || second.cacheWrite1h !== undefined
      ? { cacheWrite1h: (first.cacheWrite1h ?? 0) + (second.cacheWrite1h ?? 0) }
      : {}),
    ...(first.reasoning !== undefined || second.reasoning !== undefined
      ? { reasoning: (first.reasoning ?? 0) + (second.reasoning ?? 0) }
      : {}),
    totalTokens: first.totalTokens + second.totalTokens,
    cost: {
      input: first.cost.input + second.cost.input,
      output: first.cost.output + second.cost.output,
      cacheRead: first.cost.cacheRead + second.cost.cacheRead,
      cacheWrite: first.cost.cacheWrite + second.cost.cacheWrite,
      total: first.cost.total + second.cost.total,
    },
  };
}

export function summaryTextOf(response: AssistantMessage): string | undefined {
  if (response.stopReason === "error" || response.stopReason === "length") return undefined;
  if (response.content.some((block) => block.type === "toolCall")) return undefined;
  const text = contentText(response.content);
  return text.trim() === "" ? undefined : text;
}

export function conversationOf(messages: readonly AgentMessage[]): string {
  return serializeConversation(convertToLlm([...messages]));
}

export function isCompactEvent(event: unknown): event is SessionBeforeCompactEvent {
  return typeof event === "object" && event !== null && Reflect.get(event, "type") === "session_before_compact";
}

export async function summarize(
  registry: SummaryRegistry,
  model: SummaryModel,
  prompt: string,
  maxTokens: number,
  signal: AbortSignal,
): Promise<{ text: string; usage: Usage } | undefined> {
  try {
    const response = await registry.complete(
      model,
      {
        systemPrompt: SUMMARIZATION_SYSTEM_PROMPT,
        messages: [{ role: "user", content: [{ type: "text", text: prompt }], timestamp: Date.now() }],
      },
      { maxTokens, signal, cacheRetention: "none", sessionId: uuidv7() },
    );
    const text = summaryTextOf(response);
    return text === undefined ? undefined : { text, usage: response.usage };
  } catch {
    return undefined;
  }
}

type Preparation = SessionBeforeCompactEvent["preparation"];

async function summarizeHistory(
  registry: SummaryRegistry,
  haiku: SummaryModel,
  preparation: Preparation,
  customInstructions: string | undefined,
  signal: AbortSignal,
  keepUrls: boolean,
): Promise<{ text: string; usage: Usage } | undefined> {
  const done = await summarize(
    registry,
    haiku,
    historyPromptOf(historyConversationOf(preparation.messagesToSummarize), preparation.previousSummary, customInstructions, keepUrls),
    historyBudget(preparation.settings.reserveTokens, haiku.maxTokens),
    signal,
  );
  if (!done || signal.aborted) return undefined;
  return done;
}

function resultOf(summary: string, usage: Usage, preparation: Preparation, branchEntries: BranchEntries): SessionBeforeCompactResult {
  const merged = cumulativeFileOps(preparation.fileOps, branchEntries);
  return {
    compaction: {
      summary: withFileOps(summary, merged),
      firstKeptEntryId: preparation.firstKeptEntryId,
      tokensBefore: preparation.tokensBefore,
      usage,
      details: fileListsOf(merged),
    },
  };
}

async function summarizeSplitTurn(
  registry: SummaryRegistry,
  haiku: SummaryModel,
  preparation: Preparation,
  branchEntries: BranchEntries,
  customInstructions: string | undefined,
  signal: AbortSignal,
  keepUrls: boolean,
): Promise<SessionBeforeCompactResult | undefined> {
  let history = preparation.previousSummary ?? NO_PRIOR_HISTORY;
  let historyUsage: Usage | undefined;
  if (preparation.messagesToSummarize.length > 0) {
    const done = await summarizeHistory(registry, haiku, preparation, customInstructions, signal, keepUrls);
    if (!done) return undefined;
    history = done.text;
    historyUsage = done.usage;
  }
  const prefix = await summarize(
    registry,
    haiku,
    turnPrefixPromptOf(conversationOf(preparation.turnPrefixMessages), keepUrls),
    turnPrefixBudget(preparation.settings.reserveTokens, haiku.maxTokens),
    signal,
  );
  if (!prefix || signal.aborted) return undefined;
  const usage = historyUsage ? combineUsage(historyUsage, prefix.usage) : prefix.usage;
  return resultOf(mergeSplitSummary(history, prefix.text), usage, preparation, branchEntries);
}

export async function summarizeSession(
  event: SessionBeforeCompactEvent,
  ctx: Context,
  enabled: boolean,
): Promise<SessionBeforeCompactResult | undefined> {
  if (!summarizedByHaiku(ctx.model)) return undefined;
  if (!enabled) return undefined;
  const haiku = ctx.modelRegistry.find(HAIKU_PROVIDER, HAIKU_MODEL);
  if (!haiku || event.signal.aborted) return undefined;
  const preparation = event.preparation;
  const keepUrls = isMuseSession(ctx.model);
  if (preparation.isSplitTurn && preparation.turnPrefixMessages.length > 0) {
    return summarizeSplitTurn(ctx.modelRegistry, haiku, preparation, event.branchEntries, event.customInstructions, event.signal, keepUrls);
  }
  const done = await summarizeHistory(ctx.modelRegistry, haiku, preparation, event.customInstructions, event.signal, keepUrls);
  return done ? resultOf(done.text, done.usage, preparation, event.branchEntries) : undefined;
}

export default function (pi: Pi): void {
  pi.on("session_before_compact", (event, ctx) => {
    if (!isCompactEvent(event)) return Promise.resolve(undefined);
    return summarizeSession(event, ctx, haikuCompactionEnabled(pi.getSettings()));
  });
}



