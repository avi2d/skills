import { Schema } from "effect";
import type { AgentMessage } from "@earendil-works/pi-agent-core";

export class ArgsError extends Schema.TaggedError<ArgsError>()("ArgsError", { message: Schema.String }) {}
export class ParseSkip extends Schema.TaggedError<ParseSkip>()("ParseSkip", {
  file: Schema.String,
}) {}

export class ReadError extends Schema.TaggedError<ReadError>()("ReadError", { message: Schema.String }) {}
export class ModelError extends Schema.TaggedError<ModelError>()("ModelError", { message: Schema.String }) {}

export const SPLIT_MARKER = "Turn Context (split turn)";

export type SessionEntry = {
  readonly id?: string;
  readonly type?: string;
  readonly parentUuid?: string | null;
  readonly message?: AgentMessage;
  readonly summary?: string;
  readonly firstKeptEntryId?: string;
  readonly tokensBefore?: number;
  readonly fromHook?: boolean;
};

export type SummaryItem = {
  readonly class: string;
  readonly text: string;
  readonly quote: boolean;
  readonly openDecision: boolean;
};

type ClassScore = { readonly class: string; readonly total: number; readonly hits: number };

export function stripFileSections(summary: string): string {
  return summary
    .replace(/<(read|modified)-files>[\s\S]*?<\/\1-files>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseFileSections(summary: string): { read: string[]; modified: string[] } {
  const read: string[] = [];
  const modified: string[] = [];
  const pattern = /<(?<kind>read|modified)-files>(?<body>[\s\S]*?)<\/\k<kind>-files>/g;
  let match = pattern.exec(summary);
  while (match) {
    const kind = match.groups?.kind ?? "";
    const files = (match.groups?.body ?? "").split("\n").map((line) => line.trim()).filter((line) => line !== "");
    if (kind === "read") read.push(...files);
    else modified.push(...files);
    match = pattern.exec(summary);
  }
  return { read, modified };
}

const CLASS_BY_HEADING: Readonly<Record<string, string>> = {
  goal: "goal",
  constraints: "constraints",
  done: "done",
  "in progress": "inprogress",
  blocked: "blocked",
  "key decisions": "decisions",
  "next steps": "next",
  "critical context": "context",
};

const ITEM_LINE = /^(?:[-*]|\d+[.)])\s+(?:\[[ x]\]\s+)?(.+)$/;
const QUOTED = /"([^"]{8,})"/;
const DECISION_WORD = /\b(decide|decision|decisions|pending|awaiting|unclear|tbd|to decide|open)\b/i;
const OPEN_WORD = /\b(pending|awaiting|unclear|tbd|to decide)\b/i;
const HEADING_LINE = /^#{2,3}\s+(.+?)\s*$/;

function classOfHeading(heading: string): string | undefined {
  return CLASS_BY_HEADING[heading.trim().toLowerCase()];
}

export function isOpenDecision(className: string, text: string): boolean {
  if (className === "decisions") return text.includes("?") || OPEN_WORD.test(text);
  if (className !== "blocked" && className !== "next" && className !== "inprogress") return false;
  return text.includes("?") || DECISION_WORD.test(text);
}

export function parseItems(summary: string): SummaryItem[] {
  const items: SummaryItem[] = [];
  let className = "other";
  for (const line of stripFileSections(summary).split("\n")) {
    const headingText = HEADING_LINE.exec(line)?.[1] ?? "";
    if (headingText !== "") {
      className = classOfHeading(headingText) ?? "other";
      continue;
    }
    const itemText = ITEM_LINE.exec(line)?.[1] ?? "";
    if (itemText === "") continue;
    const text = itemText.trim();
    if (text === "" || text.startsWith("[") || text.startsWith("(none)")) continue;
    items.push({ class: className, text, quote: QUOTED.test(text), openDecision: isOpenDecision(className, text) });
  }
  return items;
}

