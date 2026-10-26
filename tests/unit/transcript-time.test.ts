import { afterAll, beforeAll, describe, expect, setSystemTime, test } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import { initTheme, UserMessageComponent, type SessionEntry } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { theme } from "../../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js";
import { formatTime } from "../../harness/pi/extensions/transcript-style/time";
import { foldUserMessages, type Pi, type Session, type SessionCtx, shownUserText, stampBook, userStamps, userTextOf } from "../../harness/pi/extensions/transcript-style/user-message";

const NOW = new Date(2026, 9, 7, 15, 0).getTime();

beforeAll(() => {
  initTheme("dark", false);
  setSystemTime(NOW);
});

afterAll(() => {
  setSystemTime();
});

const WIDTH = 80;

const atClock = (dayOffset: number, hours: number, minutes: number): number => {
  const at = new Date(NOW);
  at.setDate(at.getDate() + dayOffset);
  at.setHours(hours, minutes, 0, 0);
  return at.getTime();
};

const dateOf = (timestamp: number): string => {
  const at = new Date(timestamp);
  const two = (value: number): string => `${value}`.padStart(2, "0");
  return `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())}`;
};

describe("formatTime", () => {
  test("shows hours and minutes for a message from today", () => {
    expect(formatTime(atClock(0, 9, 5), NOW)).toBe("09:05");
    expect(formatTime(atClock(0, 14, 32), NOW)).toBe("14:32");
  });

  test("adds the date for a message from another day", () => {
    const yesterday = atClock(-1, 14, 32);
    expect(formatTime(yesterday, NOW)).toBe(`${dateOf(yesterday)} 14:32`);
  });

  test("treats either side of midnight as another day", () => {
    const late = atClock(0, 0, 1);
    const justBefore = late - 2 * 60 * 1000;
    expect(formatTime(justBefore, late)).toBe(`${dateOf(justBefore)} 23:59`);
    expect(formatTime(late, late)).toBe("00:01");
  });
});

type Message = Extract<SessionEntry, { readonly type: "message" }>["message"];

let sequence = 0;

const entry = (message: Message): SessionEntry => ({
  id: `e${(sequence += 1)}`,
  parentId: null,
  timestamp: new Date(NOW).toISOString(),
  type: "message",
  message,
});

const userEntry = (text: string, timestamp: number): SessionEntry => entry({ role: "user", content: text, timestamp });

const skillText = (typed: string): string => `<skill name="review" location="/skills/review/SKILL.md">\nReview the change.\n</skill>${typed ? `\n\n${typed}` : ""}`;

describe("userTextOf", () => {
  test("reads a string and joins the text blocks", () => {
    expect(userTextOf("hello")).toBe("hello");
    expect(userTextOf([{ type: "text", text: "a" }, { type: "image", data: "x" }, { type: "text", text: "b" }])).toBe("ab");
  });

  test("reads nothing useful as undefined or empty", () => {
    expect(userTextOf(undefined)).toBeUndefined();
    expect(userTextOf([{ type: "image", data: "x" }])).toBe("");
  });
});

describe("shownUserText", () => {
  test("is the text pi draws in the user component", () => {
    expect(shownUserText("hello")).toBe("hello");
    expect(shownUserText(skillText("check main"))).toBe("check main");
  });

  test("is nothing when pi draws no user component", () => {
    expect(shownUserText(skillText(""))).toBeUndefined();
    expect(shownUserText([{ type: "image", data: "x" }])).toBeUndefined();
  });
});

describe("userStamps", () => {
  test("keeps the branch's user messages in order with their stored times", () => {
    const branch: SessionEntry[] = [userEntry("first", 7), userEntry("second", 9)];
    expect(userStamps(branch)).toEqual([
      { text: "first", timestamp: 7 },
      { text: "second", timestamp: 9 },
    ]);
  });

  test("skips entries that are not user messages", () => {
    const branch: SessionEntry[] = [
      { id: "c1", parentId: null, timestamp: new Date(NOW).toISOString(), type: "compaction", summary: "s", firstKeptEntryId: "e1", tokensBefore: 0 },
      userEntry("kept", 3),
    ];
    expect(userStamps(branch)).toEqual([{ text: "kept", timestamp: 3 }]);
  });

  test("stamps a skill invocation by the words typed after it and skips one with none", () => {
    expect(userStamps([userEntry(skillText("check main"), 4), userEntry(skillText(""), 5)])).toEqual([{ text: "check main", timestamp: 4 }]);
  });
});

