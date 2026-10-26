import { afterAll, afterEach, beforeAll, describe, expect, setSystemTime, test } from "bun:test";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { Image, type ImageProtocol, resetCapabilitiesCache, setCapabilities, stripTerminalSequences, truncateToWidth, type TuiMouseEvent, visibleWidth } from "@earendil-works/pi-tui";
import { assistantPiece, decorate, ledgerOf, patchRender, type Patchable, type RuleTheme, TOOL_INDENT, toolPiece } from "../../harness/pi/extensions/transcript-style/turn-rules";
import { EMPTY_LEDGER, type Ledger } from "../../harness/pi/extensions/transcript-style/turns";

const plain: RuleTheme = { fg: (_color, text) => text, bold: (text) => text };
const tagged: RuleTheme = { fg: (color, text) => `<${color}>${text}</${color}>`, bold: (text) => `*${text}*` };

const usage = { input: 6, output: 43, cacheRead: 2091, cacheWrite: 133, reasoning: undefined, cost: 0 };
const WIDTH = 80;

const shown = (line: string): string => stripTerminalSequences(line).trimEnd();

const rows =
  (...lines: string[]) =>
  (width: number): string[] =>
    lines.map((line) => line.padEnd(width));

const NOW = new Date(2026, 9, 7, 15, 0).getTime();
const NOON = new Date(2026, 9, 7, 12, 0).getTime();

describe("a turn's rule", () => {
  beforeAll(() => {
    setSystemTime(NOW);
  });

  afterAll(() => {
    setSystemTime();
  });

  test("opens the turn with its number and the call's figures across the full width", () => {
    const { lines, top, left } = decorate({ kind: "turn", turn: { number: 4, usage }, streaming: false, timestamp: NOON }, rows(" Thinking..."), WIDTH, plain);
    expect(lines[0]).toBe("");
    expect(lines[1]).toMatch(/^── turn 4 ─+ in 2\.2k · out 43 · R2\.1k W133 · 12:00 ──$/);
    expect(visibleWidth(lines[1] ?? "")).toBe(WIDTH);
    expect(lines[2]?.trimEnd()).toBe(" Thinking...");
    expect([top, left]).toEqual([2, 0]);
  });

  test("paints the number in the accent and the rule in the muted border", () => {
    const [, rule = ""] = decorate({ kind: "turn", turn: { number: 4, usage }, streaming: false, timestamp: NOON }, rows(), 400, tagged).lines;
    expect(rule).toStartWith("<borderMuted>── </borderMuted>*<accent>turn 4</accent>*");
    expect(rule).toContain("<muted>in 2.2k</muted>");
    expect(rule).toContain("<dim>R2.1k W133</dim>");
  });

  test("shows an ellipsis while the call streams and only the time for a call that reported no usage", () => {
    const streaming = decorate({ kind: "turn", turn: { number: 5, usage: undefined }, streaming: true, timestamp: NOON }, rows(), WIDTH, plain).lines[1];
    expect(streaming).toMatch(/^── turn 5 ─+ … · 12:00 ──$/);
    const silent = decorate({ kind: "turn", turn: { number: 5, usage: undefined }, streaming: false, timestamp: NOON }, rows(), WIDTH, plain).lines[1];
    expect(silent).toMatch(/^── turn 5 ─+ 12:00 ──$/);
  });

  test("keeps the whole dated time when heavy figures overflow the row", () => {
    const heavy = { ...usage, reasoning: 128, cost: 0.05 };
    const yesterday = new Date(2026, 9, 6, 8, 0).getTime();
    const [, rule = ""] = decorate({ kind: "turn", turn: { number: 4, usage: heavy }, streaming: false, timestamp: yesterday }, rows(), WIDTH, plain).lines;
    expect(shown(rule)).toMatch(/^── turn 4 ── in 2\.2k · out 43 \(128 thinking\) · .*… 2026-10-06 08:00 ──$/);
    expect(visibleWidth(rule)).toBe(WIDTH);
  });
});