export function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export function distinctive(text: string): string[] {
  const out: string[] = [];
  for (const raw of normalize(text).split(" ")) {
    const token = raw.replace(/^[^a-z0-9/._~:+-]+|[^a-z0-9/._~:+-]+$/g, "");
    if (token === "") continue;
    const rich = token.length >= 5 || (token.length >= 4 && (token.includes("/") || token.includes(".") || /\d/.test(token)));
    if (rich) out.push(token);
    if (out.length >= 24) break;
  }
  return out;
}

export function worded(candidate: string): string {
  return " " + candidate.replace(/[^a-z0-9]+/g, " ") + " ";
}

export function tokenHit(token: string, candidate: string, candidateWords: string): boolean {
  if (token.includes("/") || token.includes(".") || /\d/.test(token)) return candidate.includes(token);
  return candidateWords.includes(" " + token + " ");
}

export function itemRecalled(item: SummaryItem, candidate: string, candidateWords: string): boolean {
  const tokens = distinctive(item.text);
  if (tokens.length < 2) return candidate.includes(normalize(item.text));
  const hits = tokens.filter((token) => tokenHit(token, candidate, candidateWords)).length;
  return hits / tokens.length >= 0.6;
}

export type SummaryScore = {
  readonly classes: ClassScore[];
  readonly overall: number;
  readonly total: number;
  readonly hits: number;
  readonly quoteRecall: number;
  readonly quoteTotal: number;
  readonly decisionRecall: number;
  readonly decisionTotal: number;
  readonly recordedChars: number;
  readonly candidateChars: number;
};

type Tally = {
  hits: number;
  quoteHits: number;
  quoteTotal: number;
  decisionHits: number;
  decisionTotal: number;
  byClass: Map<string, { total: number; hits: number }>;
};

function tallyItems(items: readonly SummaryItem[], candidateNorm: string, candidateWords: string): Tally {
  const tally: Tally = { hits: 0, quoteHits: 0, quoteTotal: 0, decisionHits: 0, decisionTotal: 0, byClass: new Map() };
  for (const item of items) {
    const hit = itemRecalled(item, candidateNorm, candidateWords);
    if (hit) tally.hits += 1;
    const slot = tally.byClass.get(item.class) ?? { total: 0, hits: 0 };
    slot.total += 1;
    if (hit) slot.hits += 1;
    tally.byClass.set(item.class, slot);
    if (item.quote) {
      tally.quoteTotal += 1;
      if (hit) tally.quoteHits += 1;
    }
    if (item.openDecision) {
      tally.decisionTotal += 1;
      if (hit) tally.decisionHits += 1;
    }
  }
  return tally;
}

export function scoreSummaries(recorded: string, candidate: string): SummaryScore {
  const items = parseItems(recorded);
  const candidateStripped = stripFileSections(candidate);
  const candidateNorm = normalize(candidateStripped);
  const tally = tallyItems(items, candidateNorm, worded(candidateNorm));
  const classes = [...tally.byClass].map(([name, slot]) => ({ class: name, total: slot.total, hits: slot.hits }));
  classes.sort((a, b) => a.class.localeCompare(b.class));
  return {
    classes,
    overall: items.length === 0 ? 1 : tally.hits / items.length,
    total: items.length,
    hits: tally.hits,
    quoteRecall: tally.quoteTotal === 0 ? 1 : tally.quoteHits / tally.quoteTotal,
    quoteTotal: tally.quoteTotal,
    decisionRecall: tally.decisionTotal === 0 ? 1 : tally.decisionHits / tally.decisionTotal,
    decisionTotal: tally.decisionTotal,
    recordedChars: stripFileSections(recorded).length,
    candidateChars: candidateStripped.length,
  };
}

export function isSessionEntry(value: unknown): value is SessionEntry {
  return typeof value === "object" && value !== null && typeof Reflect.get(value, "type") === "string";
}
