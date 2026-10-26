import { Schema } from "effect";
import { createInterface } from "node:readline";

const CONNECT_DELAY_MS = 1500;

const send = (message: unknown): void => {
  process.stdout.write(`${JSON.stringify(message)}\n`);
};

const rows = [{ status: "failed" }, { status: "ok" }, { status: "failed" }];

const decodeMessage = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      id: Schema.optionalKey(Schema.Unknown),
      method: Schema.optionalKey(Schema.String),
      params: Schema.optionalKey(Schema.Struct({ protocolVersion: Schema.optionalKey(Schema.String) })),
    }),
  ),
);

type Message = ReturnType<typeof decodeMessage>;

function answer(message: Message): void {
  if (message.id === undefined) return;
  const result =
    message.method === "initialize"
      ? { protocolVersion: message.params?.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "rowsrv", version: "1.0.0" } }
      : message.method === "tools/list"
        ? { tools: [{ name: "rows", description: "List rows", inputSchema: { type: "object", properties: {} } }] }
        : message.method === "tools/call"
          ? { content: [{ type: "text", text: JSON.stringify({ rows }) }], structuredContent: { rows } }
          : {};
  send({ jsonrpc: "2.0", id: message.id, result });
}

createInterface({ input: process.stdin }).on("line", (line) => {
  const message = decodeMessage(line);
  if (message.method === "initialize") setTimeout(() => answer(message), CONNECT_DELAY_MS);
  else answer(message);
});
