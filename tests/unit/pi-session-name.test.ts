import { describe, expect, test } from "bun:test";
import type { ExtensionAPI, SessionEntry } from "@earendil-works/pi-coding-agent";
import install, { nameOf, type Pi } from "../../harness/pi/extensions/session-name";

const sessionStart = "⁣FIRSTMATE_OP: v1 session-start: session digest";
const workerBrief = "⁣FIRSTMATE_OP: v1 launch-brief: # Current worker role contract\nwork on task; steering inbox /Users/someone/Projects/firstmate/state/pi-session-names.inbox";

describe("nameOf", () => {
  test("leaves the main session unnamed when the operational prefix starts the prompt", () => {
    expect(nameOf(`${sessionStart}\nOperational digest`)).toBeUndefined();
  });

  test("leaves the main session unnamed when its opening text precedes the appended prefix", () => {
    expect(nameOf(`Help me plan the release.\n\n${sessionStart}\nOperational digest`)).toBeUndefined();
  });

  test("names a worker session from the task inbox path", () => {
    expect(nameOf(workerBrief)).toBe("pi-session-names");
  });

  test("keeps first-line naming for every other session", () => {
    expect(nameOf("Fix the broken cache\nMore detail")).toBe("Fix the broken cache");
  });
});

const userEntry = (text: string): SessionEntry => ({
  type: "message",
  id: text,
  parentId: null,
  timestamp: "2026-10-04T00:00:00.000Z",
  message: { role: "user", content: text, timestamp: 0 },
});

const sessionStartEntry: SessionEntry = {
  type: "custom_message",
  id: "nudge",
  parentId: null,
  timestamp: "2026-10-04T00:00:00.000Z",
  customType: "firstmate-sessionstart-nudge",
  content: `${sessionStart}\nOperational digest`,
  display: false,
};

type Ctx = { readonly mode: string; readonly sessionManager: { getBranch(): readonly SessionEntry[] } };
type Handler = (event: { readonly prompt: string }, ctx: Ctx) => void;

// Drives pi's order: session_start, then before_agent_start, then the prompt and the messages it returned reach the branch, then context.
function prompted(history: readonly SessionEntry[], persisted: string | undefined, prompt: string, returned: readonly SessionEntry[] = []) {
  const handlers = new Map<string, Handler>();
  const names: string[] = [];
  let current = persisted;
  const pi: Pi = {
    on: (event: string, handler: Handler) => handlers.set(event, handler),
    getSessionName: () => current,
    setSessionName: (name) => {
      names.push(name);
      current = name.trim() || undefined;
    },
  };
  install(pi);
  const branch = [...history];
  const ctx: Ctx = { mode: "tui", sessionManager: { getBranch: () => branch } };
  handlers.get("session_start")?.({ prompt: "" }, ctx);
  handlers.get("before_agent_start")?.({ prompt }, ctx);
  branch.push(userEntry(prompt), ...returned);
  handlers.get("context")?.({ prompt: "" }, ctx);
  return { name: current, names };
}

const resumed = (history: readonly SessionEntry[], persisted: string | undefined) => prompted(history, persisted, "What is next?");

test("pi's own API is what the extension takes", () => {
  const takes = (pi: ExtensionAPI): Pi => pi;
  expect(typeof takes).toBe("function");
});

describe("a resumed session", () => {
  test("clears the persisted name of a Firstmate main session", () => {
    const { name, names } = resumed([userEntry("Help me plan the release."), sessionStartEntry], "Help me plan the release.");
    expect(name).toBeUndefined();
    expect(names).toEqual([""]);
  });

  test("clears the name of a main session whose first prompt carries the appended prefix", () => {
    expect(resumed([userEntry(`Plan it.\n\n${sessionStart}\nOperational digest`)], "Plan it.").name).toBeUndefined();
  });

  test("renames a Firstmate worker to its task", () => {
    const { name, names } = resumed([userEntry(workerBrief)], "⁣FIRSTMATE_OP: v1 launch-brief: # Current worker role contr…");
    expect(name).toBe("pi-session-names");
    expect(names).toEqual(["pi-session-names"]);
  });

  test("writes nothing when the Firstmate name already holds", () => {
    expect(resumed([sessionStartEntry], undefined).names).toEqual([]);
  });

  test("keeps the persisted name of any other session", () => {
    const { name, names } = resumed([userEntry("Fix the broken cache")], "Renamed by hand");
    expect(name).toBe("Renamed by hand");
    expect(names).toEqual([]);
  });
});

describe("a fresh session", () => {
  test("leaves a Firstmate main session unnamed when the digest arrives as a separate message", () => {
    const { name, names } = prompted([], undefined, "Help me plan the release.", [sessionStartEntry]);
    expect(name).toBeUndefined();
    expect(names).toEqual([]);
  });

  test("names a Firstmate worker after its task", () => {
    const { name, names } = prompted([], undefined, workerBrief);
    expect(name).toBe("pi-session-names");
    expect(names).toEqual(["pi-session-names"]);
  });

  test("names any other session after its first prompt", () => {
    expect(prompted([], undefined, "Fix the broken cache\nMore detail").name).toBe("Fix the broken cache");
  });
});
