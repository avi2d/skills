import { AssistantMessageComponent, ToolExecutionComponent, type ExtensionAPI, type ExtensionContext, type Theme, type ThemeColor } from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences, truncateToWidth, type TuiMouseEvent, type TuiMouseEventResult, visibleWidth } from "@earendil-works/pi-tui";
import { formatTime } from "./time";
import { buildLedger, callFigures, EMPTY_LEDGER, HEAVY_TOOL_TOKENS, type Figure, type Ledger, toolFigure, type ToolTokens, type Turn, turnLabel } from "./turns";

export type TurnPiece = { readonly kind: "turn"; readonly turn: Turn | undefined; readonly streaming: boolean; readonly timestamp: number };
export type ToolPiece = { readonly kind: "tool"; readonly tokens: ToolTokens | undefined };
export type Piece = TurnPiece | ToolPiece;

export type RuleTheme = Pick<Theme, "fg" | "bold">;

// The rows added above and the columns added to the left of what pi drew, so a click still lands on pi's own row.
export type Decorated = { readonly lines: string[]; readonly top: number; readonly left: number };

export type Render = (width: number) => string[];

const IMAGE_PREFIXES = ["\x1b_G", "\x1b]1337;File="];

const isImage = (line: string): boolean => IMAGE_PREFIXES.some((prefix) => line.includes(prefix));

const isBlank = (line: string): boolean => !isImage(line) && stripTerminalSequences(line).trim() === "";

// An image reserves its height as blank rows, after a Kitty row and before an iTerm row, so the blanks beside an image stay.
function trimBlank(lines: readonly string[]): { readonly body: string[]; readonly dropped: number } {
  const first = lines.findIndex((line) => !isBlank(line));
  const last = lines.findLastIndex((line) => !isBlank(line));
  if (first === -1) return { body: [], dropped: lines.length };
  const start = isImage(lines[first] ?? "") ? 0 : first;
  const end = isImage(lines[last] ?? "") ? lines.length : last + 1;
  return { body: lines.slice(start, end), dropped: start };
}

// Pi pads a boxed row to the full width, and that padding would push the tail off the row.
const dropTrailingBlanks = (line: string): string => truncateToWidth(line, visibleWidth(stripTerminalSequences(line).trimEnd()), "");

function rightAlign(line: string, tail: string, width: number): string {
  const fitted = truncateToWidth(dropTrailingBlanks(line), Math.max(0, width - visibleWidth(tail) - 1), "…");
  return truncateToWidth(fitted + " ".repeat(Math.max(1, width - visibleWidth(fitted) - visibleWidth(tail))) + tail, width, "");
}

const fits = (line: string, tail: string, width: number): boolean => visibleWidth(dropTrailingBlanks(line)) + 1 + visibleWidth(tail) <= width;

const paintFigures = (figures: readonly Figure[], theme: RuleTheme): string =>
  figures.map(({ role, text }) => theme.fg(role === "lead" ? "muted" : "dim", text)).join(theme.fg("dim", " · "));

const toolColor = (tokens: number): ThemeColor => (tokens >= HEAVY_TOOL_TOKENS ? "warning" : "dim");

const toolTail = (tokens: ToolTokens | undefined, theme: RuleTheme): string => (tokens ? theme.fg(toolColor(tokens.tokens), `${toolFigure(tokens)} tok`) : "");

// The figure is what the result cost, so it sits on the result's last row, and gets a row of its own rather than cutting off text or an image.
function withToolTail(body: readonly string[], tail: string, width: number): string[] {
  if (!tail) return [...body];
  const last = body.at(-1);
  if (last === undefined || isBlank(last) || isImage(last) || !fits(last, tail, width)) return [...body, rightAlign("", tail, width)];
  return [...body.slice(0, -1), rightAlign(last, tail, width)];
}

function callLead({ turn, streaming }: TurnPiece, theme: RuleTheme): string {
  if (turn?.usage) return paintFigures(callFigures(turn.usage), theme);
  return streaming ? theme.fg("dim", "…") : "";
}

export const TOOL_INDENT = 2;

function ruleTool(tokens: ToolTokens | undefined, render: Render, width: number, theme: RuleTheme): Decorated {
  const indent = width > TOOL_INDENT ? TOOL_INDENT : 0;
  const inner = width - indent;
  const { body, dropped } = trimBlank(render(inner));
  const lines = withToolTail(body, toolTail(tokens, theme), inner).map((line) => " ".repeat(indent) + line);
  return { lines: ["", ...lines], top: 1 - dropped, left: indent };
}

// The clock takes its width first, so a narrow terminal shortens the rule and then the figures, never the time.
function ruleTurn(piece: TurnPiece, render: Render, width: number, theme: RuleTheme): Decorated {
  const head = `${theme.fg("borderMuted", "── ")}${theme.bold(theme.fg("accent", piece.turn ? turnLabel(piece.turn) : "turn"))} `;
  const lead = callLead(piece, theme);
  const figures = lead ? ` ${lead}${theme.fg("dim", " ·")}` : "";
  const clock = ` ${theme.fg("dim", formatTime(piece.timestamp))}${theme.fg("borderMuted", " ──")}`;
  const room = Math.max(0, width - visibleWidth(clock));
  const ruled = (fill: number): string => head + theme.fg("borderMuted", "─".repeat(fill)) + figures;
  const slack = Math.max(0, room - visibleWidth(ruled(2)));
  const rule = truncateToWidth(ruled(2 + slack), room, theme.fg("dim", "…"));
  return { lines: ["", truncateToWidth(rule + clock, width, ""), ...render(width)], top: 2, left: 0 };
}

