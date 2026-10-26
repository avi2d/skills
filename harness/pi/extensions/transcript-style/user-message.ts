import { type ExtensionContext, type ExtensionUIContext, parseSkillBlock, type SessionEntry, UserMessageComponent } from "@earendil-works/pi-coding-agent";
import { Markdown, Text, truncateToWidth, type TuiMouseEvent, type TuiMouseEventResult, visibleWidth } from "@earendil-works/pi-tui";
import { moreLines } from "./fold";
import { formatTime } from "./time";

// The fold hides at least five rows, so it never trades a row or two for its own hint.
export const MESSAGE_FOLD_ROWS = 12;
export const MESSAGE_PREVIEW_ROWS = 8;

export type MessageLook = {
  readonly openedByDefault: boolean;
  readonly hint: (hidden: number) => string;
  readonly band: (text: string) => string;
  readonly time: (text: string) => string;
};

export type Stamp = { readonly text: string; readonly timestamp: number };

export type Session = Pick<ExtensionContext["sessionManager"], "getLeafId" | "buildContextEntries">;

const textOfBlock = (block: unknown): string | undefined => {
  if (typeof block !== "object" || block === null || !("type" in block) || block.type !== "text" || !("text" in block) || typeof block.text !== "string")
    return undefined;
  return block.text;
};

export function userTextOf(content: unknown): string | undefined {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return undefined;
  const words: string[] = [];
  for (const block of content) {
    const text = textOfBlock(block);
    if (text !== undefined) words.push(text);
  }
  return words.join("");
}

// Pi draws a skill invocation as its own block and gives the user component only the words typed after it.
export function shownUserText(content: unknown): string | undefined {
  const text = userTextOf(content);
  if (!text) return undefined;
  const skill = parseSkillBlock(text);
  return skill ? skill.userMessage : text;
}

export function userStamps(entries: readonly SessionEntry[]): Stamp[] {
  const stamps: Stamp[] = [];
  for (const entry of entries) {
    if (entry.type !== "message" || entry.message.role !== "user") continue;
    const text = shownUserText(entry.message.content);
    if (text === undefined) continue;
    stamps.push({ text, timestamp: entry.message.timestamp });
  }
  return stamps;
}

const extendsStamps = (before: readonly Stamp[], after: readonly Stamp[]): boolean =>
  before.every((stamp, index) => {
    const kept = after[index];
    return kept !== undefined && kept.text === stamp.text && kept.timestamp === stamp.timestamp;
  });

export type StampBook = {
  readonly refresh: (session: Session | undefined) => void;
  readonly arrive: (text: string) => void;
  readonly settle: (text: string) => void;
  readonly take: (component: object, text: string) => number | undefined;
  readonly reset: () => void;
};

export function stampBook(): StampBook {
  let built: { readonly leaf: string | null; readonly stamps: Stamp[] } | undefined;
  let taken = new Set<number>();
  let kept = new WeakMap<object, number>();
  const flying = new Map<string, number>();
  const stamps = (): Stamp[] => built?.stamps ?? [];
  const forget = (): void => {
    taken = new Set();
    kept = new WeakMap();
  };
  const claim = (component: object, { index, stamp }: { readonly index: number; readonly stamp: Stamp }): number => {
    taken.add(index);
    kept.set(component, stamp.timestamp);
    return stamp.timestamp;
  };
  return {
    // Only an appended message keeps the claims: any other change of the shown entries comes with Pi drawing every message again in order.
    refresh: (session) => {
      const leaf = session?.getLeafId() ?? null;
      if (built?.leaf === leaf) return;
      const next = session ? userStamps(session.buildContextEntries()) : [];
      if (!extendsStamps(stamps(), next)) forget();
      built = { leaf, stamps: next };
    },
    arrive: (text) => {
      flying.set(text, (flying.get(text) ?? 0) + 1);
    },
    settle: (text) => {
      const count = (flying.get(text) ?? 0) - 1;
      if (count <= 0) flying.delete(text);
      else flying.set(text, count);
    },
    // Pi persists a user message at message_end, after its component already rendered, so a
    // component with no free stamp waits rather than taking another message's time. A rebuild
    // after a settings change makes new components with every stamp taken, which restarts the order.
    take: (component, text) => {
      const memo = kept.get(component);
      if (memo !== undefined) return memo;
      const matching = stamps().flatMap((stamp, index) => (stamp.text === text ? [{ index, stamp }] : []));
      const free = matching.find(({ index }) => !taken.has(index));
      if (free) return claim(component, free);
      const [first] = matching;
      if (!first || (flying.get(text) ?? 0) > 0) return undefined;
      taken.clear();
      return claim(component, first);
    },
    reset: () => {
      built = undefined;
      forget();
      flying.clear();
    },
  };
}