describe("stampBook", () => {
  const session = (leaf: string | null, entries: SessionEntry[]): Session => ({ getLeafId: () => leaf, buildContextEntries: () => entries });

  test("hands each component the next stamp for its text", () => {
    const book = stampBook();
    book.refresh(session("l1", [userEntry("go", 1), userEntry("go", 2)]));
    expect(book.take({}, "go")).toBe(1);
    expect(book.take({}, "go")).toBe(2);
    expect(book.take({}, "go")).toBe(1);
  });

  test("keeps a component's stamp across renders", () => {
    const book = stampBook();
    book.refresh(session("l1", [userEntry("go", 1)]));
    const component = {};
    expect(book.take(component, "go")).toBe(1);
    expect(book.take(component, "go")).toBe(1);
  });

  test("renders nothing for a text the branch never held", () => {
    const book = stampBook();
    book.refresh(session("l1", [userEntry("go", 1)]));
    expect(book.take({}, "missing")).toBeUndefined();
  });

  test("waits while the message is still in flight, then takes its stamp", () => {
    const book = stampBook();
    book.refresh(session("l1", [userEntry("go", 1)]));
    expect(book.take({}, "go")).toBe(1);
    book.arrive("go");
    expect(book.take({}, "go")).toBeUndefined();
    book.refresh(session("l2", [userEntry("go", 1), userEntry("go", 2)]));
    expect(book.take({}, "go")).toBe(2);
    book.settle("go");
  });

  test("reads the entries pi shows, so a compacted branch keeps the retained message's time", () => {
    const early = userEntry("go", atClock(0, 9, 0));
    const late = userEntry("go", atClock(0, 14, 0));
    const compacted = { getLeafId: () => "l1", getBranch: () => [early, late], buildContextEntries: () => [late] };
    const book = stampBook();
    book.refresh(compacted);
    expect(book.take({}, "go")).toBe(atClock(0, 14, 0));
  });

  test("keeps every claim when a message is appended", () => {
    const book = stampBook();
    const first = {};
    book.refresh(session("l1", [userEntry("go", 1)]));
    expect(book.take(first, "go")).toBe(1);
    book.refresh(session("l2", [userEntry("go", 1), userEntry("go", 2)]));
    expect(book.take({}, "go")).toBe(2);
    expect(book.take(first, "go")).toBe(1);
  });

  test("hands out the stamps again in order after a switch to another branch", () => {
    const book = stampBook();
    const shared = userEntry("go", 1);
    book.refresh(session("l1", [shared, userEntry("go", 2)]));
    expect([book.take({}, "go"), book.take({}, "go")]).toEqual([1, 2]);
    book.refresh(session("l2", [shared, userEntry("go", 3)]));
    expect([book.take({}, "go"), book.take({}, "go")]).toEqual([1, 3]);
  });

  test("forgets everything on reset", () => {
    const book = stampBook();
    book.refresh(session("l1", [userEntry("go", 1)]));
    book.reset();
    expect(book.take({}, "go")).toBeUndefined();
  });

  test("reads the entries again only when the leaf moves", () => {
    let reads = 0;
    const entries: SessionEntry[] = [userEntry("go", 1)];
    const counting: Session = { getLeafId: () => "l1", buildContextEntries: () => (reads += 1, entries) };
    const book = stampBook();
    book.refresh(counting);
    book.refresh(counting);
    expect(reads).toBe(1);
  });
});

type Handler = (event: unknown, ctx: SessionCtx) => void;

const tui = (sessionManager: Session): SessionCtx => ({ mode: "tui", ui: { theme, getToolsExpanded: () => false }, sessionManager });

