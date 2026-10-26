import type { ExtensionAPI, ToolInfo } from "@earendil-works/pi-coding-agent";

const FN_OPEN = "<function=";
const FN_CLOSE = "</function>";
const PARAM_OPEN = "<parameter=";
const PARAM_CLOSE = "</parameter>";
const CALL_OPEN = "<tool_call>";
const CALL_CLOSE = "</tool_call>";

const QWEN_CODER = /qwen[\d.]*-?coder/i;
const INTEGER = /^[+-]?\d+$/;
const NUMBER = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

// A parameter absent from this map is untyped, and its value stays the raw string.
export type ParameterTypes = ReadonlyMap<string, readonly string[]>;

export type LeakedCall = { readonly name: string; readonly arguments: Record<string, JsonValue> };

export type Repair = { readonly text: string; readonly calls: readonly LeakedCall[] };

export type TypesFor = (tool: string) => ParameterTypes | undefined;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const typesOfProperty = (property: unknown): readonly string[] => {
  if (!isRecord(property)) return [];
  const { type, anyOf } = property;
  if (Array.isArray(anyOf)) return anyOf.flatMap(typesOfProperty);
  if (typeof type === "string") return [type];
  if (Array.isArray(type)) return type.filter((t): t is string => typeof t === "string");
  return [];
};

export const typesOf = (schema: unknown): ParameterTypes => {
  const types = new Map<string, readonly string[]>();
  if (!isRecord(schema)) return types;
  const { properties } = schema;
  if (!isRecord(properties)) return types;
  for (const [key, property] of Object.entries(properties)) types.set(key, typesOfProperty(property));
  return types;
};

function isJsonArray(value: unknown): value is JsonValue[] {
  return Array.isArray(value) && value.every(isJsonValue);
}

function isJsonObject(value: unknown): value is { [key: string]: JsonValue } {
  return isRecord(value) && !Array.isArray(value) && Object.values(value).every(isJsonValue);
}

function isJsonValue(value: unknown): value is JsonValue {
  return value === null || ["string", "number", "boolean"].includes(typeof value) || isJsonArray(value) || isJsonObject(value);
}

