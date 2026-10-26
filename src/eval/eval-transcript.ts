import { Option, Schema } from "effect";

export type Call = { id: string; tool: string; args: Readonly<Record<string, unknown>>; result: string; failed: boolean };

export type Step = { kind: "call"; call: Call } | { kind: "say"; text: string };

export type RequestUsage = { input: number; output: number; cacheRead: number; cacheWrite: number; cacheWrite1h: number; cost: number };

export type Transcript = {
  steps: Step[];
  answer: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cacheWrite1h: number;
  requests: RequestUsage[];
  cost: number;
  providerError: string | undefined;
  unreadable: number;
};

const Part = Schema.Union([
  Schema.Struct({ type: Schema.Literal("text"), text: Schema.String }),
  Schema.Struct({ type: Schema.Literal("toolCall"), id: Schema.String, name: Schema.String, arguments: Schema.Record(Schema.String, Schema.Unknown) }),
  Schema.Struct({ type: Schema.Literals(["thinking", "image"]) }),
]);

const Assistant = Schema.Struct({
  role: Schema.Literal("assistant"),
  content: Schema.Array(Part),
  usage: Schema.Struct({
    input: Schema.Finite,
    output: Schema.Finite,
    cacheRead: Schema.optionalKey(Schema.Finite),
    cacheWrite: Schema.optionalKey(Schema.Finite),
    cacheWrite1h: Schema.optionalKey(Schema.Finite),
    cost: Schema.Struct({ total: Schema.Finite }),
  }),
  stopReason: Schema.String,
  errorMessage: Schema.optional(Schema.String),
});

const ToolResult = Schema.Struct({
  role: Schema.Literal("toolResult"),
  toolCallId: Schema.String,
  content: Schema.Array(Part),
  isError: Schema.Boolean,
});

const Passive = Schema.Struct({
  role: Schema.Literals(["user", "system", "custom", "bashExecution", "branchSummary", "compactionSummary"]),
});

const decodeLine = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Struct({ type: Schema.String, message: Schema.optional(Schema.Unknown) })));
const decodeMessage = Schema.decodeUnknownOption(Schema.Union([Assistant, ToolResult, Passive]));

const textOf = (parts: ReadonlyArray<typeof Part.Type>): string =>
  parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n");

export const bytesOf = (text: string): number => new TextEncoder().encode(text).length;

type Said = typeof Assistant.Type | typeof ToolResult.Type | typeof Passive.Type;

function heard(line: string): { said: Said } | "skipped" | "unreadable" {
  if (line.trim() === "") return "skipped";
  const event = decodeLine(line);
  if (Option.isNone(event)) return "unreadable";
  if (event.value.type !== "message_end") return "skipped";
  const message = decodeMessage(event.value.message);
  return Option.isNone(message) ? "unreadable" : { said: message.value };
}

function answered(transcript: Transcript, pending: Map<string, Call>, said: typeof Assistant.Type): void {
  const request: RequestUsage = {
    input: said.usage.input,
    output: said.usage.output,
    cacheRead: said.usage.cacheRead ?? 0,
    cacheWrite: said.usage.cacheWrite ?? 0,
    cacheWrite1h: said.usage.cacheWrite1h ?? 0,
    cost: said.usage.cost.total,
  };
  transcript.input += request.input;
  transcript.output += request.output;
  transcript.cacheRead += request.cacheRead;
  transcript.cacheWrite += request.cacheWrite;
  transcript.cacheWrite1h += request.cacheWrite1h;
  transcript.requests.push(request);
  transcript.cost += request.cost;
  transcript.providerError = said.stopReason === "error" ? (said.errorMessage ?? "the provider stopped with an error") : undefined;
  const text = textOf(said.content);
  transcript.answer = text;
  if (text !== "") transcript.steps.push({ kind: "say", text });
  for (const part of said.content) {
    if (part.type !== "toolCall") continue;
    const call: Call = { id: part.id, tool: part.name, args: part.arguments, result: "", failed: false };
    pending.set(part.id, call);
    transcript.steps.push({ kind: "call", call });
  }
}

function resulted(transcript: Transcript, pending: ReadonlyMap<string, Call>, said: typeof ToolResult.Type): void {
  const call = pending.get(said.toolCallId);
  if (call === undefined) {
    transcript.unreadable++;
    return;
  }
  call.result = textOf(said.content);
  call.failed = said.isError;
}

export function transcriptOf(lines: readonly string[]): Transcript {
  const transcript: Transcript = { steps: [], answer: "", input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cacheWrite1h: 0, requests: [], cost: 0, providerError: undefined, unreadable: 0 };
  const pending = new Map<string, Call>();
  for (const line of lines) {
    const read = heard(line);
    if (read === "skipped") continue;
    if (read === "unreadable") transcript.unreadable++;
    else if (read.said.role === "assistant") answered(transcript, pending, read.said);
    else if (read.said.role === "toolResult") resulted(transcript, pending, read.said);
  }
  return transcript;
}
