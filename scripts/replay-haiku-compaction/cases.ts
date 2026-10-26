import { estimateTokens } from "@earendil-works/pi-coding-agent";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { SPLIT_MARKER, type SessionEntry, parseFileSections } from "./scoring";

export type ReplayCase = {
  readonly file: string;
  readonly dir: string;
  readonly index: number;
  readonly split: boolean;
  readonly tokensBefore: number;
  readonly history: AgentMessage[];
  readonly prefix: AgentMessage[];
  readonly previousSummary: string | undefined;
  readonly readFiles: string[];
  readonly modifiedFiles: string[];
  readonly recorded: string;
  readonly recordedModel: string;
  readonly promptChars: number;
  readonly rebuiltTokens: number;
  readonly skipped: number;
};

function entryMessage(entry: SessionEntry): AgentMessage | undefined {
  if (entry.type !== "message" || !entry.message) return undefined;
  if (entry.message.role === "system") return undefined;
  return entry.message;
}

function dominantModel(messages: readonly AgentMessage[]): string {
  const counts = new Map<string, number>();
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    const key = message.provider + "/" + message.model;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best = "unknown";
  let bestCount = 0;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return best;
}

function cutIndexOf(lines: readonly SessionEntry[], firstKeptEntryId: string, index: number): number | undefined {
  const idToIndex = new Map<string, number>();
  lines.forEach((line, i) => {
    if (line.id) idToIndex.set(line.id, i);
  });
  const keptIndex = idToIndex.get(firstKeptEntryId);
  return keptIndex === undefined || keptIndex >= index ? undefined : keptIndex;
}

function previousCompactionOf(lines: readonly SessionEntry[], index: number): number {
  let prevIndex = -1;
  for (const [i, line] of lines.entries()) {
    if (i >= index) break;
    if (line.type === "compaction" && typeof line.summary === "string") prevIndex = i;
  }
  return prevIndex;
}

function takeRange(
  lines: readonly SessionEntry[],
  from: number,
  to: number,
  skipped: { count: number },
): AgentMessage[] {
  const out: AgentMessage[] = [];
  for (const [i, line] of lines.entries()) {
    if (i < from || i >= to) continue;
    const message = entryMessage(line);
    if (message) out.push(message);
    else if (line.type === "message") skipped.count += 1;
  }
  return out;
}

function regionOf(
  lines: readonly SessionEntry[],
  prevIndex: number,
  keptIndex: number,
  split: boolean,
): { history: AgentMessage[]; prefix: AgentMessage[]; skipped: number } | undefined {
  const skipped = { count: 0 };
  if (!split) {
    const history = takeRange(lines, prevIndex + 1, keptIndex, skipped);
    return history.length === 0 ? undefined : { history, prefix: [], skipped: skipped.count };
  }
  let turnStart = -1;
  for (const [i, line] of lines.entries()) {
    if (i <= prevIndex || i > keptIndex) continue;
    const message = entryMessage(line);
    if (message && message.role === "user") turnStart = i;
  }
  if (turnStart < 0) return undefined;
  const history = takeRange(lines, prevIndex + 1, turnStart, skipped);
  const prefix = takeRange(lines, turnStart, keptIndex, skipped);
  if (history.length === 0 && prefix.length === 0) return undefined;
  return { history, prefix, skipped: skipped.count };
}

function writerOf(lines: readonly SessionEntry[], index: number): string | undefined {
  for (let i = index - 1; i >= 0; i -= 1) {
    const message = lines[i]?.message;
    if (lines[i]?.type === "message" && message?.role === "assistant") return message.provider + "/" + message.model;
  }
  return undefined;
}

export function buildCase(
  file: string,
  dir: string,
  lines: readonly SessionEntry[],
  index: number,
  sessionModel: string,
): ReplayCase | undefined {
  const entry = lines.at(index);
  if (!entry || entry.type !== "compaction" || typeof entry.summary !== "string" || !entry.firstKeptEntryId) return undefined;
  if (entry.fromHook) return undefined;
  if (!writerOf(lines, index)?.startsWith(sessionModel)) return undefined;
  const keptIndex = cutIndexOf(lines, entry.firstKeptEntryId, index);
  if (keptIndex === undefined) return undefined;
  if (lines.some((line) => Boolean(line.parentUuid))) return undefined;
  const prevIndex = previousCompactionOf(lines, index);
  const recorded = entry.summary;
  const region = regionOf(lines, prevIndex, keptIndex, recorded.includes(SPLIT_MARKER));
  if (!region) return undefined;
  const messages = [...region.history, ...region.prefix];
  const sections = parseFileSections(recorded);
  let rebuiltTokens = 0;
  for (const message of messages) rebuiltTokens += estimateTokens(message);
  return {
    file,
    dir,
    index,
    split: recorded.includes(SPLIT_MARKER),
    tokensBefore: typeof entry.tokensBefore === "number" ? entry.tokensBefore : 0,
    history: region.history,
    prefix: region.prefix,
    previousSummary: prevIndex >= 0 ? lines[prevIndex]?.summary : undefined,
    readFiles: sections.read,
    modifiedFiles: sections.modified,
    recorded,
    recordedModel: dominantModel(messages),
    promptChars: 0,
    rebuiltTokens,
    skipped: region.skipped,
  };
}

export function selectCases<T>(tagged: readonly { dir: string; file: string; value: T }[], limit: number, perFile: number): T[] {
  const byDir = new Map<string, { dir: string; file: string; value: T }[]>();
  for (const item of tagged) {
    const slot = byDir.get(item.dir) ?? [];
    slot.push(item);
    byDir.set(item.dir, slot);
  }
  const dirs = [...byDir.keys()].sort();
  for (const dir of dirs) byDir.get(dir)?.sort((a, b) => a.file.localeCompare(b.file));
  const perFileCount = new Map<string, number>();
  const picked: T[] = [];
  while (picked.length < limit) {
    if (!pickRound(dirs, byDir, perFileCount, perFile, picked, limit)) break;
  }
  return picked;
}

function takeOne<T>(
  slot: { dir: string; file: string; value: T }[] | undefined,
  perFileCount: Map<string, number>,
  perFile: number,
): T | undefined {
  const item = slot?.shift();
  if (!item) return undefined;
  const key = item.dir + "#" + item.file;
  const used = perFileCount.get(key) ?? 0;
  if (used >= perFile) return undefined;
  perFileCount.set(key, used + 1);
  return item.value;
}

function pickRound<T>(
  dirs: readonly string[],
  byDir: ReadonlyMap<string, { dir: string; file: string; value: T }[]>,
  perFileCount: Map<string, number>,
  perFile: number,
  picked: T[],
  limit: number,
): boolean {
  let progress = false;
  for (const dir of dirs) {
    if (picked.length >= limit) break;
    const value = takeOne(byDir.get(dir), perFileCount, perFile);
    if (value === undefined) continue;
    picked.push(value);
    progress = true;
  }
  return progress;
}

export function caseKey(dir: string, file: string, index: number): string {
  return dir + "#" + file + "#" + String(index);
}

export function explicitFilter(spec: string): Map<string, Set<number>> {
  const out = new Map<string, Set<number>>();
  for (const part of spec.split(",")) {
    const [file, raw] = part.split(":");
    if (!file || !raw) continue;
    const index = Number(raw);
    if (!Number.isInteger(index)) continue;
    const slot = out.get(file) ?? new Set<number>();
    slot.add(index);
    out.set(file, slot);
  }
  return out;
}
