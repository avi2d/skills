import { beforeAll, describe, expect, setSystemTime, test } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import { type ExtensionAPI, initTheme, UserMessageComponent } from "@earendil-works/pi-coding-agent";
import type { TuiMouseEvent } from "@earendil-works/pi-tui";
import { moreLines } from "../../harness/pi/extensions/transcript-style/fold";
import { foldRows, foldUserMessages, MESSAGE_FOLD_ROWS, MESSAGE_PREVIEW_ROWS, type MessageLook, type Patchable, patchUserMessages, type Pi, type SessionUi } from "../../harness/pi/extensions/transcript-style/user-message";
import { theme } from "../lib/pi-ui";
import { clockReads, nextFrame } from "../lib/spinner-frame";

beforeAll(() => initTheme("dark", false));

const WIDTH = 80;
const ZONE_START = "\x1b]133;A\x07";
const ZONE_END = "\x1b]133;B\x07\x1b]133;C\x07";

const WHOLE = 60 + 2;
const FOLDED = MESSAGE_PREVIEW_ROWS + 3;
const clickOn = (component: UserMessageComponent, at: TuiMouseEvent): unknown => component.handleMouse(at);

const shown = (rows: readonly string[]): string[] => rows.map((row) => stripVTControlCharacters(row).trim());
const lines = (count: number): string => Array.from({ length: count }, (_, at) => `line ${at + 1}`).join("\n");

const lookWith = (overrides: Partial<MessageLook> = {}): MessageLook => ({
  openedByDefault: false,
  hint: (hidden) => theme.fg("dim", moreLines(hidden, "click")),
  band: (text) => theme.bg("userMessageBg", text),
  time: (text) => theme.bg("userMessageBg", theme.fg("dim", text)),
  ...overrides,
});

const event = (type: TuiMouseEvent["type"], button: TuiMouseEvent["button"] = "left"): TuiMouseEvent => ({
  type,
  button,
  x: 3,
  y: 2,
  screenX: 3,
  screenY: 2,
  width: WIDTH,
  height: 40,
  shift: false,
  alt: false,
  ctrl: false,
});

function patched(look: () => MessageLook | undefined = () => lookWith()) {
  class Probe extends UserMessageComponent {}
  const proto: Patchable = Probe.prototype;
  const restore = patchUserMessages(proto, look);
  return { proto, restore, message: (text: string) => new Probe(text) };
}

describe("foldRows", () => {
  const rows = (body: number): string[] => ["top", ...Array.from({ length: body }, (_, at) => `row ${at + 1}`), "bottom"];

  test("keeps a message of up to the threshold whole", () => {
    expect(foldRows(rows(MESSAGE_FOLD_ROWS), 1, () => ["hint"])).toEqual(rows(MESSAGE_FOLD_ROWS));
  });

  test("keeps the band's padding rows around the first rows and the hint", () => {
    const hidden: number[] = [];
    const folded = foldRows(rows(MESSAGE_FOLD_ROWS + 1), 1, (count) => {
      hidden.push(count);
      return ["hint"];
    });
    expect(folded).toEqual(["top", ...rows(MESSAGE_PREVIEW_ROWS).slice(1, -1), "hint", "bottom"]);
    expect(hidden).toEqual([MESSAGE_FOLD_ROWS + 1 - MESSAGE_PREVIEW_ROWS]);
  });
});