describe("a tool's figure", () => {
  const tool = rows("", "", "$ ls -la", "", "✓ 5 lines · click to expand", "");

  test("sits right-aligned on the result's summary row, with the tool indented and pi's padding trimmed", () => {
    const { lines, top, left } = decorate({ kind: "tool", tokens: { basis: "measured", tokens: 142 } }, tool, WIDTH, plain);
    expect(lines.map(shown)).toEqual(["", "  $ ls -la", "", expect.stringMatching(/^ {2}✓ 5 lines · click to expand +\+142 tok$/)]);
    expect(visibleWidth(lines[3] ?? "")).toBe(WIDTH);
    expect([top, left]).toEqual([-1, TOOL_INDENT]);
  });

  test("marks an estimate and paints a heavy result as a warning", () => {
    const estimate = decorate({ kind: "tool", tokens: { basis: "estimated", tokens: 52 } }, tool, WIDTH, plain).lines.at(-1);
    expect(estimate).toEndWith("≈52 tok");
    const heavy = decorate({ kind: "tool", tokens: { basis: "measured", tokens: 19_000 } }, tool, WIDTH, tagged).lines.at(-1);
    expect(heavy).toEndWith("<warning>+19k tok</warning>");
    const light = decorate({ kind: "tool", tokens: { basis: "measured", tokens: 9_000 } }, tool, WIDTH, tagged).lines.at(-1);
    expect(light).toEndWith("<dim>+9.0k tok</dim>");
  });

  test("gets a row of its own rather than cutting off a full summary row", () => {
    const full = "x".repeat(WIDTH - TOOL_INDENT - 3);
    const { lines } = decorate({ kind: "tool", tokens: { basis: "measured", tokens: 317 } }, rows("", "$ cmd", full), WIDTH, plain);
    expect(lines.map(shown)).toEqual(["", "  $ cmd", `  ${full}`, expect.stringMatching(/^ {2} +\+317 tok$/)]);
  });

  test.each([10, 4, 2, 1])("keeps every row within a %d-column terminal", (width) => {
    for (const tokens of [{ basis: "measured", tokens: 142 }, { basis: "estimated", tokens: 52 }] as const) {
      const fitted = (inner: number) => tool(inner).map((line) => truncateToWidth(line, Math.max(0, inner), ""));
      const { lines } = decorate({ kind: "tool", tokens }, fitted, width, plain);
      expect(lines.filter((line) => visibleWidth(line) > width)).toEqual([]);
    }
  });

  test("leaves the rows alone when the ledger has no figure yet", () => {
    const { lines } = decorate({ kind: "tool", tokens: undefined }, tool, WIDTH, plain);
    expect(lines.map(shown)).toEqual(["", "  $ ls -la", "", "  ✓ 5 lines · click to expand"]);
  });

  describe("below an image pi draws after the result", () => {
    afterEach(resetCapabilitiesCache);

    function withPicture(images: ImageProtocol) {
      setCapabilities({ images, trueColor: true, hyperlinks: false });
      const image = new Image("AAAA", "image/png", { fallbackColor: (text) => text }, {}, { widthPx: 200, heightPx: 400 });
      const picture = image.render(WIDTH - TOOL_INDENT);
      const render = (width: number): string[] => [...rows("", "$ read shot.png", "", "✓ 1 image")(width), "", ...image.render(width)];
      return { picture, render };
    }

    test.each<ImageProtocol>(["kitty", "iterm2"])("keeps every row a %s image reserves, then the figure", (images) => {
      const { picture, render } = withPicture(images);
      expect(picture.length).toBeGreaterThan(1);
      const { lines } = decorate({ kind: "tool", tokens: { basis: "measured", tokens: 142 } }, render, WIDTH, plain);
      expect(lines.slice(-picture.length - 1, -1)).toEqual(picture.map((line) => " ".repeat(TOOL_INDENT) + line));
      expect(shown(lines.at(-1) ?? "")).toMatch(/^ {2} +\+142 tok$/);
    });
  });
});

type Clicked = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

const click = (x: number, y: number, width = WIDTH, height = 10): TuiMouseEvent => ({
  type: "click",
  button: "left",
  x,
  y,
  screenX: x,
  screenY: y,
  width,
  height,
  shift: false,
  alt: false,
  ctrl: false,
});

