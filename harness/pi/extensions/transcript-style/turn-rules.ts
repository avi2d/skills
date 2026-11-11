import { AssistantMessageComponent, ToolExecutionComponent, type ExtensionAPI, type ExtensionContext, type Theme, type ThemeColor } from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences, truncateToWidth, type TuiMouseEvent, type TuiMouseEventResult, visibleWidth } from "@earendil-works/pi-tui";
import { frames, sameRows } from "./frame";
import { dayOf, formatTime } from "./time";
import { buildLedger, callFigures, EMPTY_LEDGER, HEAVY_TOOL_TOKENS, type Figure, type Ledger, toolFigure, type ToolTokens, type Turn, turnLabel } from "./turns";

export type TurnPiece = { readonly kind: "turn"; readonly turn: Turn | undefined; readonly streaming: boolean; readonly timestamp: number };
export type ToolPiece = { readonly kind: "tool"; readonly call: string; readonly tokens: ToolTokens | undefined };
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

const toolIndent = (width: number): number => (width > TOOL_INDENT ? TOOL_INDENT : 0);

function ruleTool(tokens: ToolTokens | undefined, render: Render, width: number, theme: RuleTheme): Decorated {
  const indent = toolIndent(width);
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

export type Decorate = (piece: Piece, render: Render, width: number, theme: RuleTheme) => Decorated;

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

// The kept piece was read from this same ledger, so it still holds while the component says the same of itself.
export type PieceOf = (component: object, ledger: Ledger, kept?: Piece) => Piece | undefined;

export function assistantPiece(component: object, ledger: Ledger, kept?: Piece): TurnPiece | undefined {
  if (!isAssistantInternals(component) || !component.lastMessage) return undefined;
  const { timestamp } = component.lastMessage;
  const streaming = component.isStreaming;
  if (kept?.kind === "turn" && kept.streaming === streaming && kept.timestamp === timestamp) return kept;
  const streamed = streaming ? { number: ledger.turns + 1, usage: undefined } : undefined;
  return { kind: "turn", turn: ledger.turnsByTimestamp.get(timestamp) ?? streamed, streaming, timestamp };
}

export function toolPiece(component: object, ledger: Ledger, kept?: Piece): ToolPiece | undefined {
  if (!("toolCallId" in component) || typeof component.toolCallId !== "string") return undefined;
  const call = component.toolCallId;
  if (kept?.kind === "tool" && kept.call === call) return kept;
  return { kind: "tool", call, tokens: ledger.tools.get(call) };
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

export type Drawn = { readonly decorated: Decorated; readonly rows: readonly string[] };

export type Draw<Last extends Drawn> = (component: object, render: Render, width: number, last: Last | undefined) => Last | undefined;

// Pi re-imports an extension on reload while the prototype persists, so the wrapper always wraps Pi's own method.
export function patchRender<Last extends Drawn>(proto: Patchable & Originals, draw: Draw<Last>): () => void {
  const lasts = new WeakMap<object, Last>();
  const ownMouse = proto[OWN_MOUSE] ?? Object.prototype.hasOwnProperty.call(proto, "handleMouse");
  const render = proto[RENDER] ?? proto.render;
  const mouse = proto[MOUSE] ?? proto.handleMouse;
  proto[RENDER] = render;
  proto[MOUSE] = mouse;
  proto[OWN_MOUSE] = ownMouse;
  const decorated = function (this: object, width: number): string[] {
    const last = lasts.get(this);
    const drawn = draw(this, (inner) => render.call(this, inner), width, last);
    if (!drawn) {
      if (last) lasts.delete(this);
      return render.call(this, width);
    }
    if (drawn !== last) lasts.set(this, drawn);
    return drawn.decorated.lines;
  };
  // Pi checks a click against the bounds it drew, so the decorated offsets and pi's own height both map back.
  const shifted = function (this: object, event: TuiMouseEvent): MouseResult {
    const last = lasts.get(this);
    if (!last) return mouse?.call(this, event);
    const { top, left } = last.decorated;
    const moved = { ...event, x: event.x - left, y: event.y - top, width: event.width - left, height: last.rows.length };
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

const innerWidth = (piece: Piece, width: number): number => width - (piece.kind === "tool" ? toolIndent(width) : 0);

export type Look = { readonly theme: RuleTheme; readonly ledger: Ledger };

type Kept = Drawn & {
  frame: number;
  readonly width: number;
  readonly day: number;
  readonly palette: string;
  readonly ledger: Ledger;
  readonly piece: Piece;
};

const themeSignature = (theme: RuleTheme): string =>
  [theme.fg("borderMuted", ""), theme.fg("accent", ""), theme.fg("dim", ""), theme.fg("muted", ""), theme.fg("warning", ""), theme.bold("")].join("\x1f");

const figuresOf = (piece: Piece): Turn | ToolTokens | undefined => (piece.kind === "tool" ? piece.tokens : piece.turn);

// The ledger hands out the same figures until the session's leaf moves, so the text comparison runs only for a rebuilt ledger.
function samePiece(kept: Piece, piece: Piece): boolean {
  if (kept === piece) return true;
  if (kept.kind !== piece.kind) return false;
  if (kept.kind === "turn" && piece.kind === "turn" && (kept.streaming !== piece.streaming || kept.timestamp !== piece.timestamp)) return false;
  const before = figuresOf(kept);
  const after = figuresOf(piece);
  return before === after || JSON.stringify(before) === JSON.stringify(after);
}

// Redrawn on every spinner frame, so each component keeps its decoration until one of its inputs changes.
export function keepDecorations(pieceOf: PieceOf, lookOf: () => Look | undefined, decorateWith: Decorate = decorate): Draw<Kept> {
  const frameAfter = frames(() => {
    const look = lookOf();
    return { look, day: dayOf(Date.now()), palette: look ? themeSignature(look.theme) : "" };
  });
  return (component, render, width, last) => {
    const frame = frameAfter(last?.frame);
    const { look, day, palette } = frame.value;
    if (!look) return undefined;
    const { theme, ledger } = look;
    const piece = pieceOf(component, ledger, last?.ledger === ledger ? last.piece : undefined);
    if (!piece) return undefined;
    const inner = innerWidth(piece, width);
    const rows = render(inner);
    if (last && last.width === width && last.day === day && last.palette === palette && samePiece(last.piece, piece) && sameRows(last.rows, rows)) {
      if (last.piece !== piece) return { ...last, frame: frame.id, ledger, piece };
      last.frame = frame.id;
      return last;
    }
    // Copied, because pi may reuse the array it returned and change it in place.
    const copy = [...rows];
    const decorated = decorateWith(piece, (w) => (w === inner ? copy : render(w)), width, theme);
    return { frame: frame.id, width, day, palette, ledger, piece, rows: copy, decorated };
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
  const lookOf = (): Look | undefined => (theme ? { theme, ledger: ledger() } : undefined);
  const restores = [
    patchRender(AssistantMessageComponent.prototype, keepDecorations(assistantPiece, lookOf)),
    patchRender(ToolExecutionComponent.prototype, keepDecorations(toolPiece, lookOf)),
  ];
  pi.on("session_shutdown", () => {
    theme = undefined;
    for (const restore of restores) restore();
  });
}