describe("a user message in pi's own component", () => {
  test("renders a short message exactly as pi does", () => {
    const { message } = patched();
    const text = lines(MESSAGE_FOLD_ROWS);
    expect(message(text).render(WIDTH)).toEqual(new UserMessageComponent(text).render(WIDTH));
  });

  test("folds a long message to its first rows and a dim count of the rest on the band", () => {
    const { message } = patched();
    const whole = new UserMessageComponent(lines(60)).render(WIDTH);
    const folded = message(lines(60)).render(WIDTH);
    expect(shown(folded)).toEqual(["", ...shown(whole).slice(1, 1 + MESSAGE_PREVIEW_ROWS), "… 52 more lines · click to expand", ""]);
    expect(folded.slice(0, 1 + MESSAGE_PREVIEW_ROWS)).toEqual(whole.slice(0, 1 + MESSAGE_PREVIEW_ROWS));
    expect(folded.at(-1)).toBe(whole.at(-1));
    expect(folded[0]).toStartWith(ZONE_START);
    expect(folded.at(-1)).toStartWith(ZONE_END);
    const hint = folded.at(-2) ?? "";
    expect(hint).toStartWith(theme.getBgAnsi("userMessageBg"));
    expect(hint).toContain(theme.fg("dim", "… 52 more lines · click to expand"));
    expect(stripVTControlCharacters(hint)).toHaveLength(WIDTH);
  });

  test("opens on a click and folds again on the next", () => {
    const { message } = patched();
    const component = message(lines(60));
    const whole = new UserMessageComponent(lines(60)).render(WIDTH);
    component.render(WIDTH);
    expect(clickOn(component, event("click"))).toEqual({ handled: true });
    expect(component.render(WIDTH)).toEqual(whole);
    expect(clickOn(component, event("click"))).toEqual({ handled: true });
    expect(component.render(WIDTH)).toHaveLength(FOLDED);
  });

  test("leaves a press, a drag, a right click and a short message's click to pi, so selection still starts", () => {
    const { message } = patched();
    const long = message(lines(60));
    long.render(WIDTH);
    expect([clickOn(long, event("press")), clickOn(long, event("drag")), clickOn(long, event("click", "right"))]).toEqual([undefined, undefined, undefined]);
    expect(long.render(WIDTH)).toHaveLength(FOLDED);
    const short = message("hi");
    short.render(WIDTH);
    expect(clickOn(short, event("click"))).toBeUndefined();
  });

  test("follows pi's expand key, and a message added after it takes the state the key set", () => {
    const state = { expanded: false };
    const { proto, message } = patched(() => lookWith({ openedByDefault: state.expanded }));
    const component = message(lines(60));
    proto.setExpanded?.call(component, true);
    expect(component.render(WIDTH)).toHaveLength(WHOLE);
    clickOn(component, event("click"));
    proto.setExpanded?.call(component, false);
    expect(component.render(WIDTH)).toHaveLength(FOLDED);
    state.expanded = true;
    expect(message(lines(60)).render(WIDTH)).toHaveLength(WHOLE);
  });

  test("names the hidden rows at the width it draws", () => {
    const { message } = patched();
    const text = `${lines(MESSAGE_FOLD_ROWS)}\n${"word ".repeat(40)}`;
    const wrapped = new UserMessageComponent(text).render(40).length - 2;
    expect(wrapped).toBeGreaterThan(MESSAGE_FOLD_ROWS + 1);
    expect(shown(message(text).render(40)).at(-2)).toBe(`… ${wrapped - MESSAGE_PREVIEW_ROWS} more lines · click to expand`);
  });

  test("leaves the message whole without a session's look", () => {
    const { message } = patched(() => undefined);
    expect(message(lines(60)).render(WIDTH)).toEqual(new UserMessageComponent(lines(60)).render(WIDTH));
  });
});

const SENT = new Date(2026, 9, 7, 12, 0).getTime();

describe("a message whose look pi's session holds steady", () => {
  function steady(stamp?: number) {
    const look = lookWith();
    class Probe extends UserMessageComponent {}
    const proto: Patchable = Probe.prototype;
    patchUserMessages(
      proto,
      () => look,
      () => stamp,
    );
    return (text: string) => new Probe(text);
  }

  test("stays folded after a click and open after the next", () => {
    const component = steady()(lines(60));
    expect(component.render(WIDTH)).toHaveLength(FOLDED);
    clickOn(component, event("click"));
    expect(component.render(WIDTH)).toHaveLength(WHOLE);
    clickOn(component, event("click"));
    expect(component.render(WIDTH)).toHaveLength(FOLDED);
  });

  test("serves the rows of the old width after the terminal is resized", () => {
    const message = steady(SENT);
    const text = `${lines(MESSAGE_FOLD_ROWS)}\n${"word ".repeat(40)}`;
    const resized = message(text);
    resized.render(WIDTH);
    expect(resized.render(40)).toEqual(message(text).render(40));
  });

  test("serves a bare clock time after the clock rolled past midnight", () => {
    const component = steady(SENT)(lines(60));
    setSystemTime(SENT);
    try {
      expect(shown(component.render(WIDTH)).at(-1)).toBe("12:00");
      setSystemTime(SENT + 24 * 60 * 60 * 1000);
      expect(shown(component.render(WIDTH)).at(-1)).toBe("2026-10-07 12:00");
    } finally {
      setSystemTime();
    }
  });
});

