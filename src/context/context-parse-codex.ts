import { Effect, Schema } from "effect";
import { MalformedRecord } from "../platform/failures";
import { addPart, carriedOr, charsOf, decode, type Reading } from "./context-records";

const Record = Schema.Struct({ timestamp: Schema.String, payload: Schema.Unknown });
const Meta = Schema.Struct({ cwd: Schema.String, cli_version: Schema.String, model_provider: Schema.String, base_instructions: Schema.optional(Schema.Struct({ text: Schema.String })) });
const Turn = Schema.Struct({ model: Schema.String });
const Tokens = Schema.Struct({ input_tokens: Schema.Number, cached_input_tokens: Schema.Number, cache_write_input_tokens: Schema.optional(Schema.Number), output_tokens: Schema.Number });
const Typed = Schema.Struct({ type: Schema.String });
const Event = Schema.Struct({ info: Schema.optional(Schema.Struct({ total_token_usage: Tokens, last_token_usage: Schema.optional(Tokens) })) });
const Item = Schema.Struct({ role: Schema.optional(Schema.String), content: Schema.optional(Schema.Array(Schema.Struct({ type: Schema.String, text: Schema.optional(Schema.String) }))), internal_chat_message_metadata_passthrough: Schema.optional(Schema.Struct({ content_item_kinds: Schema.optional(Schema.Array(Schema.String)) })) });
const UNTAGGED_CONTEXT: ReadonlyArray<readonly [prefix: string, kind: string]> = [["<recommended_plugins>", "plugins.recommendations"], ["# AGENTS.md instructions", "agents_md.instructions"], ["<environment_context>", "environments.environment_context"]];
const LEADING_TAG = /^<([^>\n]+)>/;

const eventOf = Effect.fnUntraced(function* (payload: unknown, at: string, reading: Reading, path: string, line: number) {
  if ((yield* decode(Typed, payload, "codex", reading, path, line)).type !== "token_count") return;
  const { info } = yield* decode(Event, payload, "codex", reading, path, line);
  const usage = info?.last_token_usage;
  if (!info || !usage) return;
  const total = JSON.stringify(info.total_token_usage);
  if (reading.used.has(total)) return;
  reading.used.add(total);
  const cacheWrite = usage.cache_write_input_tokens ?? 0;
  const input = usage.input_tokens - usage.cached_input_tokens - cacheWrite;
  if (input < 0) return yield* new MalformedRecord({ message: `codex v${reading.version} ${path}:${line}: cached input exceeds total input` });
  reading.requests.push({ at, input, cacheRead: usage.cached_input_tokens, cacheWrite, output: usage.output_tokens });
});

const itemOf = Effect.fnUntraced(function* (payload: unknown, reading: Reading, path: string, line: number) {
  if ((yield* decode(Typed, payload, "codex", reading, path, line)).type !== "message") return;
  const item = yield* decode(Item, payload, "codex", reading, path, line);
  const texts = (item.content ?? []).map((entry) => entry.text ?? "");
  if (item.role === "developer") for (const text of texts) addPart(reading, `developer:${LEADING_TAG.exec(text)?.[1] ?? "untagged"}`, "system", text);
  if (item.role !== "user") return;
  const kinds = item.internal_chat_message_metadata_passthrough?.content_item_kinds;
  const prompt: string[] = [];
  for (const [index, text] of texts.entries()) {
    const kind = kinds?.[index] ?? UNTAGGED_CONTEXT.find(([prefix]) => text.startsWith(prefix))?.[1];
    if (kind === undefined || kind.startsWith("user.")) prompt.push(text);
    else addPart(reading, `context:${kind}`, carriedOr("context", text), text);
  }
  if (prompt.length > 0 && !reading.firstSeen) {
    reading.firstMessage = charsOf(prompt.join("\n"));
    reading.firstSeen = true;
  }
});

export const codexRecord = Effect.fnUntraced(function* (type: string, value: unknown, reading: Reading, path: string, line: number) {
  const record = yield* decode(Record, value, "codex", reading, path, line);
  if (reading.at === "unknown") reading.at = record.timestamp;
  if (reading.requests.length > 0 && type !== "event_msg") return;
  switch (type) {
    case "session_meta": {
      const meta = yield* decode(Meta, record.payload, "codex", reading, path, line);
      reading.repo = meta.cwd;
      reading.version = meta.cli_version;
      reading.provider = meta.model_provider;
      if (meta.base_instructions) addPart(reading, "base instructions", "system", meta.base_instructions.text);
      break;
    }
    case "turn_context":
      reading.model = `${reading.provider}/${(yield* decode(Turn, record.payload, "codex", reading, path, line)).model}`;
      break;
    case "response_item":
      yield* itemOf(record.payload, reading, path, line);
      break;
    case "event_msg":
      yield* eventOf(record.payload, record.timestamp, reading, path, line);
      break;
    default:
      break;
  }
});