function messageText(event: unknown): string | undefined {
  if (typeof event !== "object" || event === null || !("message" in event)) return undefined;
  const { message } = event;
  if (typeof message !== "object" || message === null || !("role" in message) || message.role !== "user" || !("content" in message)) return undefined;
  return shownUserText(message.content);
}

function componentText(component: object): string | undefined {
  if (!("text" in component)) return undefined;
  const { text } = component;
  return typeof text === "string" ? text : undefined;
}

// The last row is the band's bottom padding, so right-aligning there never covers content.
function withTime(rows: readonly string[], time: string, look: MessageLook, width: number): string[] {
  const last = rows.at(-1);
  if (last === undefined) return [...rows];
  const tail = look.time(time);
  const head = truncateToWidth(last, Math.max(0, width - visibleWidth(tail) - 1), "");
  const gap = look.band(" ".repeat(Math.max(1, width - visibleWidth(head) - visibleWidth(tail))));
  return [...rows.slice(0, -1), truncateToWidth(`${head}${gap}${tail}`, width, "")];
}

type Padding = { readonly x: number; readonly y: number };

function paddingYOf(child: unknown): number | undefined {
  if (typeof child !== "object" || child === null || !("paddingY" in child)) return undefined;
  const { paddingY } = child;
  return typeof paddingY === "number" && child instanceof Markdown ? paddingY : undefined;
}

function paddingOf(component: object): Padding | undefined {
  if (!("outputPad" in component && "children" in component)) return undefined;
  const { outputPad, children } = component;
  if (typeof outputPad !== "number" || !Array.isArray(children) || children.length !== 1) return undefined;
  const y = paddingYOf(children[0]);
  return y === undefined ? undefined : { x: outputPad, y };
}

const isLong = (rows: number, padding: Padding): boolean => rows - 2 * padding.y > MESSAGE_FOLD_ROWS;

// The first and last rows are the band's padding and carry pi's prompt-zone markers, so the fold cuts only between them.
export function foldRows(rows: readonly string[], paddingY: number, hint: (hidden: number) => string[]): string[] {
  const body = rows.length - 2 * paddingY;
  if (body <= MESSAGE_FOLD_ROWS) return [...rows];
  return [...rows.slice(0, paddingY + MESSAGE_PREVIEW_ROWS), ...hint(body - MESSAGE_PREVIEW_ROWS), ...rows.slice(rows.length - paddingY)];
}

type MouseResult = TuiMouseEventResult | undefined;

export type Patchable = {
  render: (this: object, width: number) => string[];
  handleMouse?: (this: object, event: TuiMouseEvent) => MouseResult;
  setExpanded?: (this: object, expanded: boolean) => void;
};

const RENDER = Symbol.for("skills.transcript-style.user-message.render");
const MOUSE = Symbol.for("skills.transcript-style.user-message.handleMouse");
const OWN_MOUSE = Symbol.for("skills.transcript-style.user-message.ownMouse");

type Originals = { [RENDER]?: Patchable["render"]; [MOUSE]?: Patchable["handleMouse"]; [OWN_MOUSE]?: boolean };

const OPENED = new WeakMap<object, boolean>();
const FOLDABLE = new WeakSet<object>();

