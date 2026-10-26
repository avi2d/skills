import { Effect, Option, Schema } from "effect";
import { MalformedRecord } from "../platform/failures";
import { PREAMBLE } from "../dispatcher/dispatch";

export const TOOLS = ["pi", "claude-code", "codex"] as const;
export type Tool = (typeof TOOLS)[number];
export type Usage = { readonly at: string; readonly input: number; readonly cacheRead: number; readonly cacheWrite: number; readonly output: number };
export type Part = { readonly name: string; readonly kind: string; readonly chars: number };
export type Session = { readonly tool: Tool; readonly version: string; readonly path: string; readonly repo: string; readonly model: string; readonly at: string; readonly requests: readonly Usage[]; readonly parts: readonly Part[]; readonly firstMessage: number };
export type Reading = { version: string; model: string; provider: string; repo: string; at: string; firstMessage: number; firstSeen: boolean; systemSeen: boolean; parts: Part[]; requests: Usage[]; used: Set<string> };

export const RULE_CARRIAGE = "rule-carriage";
export const RULE_PREVIEW = "rule-carriage-preview";
export const isCarriage = (kind: string): boolean => kind === RULE_CARRIAGE || kind === RULE_PREVIEW;
export const RULE_BODY = "rule-current-body";
export const RULE_PREFIX = "rule:";
export const HOLDING = " holding ";

const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
export const charsOf = (text: string): number => Array.from(segmenter.segment(text)).length;
export const addPart = (reading: Reading, name: string, kind: string, text: string): void => {
  const index = reading.parts.findIndex((found) => found.name === name && found.kind === kind);
  const earlier = reading.parts[index];
  if (earlier === undefined) {
    reading.parts.push({ name, kind, chars: charsOf(text) });
    return;
  }
  reading.parts[index] = { name, kind, chars: earlier.chars + charsOf(text) };
};
const kindLabel = (kind: string): string => {
  if (kind === RULE_CARRIAGE) return "Rules";
  return kind === RULE_PREVIEW ? "preview of Rules" : "not Rules";
};
const labelOf = (kind: string): string => ` (${kindLabel(kind)})`;
export const distinctNames = (parts: readonly Part[]): Part[] =>
  parts.map((part) => (parts.some((other) => other.name === part.name && other.kind !== part.kind) ? { ...part, name: `${part.name}${labelOf(part.kind)}` } : part));
export const unlabelled = (name: string, kind: string): string => (name.endsWith(labelOf(kind)) ? name.slice(0, -labelOf(kind).length) : name);
const PERSISTED_PREVIEW = /^<persisted-output>\n[\s\S]*?\nPreview \([^)\n]*\):\n/;
export const carriedOr = (kind: string, text: string): string => {
  if (text.startsWith(PREAMBLE)) return RULE_CARRIAGE;
  return text.replace(PERSISTED_PREVIEW, "").startsWith(PREAMBLE) ? RULE_PREVIEW : kind;
};
const TextBlocks = Schema.Array(Schema.Union([Schema.String, Schema.Struct({ text: Schema.optional(Schema.String) })]));
export const textOf = (value: unknown): string => {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  const blocks = Schema.decodeUnknownOption(TextBlocks)(value);
  return Option.isSome(blocks) ? blocks.value.map((block) => (typeof block === "string" ? block : block.text ?? "")).join("\n") : JSON.stringify(value);
};

export const Envelope = Schema.fromJsonString(Schema.Struct({ type: Schema.String }));
export const ParsedJson = Schema.fromJsonString(Schema.Unknown);
export const decode = <A, E>(schema: Schema.Codec<A, E>, value: unknown, tool: Tool, reading: Reading, path: string, line: number): Effect.Effect<A, MalformedRecord> =>
  Schema.decodeUnknownEffect(schema)(value).pipe(Effect.mapError((error) => new MalformedRecord({ message: `${tool} ${reading.version} ${path}:${line}: ${error.message}` })));
