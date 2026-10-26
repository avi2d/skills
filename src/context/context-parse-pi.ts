import { Effect, Schema } from "effect";
import { addPart, charsOf, decode, textOf, type Reading } from "./context-records";

const Header = Schema.Struct({ version: Schema.Number, cwd: Schema.String, timestamp: Schema.String });
const Model = Schema.Struct({ provider: Schema.String, modelId: Schema.String });
const Message = Schema.Struct({ message: Schema.Struct({ role: Schema.String, sections: Schema.optional(Schema.Record(Schema.String, Schema.String)), toolsAdded: Schema.optional(Schema.Array(Schema.Struct({ name: Schema.String, description: Schema.String }))), usage: Schema.optional(Schema.Struct({ input: Schema.Number, cacheRead: Schema.Number, cacheWrite: Schema.Number, output: Schema.Number })), content: Schema.optional(Schema.Unknown) }), timestamp: Schema.optional(Schema.String) });

export const piRecord = Effect.fnUntraced(function* (type: string, value: unknown, reading: Reading, path: string, line: number) {
  if (type === "session") {
    const header = yield* decode(Header, value, "pi", reading, path, line);
    reading.version = `unknown (session format ${header.version})`;
    reading.repo = header.cwd;
    reading.at = header.timestamp;
    return;
  }
  if (type === "model_change") {
    const change = yield* decode(Model, value, "pi", reading, path, line);
    if (reading.requests.length === 0) reading.model = `${change.provider}/${change.modelId}`;
    return;
  }
  if (type !== "message") return;
  const record = yield* decode(Message, value, "pi", reading, path, line);
  const message = record.message;
  if (message.role === "system" && !reading.systemSeen) {
    reading.systemSeen = true;
    for (const [name, content] of Object.entries(message.sections ?? {})) addPart(reading, name, "system", content);
    for (const toolDefinition of message.toolsAdded ?? []) addPart(reading, `tool:${toolDefinition.name}`, "tool", toolDefinition.description);
  } else if (message.role === "user" && !reading.firstSeen) {
    reading.firstMessage = charsOf(textOf(message.content));
    reading.firstSeen = true;
  } else if (message.role === "assistant" && message.usage && Object.values(message.usage).some((count) => count > 0)) {
    reading.requests.push({ at: record.timestamp ?? reading.at, input: message.usage.input, cacheRead: message.usage.cacheRead, cacheWrite: message.usage.cacheWrite, output: message.usage.output });
  }
});
