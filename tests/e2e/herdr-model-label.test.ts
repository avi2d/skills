import { describe, expect, test } from "bun:test";
import { deliverAsPaneAgent, metadataRequest, send, type Snapshot } from "../../harness/pi/extensions/herdr-model-label";
import { fakeHerdr, methods, PANE } from "./lib/fake-herdr";

const snapshot: Snapshot = { model: "m", provider: "fake", thinking: "high", usage: { tokens: 1000, contextWindow: 200_000 }, elapsedMs: 0 };
const request = metadataRequest(PANE, snapshot, 1);

describe("send", () => {
  test("delivers the request as one JSON line and resolves on the reply", async () => {
    await fakeHerdr(["pi"], async ({ socket, received }) => {
      expect(await send(socket, request)).toBe(true);
      expect(received).toEqual([request]);
    });
  });

  test("resolves false when nothing listens", async () => {
    await fakeHerdr(["pi"], async ({ dir }) => {
      expect(await send(`${dir}/absent.sock`, request)).toBe(false);
    });
  });
});

describe("deliverAsPaneAgent", () => {
  const poll = { attempts: 5, intervalMs: 1 };

  test("reports only once herdr has detected pi in the pane", async () => {
    await fakeHerdr([undefined, "codex", "pi"], async ({ socket, received }) => {
      await deliverAsPaneAgent({ socket, pane: PANE }, process.pid, poll)(request);
      expect(methods(received)).toEqual(["pane.process_info", "pane.get", "pane.get", "pane.get", "pane.report_metadata"]);
      expect(received.at(-1)).toEqual(request);
    });
  });

  test("reports nothing while herdr never detects pi", async () => {
    await fakeHerdr(["codex"], async ({ socket, received }) => {
      await deliverAsPaneAgent({ socket, pane: PANE }, process.pid, poll)(request);
      expect(methods(received)).toEqual(["pane.process_info", ...Array.from({ length: poll.attempts }, () => "pane.get")]);
    });
  });

  test("reports nothing from a process outside the pane's foreground job", async () => {
    await fakeHerdr(["pi"], async (herdr) => {
      herdr.foreground = [process.pid + 1];
      await deliverAsPaneAgent({ socket: herdr.socket, pane: PANE }, process.pid, poll)(request);
      expect(methods(herdr.received)).toEqual(["pane.process_info"]);
    });
  });
});
