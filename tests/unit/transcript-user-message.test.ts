import { beforeAll, describe, expect, test } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import { type ExtensionAPI, initTheme, UserMessageComponent } from "@earendil-works/pi-coding-agent";
import type { TuiMouseEvent } from "@earendil-works/pi-tui";
import { theme } from "../../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js";
import { moreLines } from "../../harness/pi/extensions/transcript-style/fold";
import { foldRows, foldUserMessages, MESSAGE_FOLD_ROWS, MESSAGE_PREVIEW_ROWS, type MessageLook, type Patchable, patchUserMessages, type Pi, type SessionUi } from "../../harness/pi/extensions/transcript-style/user-message";

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

  test("folds pi's user messages for the session with the gesture it is given, and stops at shutdown", () => {
    const handlers = new Map<string, Handler[]>();
    const pi: Pi = {
      on: (name: string, handler: Handler): void => {
        handlers.set(name, [...(handlers.get(name) ?? []), handler]);
      },
    };
    const fire = (name: string, ctx: Ctx): void => {
      for (const handler of handlers.get(name) ?? []) handler({}, ctx);
    };
    const tui: Ctx = { mode: "tui", ui: { theme, getToolsExpanded: () => false } };
    foldUserMessages(pi, () => "ctrl+o");
    try {
      fire("session_start", tui);
      expect(shown(new UserMessageComponent(lines(60)).render(WIDTH)).at(-2)).toBe("… 52 more lines · ctrl+o to expand");
    } finally {
      fire("session_shutdown", tui);
    }
    expect(new UserMessageComponent(lines(60)).render(WIDTH)).toHaveLength(WHOLE);
  });
});
