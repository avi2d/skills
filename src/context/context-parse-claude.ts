import { Effect, Schema } from "effect";
import { addPart, carriedOr, charsOf, decode, textOf, type Reading } from "./context-records";

const Attachment = Schema.Struct({ type: Schema.String, content: Schema.optional(Schema.Unknown), files: Schema.optional(Schema.Array(Schema.Struct({ content: Schema.String }))), addedLines: Schema.optional(Schema.Array(Schema.String)), addedBlocks: Schema.optional(Schema.Array(Schema.String)), text: Schema.optional(Schema.String), date: Schema.optional(Schema.String), systemPrompt: Schema.optional(Schema.Array(Schema.String)) });
const Record = Schema.Struct({ version: Schema.optional(Schema.String), cwd: Schema.optional(Schema.String), timestamp: Schema.String, message: Schema.optional(Schema.Struct({ role: Schema.String, content: Schema.optional(Schema.Unknown), model: Schema.optional(Schema.String), usage: Schema.optional(Schema.Struct({ input_tokens: Schema.Number, cache_creation_input_tokens: Schema.optional(Schema.Number), cache_read_input_tokens: Schema.optional(Schema.Number), output_tokens: Schema.Number })) })), attachment: Schema.optional(Schema.Struct({ type: Schema.String, content: Schema.optional(Schema.Unknown) })), rendered: Schema.optional(Schema.Array(Schema.Struct({ content: Schema.Unknown }))), requestId: Schema.optional(Schema.String) });
const Unrendered = Schema.Struct({ attachment: Attachment });
const UNRENDERED_VISIBLE = ["hook_additional_context", "hook_success", "instructions", "skill_listing", "agent_listing_delta", "deferred_tools_delta", "prompt_snapshot", "model", "date", "total_tokens_reminder", "mcp_instructions_delta"];

const ownText = (attachment: typeof Attachment.Type): string =>
  textOf(attachment.content ?? attachment.files?.map((file) => file.content) ?? attachment.addedLines ?? attachment.addedBlocks ?? attachment.text ?? attachment.date ?? attachment.systemPrompt);

const attachmentPart = (reading: Reading, type: string, own: string, shown: string): void => {
  if (shown !== "") addPart(reading, `attachment:${type}`, carriedOr("attachment", own), shown);
};

const requestOf = (record: typeof Record.Type, reading: Reading, line: number): void => {
  const { message } = record;
  const usage = message?.usage;
  const id = record.requestId ?? `line:${line}`;
  if (!message || !usage || reading.used.has(id) || (usage.input_tokens === 0 && usage.output_tokens === 0 && (usage.cache_read_input_tokens ?? 0) === 0 && (usage.cache_creation_input_tokens ?? 0) === 0)) return;
  if (reading.requests.length === 0) {
    reading.model = message.model === undefined ? reading.model : `claude-code/${message.model}`;
    reading.version = record.version ?? reading.version;
  }
  reading.used.add(id);
  reading.requests.push({ at: record.timestamp, input: usage.input_tokens, cacheRead: usage.cache_read_input_tokens ?? 0, cacheWrite: usage.cache_creation_input_tokens ?? 0, output: usage.output_tokens });
};

export const claudeRecord = Effect.fnUntraced(function* (type: string, value: unknown, reading: Reading, path: string, line: number) {
  if (!["assistant", "user", "attachment"].includes(type)) return;
  const record = yield* decode(Record, value, "claude-code", reading, path, line);
  if (reading.version === "unknown") reading.version = record.version ?? reading.version;
  if (reading.requests.length === 0) reading.repo = record.cwd ?? reading.repo;
  if (reading.at === "unknown") reading.at = record.timestamp;
  if (type === "attachment" && record.attachment && reading.requests.length === 0) {
    const { type: kind, content } = record.attachment;
    if (record.rendered) attachmentPart(reading, kind, textOf(content), record.rendered.map((block) => textOf(block.content)).join("\n"));
    else if (UNRENDERED_VISIBLE.includes(kind)) {
      const own = ownText((yield* decode(Unrendered, value, "claude-code", reading, path, line)).attachment);
      attachmentPart(reading, kind, own, own);
    }
    return;
  }
  if (type === "user" && record.message && !reading.firstSeen) {
    reading.firstMessage = charsOf(textOf(record.message.content));
    reading.firstSeen = true;
    return;
  }
  if (type === "assistant") requestOf(record, reading, line);
});