// Pi re-imports an extension on reload while the prototype persists, so the wrapper always wraps Pi's own methods.
export function patchUserMessages(
  proto: Patchable & Originals,
  lookOf: () => MessageLook | undefined,
  stampOf: (component: object) => number | undefined = () => undefined,
): () => void {
  const ownMouse = proto[OWN_MOUSE] ?? Object.prototype.hasOwnProperty.call(proto, "handleMouse");
  const render = proto[RENDER] ?? proto.render;
  const mouse = proto[MOUSE] ?? proto.handleMouse;
  Object.assign(proto, { [RENDER]: render, [MOUSE]: mouse, [OWN_MOUSE]: ownMouse });
  const opened = (component: object, look: MessageLook): boolean => OPENED.get(component) ?? look.openedByDefault;
  const folded = function (this: object, width: number): string[] {
    const rows = render.call(this, width);
    const padding = paddingOf(this);
    const look = lookOf();
    let drawn: string[];
    if (!padding || !look || !isLong(rows.length, padding)) {
      FOLDABLE.delete(this);
      drawn = rows;
    } else {
      FOLDABLE.add(this);
      drawn = opened(this, look) ? rows : foldRows(rows, padding.y, (hidden) => new Text(look.hint(hidden), padding.x, 0, look.band).render(width));
    }
    const stamp = padding && look ? stampOf(this) : undefined;
    if (!padding || !look || stamp === undefined) return drawn;
    return withTime(drawn, formatTime(stamp), look, width);
  };
  // Only a click toggles, so a press and a drag still reach the terminal's selection.
  const toggled = function (this: object, event: TuiMouseEvent): MouseResult {
    const look = lookOf();
    if (event.type !== "click" || event.button !== "left" || !look || !FOLDABLE.has(this)) return mouse?.call(this, event);
    OPENED.set(this, !opened(this, look));
    return { handled: true };
  };
  const expand = function (this: object, expanded: boolean): void {
    OPENED.set(this, expanded);
  };
  Object.assign(proto, { render: folded, handleMouse: toggled, setExpanded: expand });
  return () => {
    if (proto.render !== folded) return;
    proto.render = render;
    if (ownMouse && mouse) proto.handleMouse = mouse;
    else delete proto.handleMouse;
    delete proto.setExpanded;
    delete proto[RENDER];
    delete proto[MOUSE];
    delete proto[OWN_MOUSE];
  };
}

export type SessionUi = Pick<ExtensionUIContext, "theme" | "getToolsExpanded">;

export type SessionCtx = { readonly mode: string; readonly ui: SessionUi; readonly sessionManager?: Session };

export type Pi = {
  on(event: "session_start", handler: (event: unknown, ctx: SessionCtx) => void): unknown;
  on(event: "message_start", handler: (event: unknown, ctx: SessionCtx) => void): unknown;
  on(event: "message_end", handler: (event: unknown, ctx: SessionCtx) => void): unknown;
  on(event: "session_tree", handler: () => void): unknown;
  on(event: "session_shutdown", handler: () => void): unknown;
};

// Pi hands its expand key to every chat component with setExpanded, and a message it adds later takes the state the key last set.
export function foldUserMessages(pi: Pi, gesture: () => string): void {
  let ui: SessionUi | undefined;
  let session: Session | undefined;
  const book = stampBook();
  pi.on("session_start", (_event, ctx) => {
    ui = ctx.mode === "tui" ? ctx.ui : undefined;
    session = ctx.sessionManager;
    book.reset();
  });
  // Pi draws every message again after a tree jump, even one whose shown entries only grew.
  pi.on("session_tree", () => {
    book.reset();
  });
  pi.on("message_start", (event) => {
    const text = messageText(event);
    if (text !== undefined) book.arrive(text);
  });
  pi.on("message_end", (event) => {
    const text = messageText(event);
    if (text !== undefined) book.settle(text);
  });
  const restore = patchUserMessages(
    UserMessageComponent.prototype,
    () => {
      if (!ui) return undefined;
      const { theme } = ui;
      return {
        openedByDefault: ui.getToolsExpanded(),
        hint: (hidden) => theme.fg("dim", moreLines(hidden, gesture())),
        band: (text) => theme.bg("userMessageBg", text),
        time: (text) => theme.bg("userMessageBg", theme.fg("dim", text)),
      };
    },
    (component) => {
      if (!ui || !session) return undefined;
      book.refresh(session);
      const text = componentText(component);
      return text === undefined ? undefined : book.take(component, text);
    },
  );
  pi.on("session_shutdown", () => {
    ui = undefined;
    session = undefined;
    book.reset();
    restore();
  });
}