const asArray = (raw: string): JsonValue[] | undefined => {
  try {
    const parsed = JSON.parse(raw);
    return isJsonArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
};

const asObject = (raw: string): { [key: string]: JsonValue } | undefined => {
  try {
    const parsed = JSON.parse(raw);
    return isJsonObject(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
};

const asBoolean = (value: string): boolean | undefined => {
  const lower = value.toLowerCase();
  if (lower === "true") return true;
  return lower === "false" ? false : undefined;
};

const asInteger = (value: string): number | undefined => (INTEGER.test(value) ? Number(value) : undefined);

const asNumber = (value: string): number | undefined => (NUMBER.test(value) ? Number(value) : undefined);

// `unread` is the value a parameter declared with this one type takes when it does not read as that type.
type Reader = { type: string; read: (value: string) => JsonValue | undefined; unread: (value: string) => JsonValue };

const READERS: readonly Reader[] = [
  { type: "boolean", read: asBoolean, unread: () => false },
  { type: "integer", read: asInteger, unread: (value) => value },
  { type: "number", read: asNumber, unread: (value) => value },
  { type: "array", read: asArray, unread: (value) => value },
  { type: "object", read: asObject, unread: (value) => value },
];

export const parseValue = (raw: string, types: readonly string[]): JsonValue => {
  const withoutLead = raw.startsWith("\n") ? raw.slice(1) : raw;
  const value = withoutLead.endsWith("\n") ? withoutLead.slice(0, -1) : withoutLead;
  if (value.toLowerCase() === "null") return null;
  const declared = new Set(types);
  // Go's parser falls back on the declared list's length rather than the deduplicated set's.
  const only = types.length === 1;
  for (const { type, read, unread } of READERS) {
    if (!declared.has(type)) continue;
    const typed = read(value);
    if (typed !== undefined) return typed;
    if (only) return unread(value);
  }
  return value;
};

const parseParameters = (body: string, types: ParameterTypes | undefined): Record<string, JsonValue> | undefined => {
  const args: Record<string, JsonValue> = {};
  let cursor = 0;
  for (;;) {
    const open = body.indexOf(PARAM_OPEN, cursor);
    if (open === -1) return args;
    const keyEnd = body.indexOf(">", open + PARAM_OPEN.length);
    if (keyEnd === -1) return undefined;
    const close = body.indexOf(PARAM_CLOSE, keyEnd + 1);
    if (close === -1) return undefined;
    const key = body.slice(open + PARAM_OPEN.length, keyEnd);
    args[key] = parseValue(body.slice(keyEnd + 1, close), types?.get(key) ?? []);
    cursor = close + PARAM_CLOSE.length;
  }
};

const withoutOpener = (segment: string): string => {
  const trimmed = segment.trimEnd();
  return trimmed.endsWith(CALL_OPEN) ? trimmed.slice(0, -CALL_OPEN.length) : trimmed;
};

const pastCloser = (text: string, from: number): number => {
  const start = from + (text.slice(from).match(/^\s*/)?.[0].length ?? 0);
  return text.startsWith(CALL_CLOSE, start) ? start + CALL_CLOSE.length : start;
};

// Undefined leaves the text exactly as written: no call in it, or a block that did not parse.
export const repair = (text: string, typesFor: TypesFor): Repair | undefined => {
  if (!text.includes(FN_OPEN)) return undefined;
  const prose: string[] = [];
  const calls: LeakedCall[] = [];
  let cursor = 0;
  for (;;) {
    const open = text.indexOf(FN_OPEN, cursor);
    if (open === -1) break;
    const nameEnd = text.indexOf(">", open + FN_OPEN.length);
    if (nameEnd === -1) return undefined;
    const close = text.indexOf(FN_CLOSE, nameEnd + 1);
    if (close === -1) return undefined;
    const name = text.slice(open + FN_OPEN.length, nameEnd);
    const args = parseParameters(text.slice(nameEnd + 1, close), typesFor(name));
    if (!args) return undefined;
    prose.push(withoutOpener(text.slice(cursor, open)));
    calls.push({ name, arguments: args });
    cursor = pastCloser(text, close + FN_CLOSE.length);
  }
  if (calls.length === 0) return undefined;
  prose.push(text.slice(cursor));
  return { text: prose.map((part) => part.trim()).filter(Boolean).join("\n"), calls };
};

export const typesFromTools = (tools: readonly ToolInfo[]): TypesFor => {
  const byName = new Map(tools.map((tool) => [tool.name, typesOf(tool.parameters)]));
  return (tool) => byName.get(tool);
};

export const emitsQwenToolCalls = (model: string): boolean => QWEN_CODER.test(model);

export default function (pi: ExtensionAPI): void {
  pi.on("message_end", (event) => {
    const message = event.message;
    if (message.role !== "assistant") return;
    if (!emitsQwenToolCalls(message.responseModel ?? message.model)) return;
    // A parsed call means the provider read the turn correctly and the loop is already continuing.
    if (message.content.some((part) => part.type === "toolCall")) return;

    const typesFor = typesFromTools(pi.getAllTools());
    const kept: typeof message.content = [];
    const recovered: typeof message.content = [];
    for (const part of message.content) {
      const repaired = part.type === "text" ? repair(part.text, typesFor) : undefined;
      if (!repaired || part.type !== "text") {
        kept.push(part);
        continue;
      }
      if (repaired.text) kept.push({ ...part, text: repaired.text });
      for (const call of repaired.calls) {
        recovered.push({ type: "toolCall", id: `call_${crypto.randomUUID()}`, name: call.name, arguments: call.arguments });
      }
    }
    if (recovered.length === 0) return;
    return { message: { ...message, content: [...kept, ...recovered] } };
  });
}