describe("a user message's time", () => {
  const wired = (entries: SessionEntry[], leafOf: () => string | null): ((name: string, event?: unknown) => void) => {
    const handlers = new Map<string, Handler[]>();
    const pi: Pi = {
      on: (name: string, handler: Handler): void => {
        handlers.set(name, [...(handlers.get(name) ?? []), handler]);
      },
    };
    const ctx = tui({ getLeafId: () => leafOf(), buildContextEntries: () => entries });
    const fire = (name: string, event: unknown = {}): void => {
      for (const handler of handlers.get(name) ?? []) handler(event, ctx);
    };
    foldUserMessages(pi, () => "click");
    fire("session_start");
    return fire;
  };

  test("sits dim and right-aligned on the message's last row without widening it", () => {
    const stamp = atClock(0, 14, 32);
    const fire = wired([userEntry("hello", stamp)], () => "l1");
    try {
      const rows = new UserMessageComponent("hello").render(WIDTH);
      const last = stripVTControlCharacters(rows.at(-1) ?? "");
      expect(last).toContain("14:32");
      expect(last.trimStart()).toStartWith("14:32");
      expect(rows.map((row) => visibleWidth(row))).toEqual(rows.map(() => WIDTH));
    } finally {
      fire("session_shutdown");
    }
  });

  test("adds the date when the message is from another day", () => {
    const stamp = atClock(-1, 9, 5);
    const fire = wired([userEntry("hello", stamp)], () => "l1");
    try {
      const rows = new UserMessageComponent("hello").render(WIDTH);
      expect(stripVTControlCharacters(rows.at(-1) ?? "")).toContain(`${dateOf(stamp)} 09:05`);
    } finally {
      fire("session_shutdown");
    }
  });

  test("renders nothing when the branch holds no time for the text", () => {
    const fire = wired([userEntry("other", atClock(0, 10, 0))], () => "l1");
    try {
      const rows = new UserMessageComponent("hello").render(WIDTH);
      expect(stripVTControlCharacters(rows.at(-1) ?? "")).not.toContain("10:00");
      expect(rows).toEqual(new UserMessageComponent("hello").render(WIDTH));
    } finally {
      fire("session_shutdown");
    }
  });

  test("a live message waits for its entry, then shows its stored time", () => {
    const branch: SessionEntry[] = [];
    let leaf: string | null = "l0";
    const stamp = atClock(0, 14, 32);
    const fire = wired(branch, () => leaf);
    try {
      fire("message_start", { message: { role: "user", content: "hello" } });
      const before = new UserMessageComponent("hello").render(WIDTH);
      expect(stripVTControlCharacters(before.at(-1) ?? "")).not.toContain("14:32");
      branch.push(userEntry("hello", stamp));
      leaf = "l1";
      fire("message_end", { message: { role: "user", content: "hello" } });
      const after = new UserMessageComponent("hello").render(WIDTH);
      expect(stripVTControlCharacters(after.at(-1) ?? "")).toContain("14:32");
    } finally {
      fire("session_shutdown");
    }
  });

  test("each message keeps its own time after a tree jump back and forth", () => {
    const early = userEntry("go", atClock(0, 9, 0));
    const late = userEntry("go", atClock(0, 14, 0));
    const entries: SessionEntry[] = [early, late];
    let leaf: string | null = "l2";
    const times = (count: number): string[] =>
      Array.from({ length: count }, () => stripVTControlCharacters(new UserMessageComponent("go").render(WIDTH).at(-1) ?? "").trim());
    const fire = wired(entries, () => leaf);
    try {
      expect(times(2)).toEqual(["09:00", "14:00"]);
      entries.splice(1);
      leaf = "l1";
      fire("session_tree");
      expect(times(1)).toEqual(["09:00"]);
      entries.push(late);
      leaf = "l2";
      fire("session_tree");
      expect(times(2)).toEqual(["09:00", "14:00"]);
    } finally {
      fire("session_shutdown");
    }
  });

  test("a live skill invocation waits under the words typed after it, then shows its stored time", () => {
    const entries: SessionEntry[] = [userEntry("check main", atClock(0, 9, 0))];
    let leaf: string | null = "l0";
    const typed = skillText("check main");
    const lastRow = (component: UserMessageComponent): string => stripVTControlCharacters(component.render(WIDTH).at(-1) ?? "");
    const fire = wired(entries, () => leaf);
    try {
      const earlier = new UserMessageComponent("check main");
      expect(lastRow(earlier)).toContain("09:00");
      fire("message_start", { message: { role: "user", content: typed } });
      const live = new UserMessageComponent("check main");
      expect(lastRow(live)).not.toContain(":");
      entries.push(userEntry(typed, atClock(0, 14, 32)));
      leaf = "l1";
      fire("message_end", { message: { role: "user", content: typed } });
      expect(lastRow(live)).toContain("14:32");
      expect(lastRow(earlier)).toContain("09:00");
    } finally {
      fire("session_shutdown");
    }
  });
});