export function decorate(piece: Piece, render: Render, width: number, theme: RuleTheme): Decorated {
  return piece.kind === "tool" ? ruleTool(piece.tokens, render, width, theme) : ruleTurn(piece, render, width, theme);
}

type AssistantInternals = { readonly lastMessage: { readonly timestamp: number } | undefined; readonly isStreaming: boolean };

function isAssistantInternals(component: object): component is AssistantInternals {
  if (!("lastMessage" in component && "isStreaming" in component)) return false;
  const { lastMessage, isStreaming } = component;
  if (typeof isStreaming !== "boolean") return false;
  return lastMessage === undefined || (typeof lastMessage === "object" && lastMessage !== null && "timestamp" in lastMessage && typeof lastMessage.timestamp === "number");
}

export function assistantPiece(component: object, ledger: Ledger): TurnPiece | undefined {
  if (!isAssistantInternals(component) || !component.lastMessage) return undefined;
  const known = ledger.turnsByTimestamp.get(component.lastMessage.timestamp);
  const streamed = component.isStreaming ? { number: ledger.turns + 1, usage: undefined } : undefined;
  return { kind: "turn", turn: known ?? streamed, streaming: component.isStreaming, timestamp: component.lastMessage.timestamp };
}

export function toolPiece(component: object, ledger: Ledger): ToolPiece | undefined {
  if (!("toolCallId" in component) || typeof component.toolCallId !== "string") return undefined;
  return { kind: "tool", tokens: ledger.tools.get(component.toolCallId) };
}

type MouseResult = TuiMouseEventResult | undefined;

export type Patchable = {
  render: (this: object, width: number) => string[];
  handleMouse?: (this: object, event: TuiMouseEvent) => MouseResult;
};

const RENDER = Symbol.for("skills.transcript-style.turn-rules.render");
const MOUSE = Symbol.for("skills.transcript-style.turn-rules.handleMouse");
const OWN_MOUSE = Symbol.for("skills.transcript-style.turn-rules.ownMouse");

type Originals = { [RENDER]?: Patchable["render"]; [MOUSE]?: Patchable["handleMouse"]; [OWN_MOUSE]?: boolean };

type Drawn = { readonly decorated: Decorated; readonly rows: number };

const LAST = new WeakMap<object, Drawn>();

// Pi re-imports an extension on reload while the prototype persists, so the wrapper always wraps Pi's own method.
export function patchRender(proto: Patchable & Originals, decorateOf: (component: object, render: Render, width: number) => Decorated | undefined): () => void {
  const ownMouse = proto[OWN_MOUSE] ?? Object.prototype.hasOwnProperty.call(proto, "handleMouse");
  const render = proto[RENDER] ?? proto.render;
  const mouse = proto[MOUSE] ?? proto.handleMouse;
  proto[RENDER] = render;
  proto[MOUSE] = mouse;
  proto[OWN_MOUSE] = ownMouse;
  const decorated = function (this: object, width: number): string[] {
    let rows = 0;
    const drawn = (inner: number): string[] => {
      const lines = render.call(this, inner);
      rows = lines.length;
      return lines;
    };
    const result = decorateOf(this, drawn, width);
    if (!result) {
      LAST.delete(this);
      return render.call(this, width);
    }
    LAST.set(this, { decorated: result, rows });
    return result.lines;
  };
  // Pi checks a click against the bounds it drew, so the decorated offsets and pi's own height both map back.
  const shifted = function (this: object, event: TuiMouseEvent): MouseResult {
    const last = LAST.get(this);
    if (!last) return mouse?.call(this, event);
    const { top, left } = last.decorated;
    const moved = { ...event, x: event.x - left, y: event.y - top, width: event.width - left, height: last.rows };
    if (moved.y < 0 || moved.y >= moved.height || moved.x < 0) return undefined;
    return mouse?.call(this, moved);
  };
  proto.render = decorated;
  proto.handleMouse = shifted;
  return () => {
    if (proto.render !== decorated) return;
    proto.render = render;
    if (ownMouse && mouse) proto.handleMouse = mouse;
    else delete proto.handleMouse;
    delete proto[RENDER];
    delete proto[MOUSE];
    delete proto[OWN_MOUSE];
  };
}

type Session = Pick<ExtensionContext["sessionManager"], "getLeafId" | "getBranch">;

// The leaf moves with every appended entry and every tree jump, so it keys the one rebuild each change needs.
export function ledgerOf(session: Session | undefined): () => Ledger {
  let built: { readonly leaf: string | null; readonly ledger: Ledger } | undefined;
  return () => {
    if (!session) return EMPTY_LEDGER;
    const leaf = session.getLeafId();
    if (built?.leaf !== leaf) built = { leaf, ledger: buildLedger(session.getBranch()) };
    return built.ledger;
  };
}

export function ruleTurns(pi: ExtensionAPI): void {
  let theme: Theme | undefined;
  let ledger = ledgerOf(undefined);
  pi.on("session_start", (_event, ctx) => {
    theme = ctx.ui.theme;
    ledger = ledgerOf(ctx.sessionManager);
  });
  const pieceDecorator =
    (pieceOf: (component: object, ledger: Ledger) => Piece | undefined) =>
    (component: object, render: Render, width: number): Decorated | undefined => {
      const piece = pieceOf(component, ledger());
      return piece && theme ? decorate(piece, render, width, theme) : undefined;
    };
  const restores = [patchRender(AssistantMessageComponent.prototype, pieceDecorator(assistantPiece)), patchRender(ToolExecutionComponent.prototype, pieceDecorator(toolPiece))];
  pi.on("session_shutdown", () => {
    theme = undefined;
    for (const restore of restores) restore();
  });
}
