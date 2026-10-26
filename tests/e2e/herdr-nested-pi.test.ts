import { expect, test } from "bun:test";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { fakeHerdr, get, PANE, type Herdr } from "./lib/fake-herdr";

const SESSION = join(import.meta.dir, "..", "fixtures", "herdr-pi-session.ts");

const reports = (received: readonly unknown[]) => received.filter((m) => get(m, "method") === "pane.report_metadata").map((m) => get(m, "params"));

// herdr keeps a report from a source only when its seq is above the last one it kept from that source for the pane.
function paneRow(received: readonly unknown[]) {
  let last = -1;
  let displayAgent: unknown;
  const tokens = new Map<string, unknown>();
  for (const params of reports(received)) {
    const seq = Number(get(params, "seq"));
    if (seq <= last) continue;
    last = seq;
    displayAgent = get(params, "display_agent") ?? displayAgent;
    for (const [name, value] of Object.entries(get(params, "tokens") ?? {})) {
      if (value === null) tokens.delete(name);
      else tokens.set(name, value);
    }
  }
  return { displayAgent, tokens: Object.fromEntries(tokens) };
}

async function until(done: () => boolean) {
  for (let attempt = 0; attempt < 200 && !done(); attempt += 1) await Bun.sleep(25);
  expect(done()).toBe(true);
}

type Model = readonly [provider: string, id: string, contextWindow: string];

function piSession(herdr: Herdr, model: Model) {
  const proc = Bun.spawn([process.execPath, SESSION, ...model], {
    env: { ...process.env, HERDR_ENV: "1", HERDR_SOCKET_PATH: herdr.socket, HERDR_PANE_ID: PANE, FM_TASK_ID: "", TMPDIR: herdr.dir },
    stdin: "pipe",
    stdout: "pipe",
  });
  const lines = createInterface({ input: Readable.fromWeb(proc.stdout) })[Symbol.asyncIterator]();
  return {
    pid: proc.pid,
    say: async (line: string) => {
      await proc.stdin.write(`${line}\n`);
      await proc.stdin.flush();
    },
    heard: async (expected: string) => expect((await lines.next()).value).toBe(expected),
    end: () => proc.kill(),
  };
}

test("a pi started inside the pane's own pi reports nothing for the pane, so the pane's own pi keeps its row", async () => {
  await fakeHerdr(["pi"], async (herdr) => {
    const sessions: ReturnType<typeof piSession>[] = [];
    const start = (model: Model) => {
      const session = piSession(herdr, model);
      sessions.push(session);
      return session;
    };
    try {
      const own = start(["fake", "fake-model", "200000"]);
      herdr.foreground = [own.pid];
      await own.heard("started");
      await until(() => reports(herdr.received).length === 1);

      const nested = start(["unknown", "unknown", "0"]);
      await nested.heard("started");
      await nested.say("stop");
      await nested.heard("stopped");

      await own.say("turn 5000");
      await own.heard("turned");
      await until(() => reports(herdr.received).some((params) => get(get(params, "tokens"), "ctx") === "5k/200k"));
      expect(paneRow(herdr.received)).toEqual({
        displayAgent: "pi · fake-model high",
        tokens: { model: "fake-model h", ctx: "5k/200k", elapsed: "0m" },
      });
    } finally {
      for (const session of sessions) session.end();
    }
  });
}, 20_000);
