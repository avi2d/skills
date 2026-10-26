import { createInterface } from "node:readline";
import extension, { type Context, type Pi } from "../../harness/pi/extensions/herdr-model-label";

const [provider = "fake", model = "fake-model", contextWindow = "200000"] = process.argv.slice(2);

type Handler = (event: unknown, ctx: Context) => unknown;
const handlers = new Map<string, Handler>();
function on(event: string, handler: Handler): void {
  handlers.set(event, handler);
}
const pi: Pi = { on, getThinkingLevel: () => (provider === "unknown" ? "off" : "high") };
extension(pi);

const ctx = (tokens: number | null): Context => ({
  mode: "tui",
  model: { provider, id: model },
  getContextUsage: () => ({ tokens, contextWindow: Number(contextWindow) }),
});
const fire = (event: string, tokens: number | null): unknown => handlers.get(event)?.({}, ctx(tokens));

fire("session_start", null);
process.stdout.write("started\n");

for await (const line of createInterface({ input: process.stdin })) {
  const [command, tokens] = line.split(" ");
  if (command === "turn") {
    fire("turn_end", Number(tokens));
    process.stdout.write("turned\n");
  }
  if (command === "stop") {
    await fire("session_shutdown", null);
    process.stdout.write("stopped\n");
    process.exit(0);
  }
}
