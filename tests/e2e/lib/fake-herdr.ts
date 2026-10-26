import { mkdtempSync, rmSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";

export const PANE = "w1-2";

export type Herdr = { readonly socket: string; readonly received: unknown[]; readonly dir: string; foreground: readonly number[] };

export const get = (value: unknown, key: string): unknown => (typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined);

export async function fakeHerdr(agents: readonly (string | undefined)[], run: (herdr: Herdr) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(`${tmpdir()}/herdr-model-label-`);
  const herdr: Herdr = { socket: `${dir}/herdr.sock`, received: [], dir, foreground: [process.pid] };
  let polls = 0;
  const server = net.createServer((conn) => {
    conn.on("data", (bytes) => {
      const message: unknown = JSON.parse(bytes.toString());
      herdr.received.push(message);
      const method = get(message, "method");
      if (method === "pane.get") {
        const agent = agents[Math.min(polls, agents.length - 1)];
        polls += 1;
        conn.end(`${JSON.stringify({ result: { pane: { pane_id: PANE, agent }, type: "pane_info" } })}\n`);
      } else if (method === "pane.process_info") {
        const foreground_processes = herdr.foreground.map((pid) => ({ pid, name: "pi" }));
        conn.end(`${JSON.stringify({ result: { process_info: { pane_id: PANE, foreground_processes }, type: "pane_process_info" } })}\n`);
      } else {
        conn.end('{"result":{"type":"ok"}}\n');
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(herdr.socket, resolve));
  try {
    await run(herdr);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  }
}

export const methods = (received: readonly unknown[]): unknown[] => received.map((m) => get(m, "method"));
