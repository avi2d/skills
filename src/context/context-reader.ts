import { Effect } from "effect";
import { MalformedRecord } from "../platform/failures";
import { claudeRecord } from "./context-parse-claude";
import { codexRecord } from "./context-parse-codex";
import { piRecord } from "./context-parse-pi";
import { decode, distinctNames, Envelope, ParsedJson, type Reading, type Session, type Tool } from "./context-records";

export { TOOLS } from "./context-records";

export const READER_VERSION = 11;
export type { Part, Session, Tool, Usage } from "./context-records";

export const parseSession = Effect.fnUntraced(function* (tool: Tool, path: string, text: string): Effect.fn.Return<Session, MalformedRecord> {
  const reading: Reading = { version: "unknown", model: "unknown", provider: "unknown", repo: "unknown", at: "unknown", firstMessage: 0, firstSeen: false, systemSeen: false, parts: [], requests: [], used: new Set() };
  for (const [index, raw] of text.split("\n").entries()) {
    if (raw === "") continue;
    const line = index + 1;
    const envelope = yield* decode(Envelope, raw, tool, reading, path, line);
    const value = yield* decode(ParsedJson, raw, tool, reading, path, line);
    if (tool === "pi") yield* piRecord(envelope.type, value, reading, path, line);
    else if (tool === "claude-code") yield* claudeRecord(envelope.type, value, reading, path, line);
    else yield* codexRecord(envelope.type, value, reading, path, line);
  }
  if (reading.requests.length > 0 && (reading.repo === "unknown" || reading.version === "unknown")) {
    return yield* new MalformedRecord({ message: `${tool} ${reading.version} ${path}: missing session metadata` });
  }
  return { tool, path, version: reading.version, model: reading.model, repo: reading.repo, at: reading.at, parts: distinctNames(reading.parts), requests: reading.requests, firstMessage: reading.firstMessage };
});