describe("patchRender", () => {
  function component() {
    const clicks: Clicked[] = [];
    const base: Patchable = {
      render: (width) => ["a", "b", "c"].map((line) => line.padEnd(width)),
      handleMouse: ({ x, y, width, height }) => {
        clicks.push({ x, y, width, height });
        return { handled: true };
      },
    };
    const proto: Patchable = Object.create(base);
    return { base, proto, clicks };
  }

  const shifted = (_component: object, render: (width: number) => string[], width: number) => ({ lines: ["", "rule", ...render(width - 2).map((line) => `  ${line}`)], top: 2, left: 2 });

  test("decorates the render and maps a click back into pi's own rows, columns and height", () => {
    const { proto, clicks } = component();
    patchRender(proto, shifted);
    const lines = proto.render.call(proto, WIDTH);
    expect(lines.length).toBe(5);
    expect(proto.handleMouse?.call(proto, click(5, 3, WIDTH, lines.length))).toEqual({ handled: true });
    expect(clicks).toEqual([{ x: 3, y: 1, width: WIDTH - 2, height: 3 }]);
  });

  test("drops a click on a row or column pi did not draw", () => {
    const { proto, clicks } = component();
    patchRender(proto, shifted);
    proto.render.call(proto, WIDTH);
    expect([proto.handleMouse?.call(proto, click(5, 1)), proto.handleMouse?.call(proto, click(1, 3))]).toEqual([undefined, undefined]);
    expect(clicks).toEqual([]);
  });

  test("leaves pi's render and click alone when there is nothing to decorate", () => {
    const { proto, clicks } = component();
    patchRender(proto, () => undefined);
    expect(proto.render.call(proto, 3)).toEqual(["a  ", "b  ", "c  "]);
    proto.handleMouse?.call(proto, click(1, 1, 3, 3));
    expect(clicks).toEqual([{ x: 1, y: 1, width: 3, height: 3 }]);
  });

  test("wraps pi's own methods again on reload and restores them on shutdown", () => {
    const { base, proto } = component();
    patchRender(proto, shifted);
    const restore = patchRender(proto, shifted);
    expect(proto.render.call(proto, WIDTH).length).toBe(5);
    restore();
    expect(proto.render).toBe(base.render);
    expect(Object.prototype.hasOwnProperty.call(proto, "handleMouse")).toBe(false);
  });
});

describe("pieces", () => {
  const ledger: Ledger = { turns: 3, turnsByTimestamp: new Map([[7, { number: 3, usage }]]), tools: new Map([["t1", { basis: "measured", tokens: 9 }]]) };

  test("a reply is its ledger turn, or the next number while it streams", () => {
    expect(assistantPiece({ lastMessage: { timestamp: 7 }, isStreaming: false }, ledger)).toEqual({ kind: "turn", turn: { number: 3, usage }, streaming: false, timestamp: 7 });
    expect(assistantPiece({ lastMessage: { timestamp: 8 }, isStreaming: true }, ledger)).toEqual({ kind: "turn", turn: { number: 4, usage: undefined }, streaming: true, timestamp: 8 });
    expect(assistantPiece({ lastMessage: { timestamp: 8 }, isStreaming: false }, ledger)?.turn).toBeUndefined();
  });

  test("a component of another shape is left to pi", () => {
    expect(assistantPiece({ lastMessage: undefined, isStreaming: false }, ledger)).toBeUndefined();
    expect(assistantPiece({ lastMessage: { timestamp: "7" }, isStreaming: false }, ledger)).toBeUndefined();
    expect(toolPiece({ toolCallId: 1 }, ledger)).toBeUndefined();
    expect(toolPiece({ toolCallId: "t1" }, ledger)).toEqual({ kind: "tool", tokens: { basis: "measured", tokens: 9 } });
  });
});

describe("ledgerOf", () => {
  test("rebuilds only when the session leaf moves", () => {
    let leaf = "a";
    let reads = 0;
    const session = {
      getLeafId: () => leaf,
      getBranch: (): SessionEntry[] => {
        reads += 1;
        return [];
      },
    };
    const ledger = ledgerOf(session);
    ledger();
    ledger();
    leaf = "b";
    ledger();
    expect(reads).toBe(2);
    expect(ledgerOf(undefined)()).toBe(EMPTY_LEDGER);
  });
});