describe("a spinner frame over messages that did not change", () => {
  function conversation(messages: number) {
    const work = { painted: 0 };
    const paint = (text: string): string => {
      work.painted += 1;
      return text;
    };
    const look: MessageLook = { openedByDefault: false, hint: (hidden) => paint(moreLines(hidden, "click")), band: paint, time: paint };
    class Probe extends UserMessageComponent {}
    const proto: Patchable = Probe.prototype;
    patchUserMessages(
      proto,
      () => look,
      () => SENT,
    );
    const components = Array.from({ length: messages }, () => new Probe(lines(60)));
    return async (): Promise<{ readonly painted: number; readonly clock: number }> => {
      work.painted = 0;
      const clock = clockReads(() => components.map((component) => component.render(WIDTH)));
      await nextFrame();
      return { painted: work.painted, clock };
    };
  }

  test("paints every message's hint and time again on a frame that changed nothing", async () => {
    const frame = conversation(30);
    expect((await frame()).painted).toBeGreaterThan(0);
    expect((await frame()).painted).toBe(0);
  });

  test("reads the clock once per message, so a frame costs more as the conversation grows", async () => {
    const short = conversation(3);
    const long = conversation(30);
    await short();
    await long();
    expect((await long()).clock).toBe((await short()).clock);
  });
});

describe("patchUserMessages", () => {
  test("wraps pi's own methods again on reload and restores them on shutdown", () => {
    class Probe extends UserMessageComponent {}
    const proto: Patchable = Probe.prototype;
    const original = proto.render;
    patchUserMessages(proto, () => lookWith());
    const restore = patchUserMessages(proto, () => lookWith());
    expect(new Probe(lines(60)).render(WIDTH)).toHaveLength(FOLDED);
    restore();
    expect(proto.render).toBe(original);
    expect(Object.prototype.hasOwnProperty.call(proto, "handleMouse")).toBe(false);
    expect("setExpanded" in proto).toBe(false);
    expect(new Probe(lines(60)).render(WIDTH)).toHaveLength(WHOLE);
  });
});

describe("foldUserMessages", () => {
  type Ctx = { readonly mode: string; readonly ui: SessionUi };
  type Handler = (event: unknown, ctx: Ctx) => void;

  test("pi's own API is what it takes", () => {
    const takes = (pi: ExtensionAPI): Pi => pi;
    expect(typeof takes).toBe("function");
  });

  function session(gesture: () => string, toolsExpanded: () => boolean = () => false) {
    const handlers = new Map<string, Handler[]>();
    const pi: Pi = {
      on: (name: string, handler: Handler): void => {
        handlers.set(name, [...(handlers.get(name) ?? []), handler]);
      },
    };
    const tui: Ctx = { mode: "tui", ui: { theme, getToolsExpanded: toolsExpanded } };
    const fire = (name: string): void => {
      for (const handler of handlers.get(name) ?? []) handler({}, tui);
    };
    foldUserMessages(pi, gesture);
    return { start: () => fire("session_start"), shutdown: () => fire("session_shutdown") };
  }

  test("folds pi's user messages for the session with the gesture it is given, and stops at shutdown", () => {
    const { start, shutdown } = session(() => "ctrl+o");
    try {
      start();
      expect(shown(new UserMessageComponent(lines(60)).render(WIDTH)).at(-2)).toBe("… 52 more lines · ctrl+o to expand");
    } finally {
      shutdown();
    }
    expect(new UserMessageComponent(lines(60)).render(WIDTH)).toHaveLength(WHOLE);
  });

  test("names the old gesture and stays folded after pi moved the gesture and opened every block", async () => {
    const pi = { gesture: "ctrl+o", expanded: false };
    const { start, shutdown } = session(
      () => pi.gesture,
      () => pi.expanded,
    );
    try {
      start();
      const component = new UserMessageComponent(lines(60));
      component.render(WIDTH);
      await nextFrame();
      pi.gesture = "click";
      expect(shown(component.render(WIDTH)).at(-2)).toBe("… 52 more lines · click to expand");
      await nextFrame();
      pi.expanded = true;
      expect(component.render(WIDTH)).toHaveLength(WHOLE);
    } finally {
      shutdown();
    }
  });

  test("asks pi for the gesture and the expand state once per message, so a frame costs more as the conversation grows", async () => {
    const asked = { gesture: 0, expanded: 0 };
    const { start, shutdown } = session(
      () => {
        asked.gesture += 1;
        return "ctrl+o";
      },
      () => {
        asked.expanded += 1;
        return false;
      },
    );
    try {
      start();
      const frame = async (messages: readonly UserMessageComponent[]): Promise<typeof asked> => {
        Object.assign(asked, { gesture: 0, expanded: 0 });
        for (const message of messages) message.render(WIDTH);
        const spent = { ...asked };
        await nextFrame();
        return spent;
      };
      const conversation = (messages: number): UserMessageComponent[] => Array.from({ length: messages }, () => new UserMessageComponent(lines(60)));
      expect(await frame(conversation(30))).toEqual(await frame(conversation(3)));
    } finally {
      shutdown();
    }
  });
});
