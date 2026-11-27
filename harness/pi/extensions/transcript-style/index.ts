import { AssistantMessageComponent, keyText, type ExtensionAPI, type Theme, type ToolRendererResolver } from "@earendil-works/pi-coding-agent";
import { type Component, Markdown, type TUI, type TuiMode } from "@earendil-works/pi-tui";
import { bashRenderer } from "./bash";
import { foldRenderers } from "./fold";
import { keepLines } from "./frame";
import { ruleTurns } from "./turn-rules";
import { foldUserMessages } from "./user-message";

export type Env = Readonly<Record<string, string | undefined>>;

// Firstmate exports FM_TASK_INBOX into every pane it launches, secondmates included; the captain's own session has none.
export function isCaptainSession(env: Env): boolean {
  return !env.FM_TASK_INBOX;
}

export type ReplyTheme = Pick<Theme, "fg" | "style">;

export const EDGE = "▌";

type ReplyInternals = {
  readonly hasToolCalls: boolean;
  readonly isStreaming: boolean;
  readonly contentContainer: { readonly children: readonly unknown[] };
};

type MarkdownInternals = {
  paddingY: number;
  defaultTextStyle: { readonly bgColor?: (text: string) => string } | undefined;
  render(width: number): string[];
  invalidate(): void;
};

function isReplyInternals(component: object): component is ReplyInternals {
  if (!("hasToolCalls" in component && "isStreaming" in component && "contentContainer" in component)) return false;
  const { hasToolCalls, isStreaming, contentContainer } = component;
  if (typeof hasToolCalls !== "boolean" || typeof isStreaming !== "boolean") return false;
  return typeof contentContainer === "object" && contentContainer !== null && "children" in contentContainer && Array.isArray(contentContainer.children);
}

function isMarkdownInternals(child: unknown): child is MarkdownInternals {
  if (typeof child !== "object" || child === null || !("paddingY" in child && "defaultTextStyle" in child)) return false;
  return typeof child.paddingY === "number" && child instanceof Markdown;
}

// Pi reuses a reply's Markdown across every updateContent, so a second wrapper would stack a second edge and take a second column.
const edges = new WeakMap<MarkdownInternals, { edge: string }>();

export function styleReply(component: object, theme: ReplyTheme): boolean {
  if (!isReplyInternals(component) || component.hasToolCalls || component.isStreaming) return false;
  const texts = component.contentContainer.children.filter(isMarkdownInternals);
  if (texts.length === 0) return false;
  const band = (text: string): string => theme.style(text, { bg: "userMessageBg" });
  const edge = band(theme.fg("accent", EDGE));
  for (const text of texts) {
    text.defaultTextStyle = { ...text.defaultTextStyle, bgColor: band };
    text.paddingY = 1;
    const holder = edges.get(text);
    if (holder === undefined) {
      const next = { edge };
      edges.set(text, next);
      const render = text.render.bind(text);
      const edged = keepLines((rows, drawn: string) => rows.map((line) => drawn + line));
      text.render = (width) => edged(render(width - 1), next.edge);
    } else {
      holder.edge = edge;
    }
    text.invalidate();
  }
  return true;
}

type UpdateContent = AssistantMessageComponent["updateContent"];

const ORIGINAL = Symbol.for("skills.transcript-style.updateContent");

export type Patchable = { updateContent: UpdateContent; [ORIGINAL]?: UpdateContent };

// Pi re-imports an extension on reload while the prototype persists, so the wrapper always wraps Pi's own method.
export function patchReplies(proto: Partial<Patchable>, style: (component: object) => void): (() => void) | undefined {
  const original = proto[ORIGINAL] ?? proto.updateContent;
  if (typeof original !== "function") return undefined;
  proto[ORIGINAL] = original;
  const styled = function (this: AssistantMessageComponent, ...args: Parameters<UpdateContent>) {
    original.apply(this, args);
    style(this);
  };
  proto.updateContent = styled;
  return () => {
    if (proto.updateContent !== styled) return;
    proto.updateContent = original;
    delete proto[ORIGINAL];
  };
}

export { bashRenderer, commandHeader, palette, tokenize, withShellHeader, type CommandTheme, type Kind, type Token } from "./bash";

export const transcriptRenderer =
  (gesture: () => string): ToolRendererResolver =>
  (toolName, next) =>
    foldRenderers(toolName, bashRenderer(toolName, next), gesture);

// Regular mode leaves the mouse to the terminal, so a click reaches pi's tool block only in fullscreen.
export function expandGesture(mode: TuiMode | undefined, expandKey: string): string {
  return mode === "fullscreen" ? "click" : expandKey;
}

export const WIDGET = "transcript-style";

type WidgetHost = { setWidget(key: string, content: ((tui: TUI) => Component) | undefined): void };

// Pi hands an extension its TUI only through a widget factory, and that TUI follows a mode switch in /settings.
export function tuiOf(ui: WidgetHost): TUI | undefined {
  let handed: TUI | undefined;
  ui.setWidget(WIDGET, (tui) => {
    handed = tui;
    return { render: () => [], invalidate: () => {} };
  });
  ui.setWidget(WIDGET, undefined);
  return handed;
}

export default function (pi: ExtensionAPI): void {
  let tui: TUI | undefined;
  const gesture = (): string => expandGesture(tui?.mode, keyText("app.tools.expand"));
  pi.registerToolRenderer(transcriptRenderer(gesture));
  foldUserMessages(pi, gesture);
  pi.on("session_start", (_event, ctx) => {
    tui = ctx.mode === "tui" ? tuiOf(ctx.ui) : undefined;
  });
  pi.on("session_shutdown", () => {
    tui = undefined;
  });
  ruleTurns(pi);
  if (!isCaptainSession(process.env)) return;
  let ui: { readonly theme: Theme } | undefined;
  pi.on("session_start", (_event, ctx) => {
    ui = ctx.ui;
  });
  const restore = patchReplies(AssistantMessageComponent.prototype, (component) => {
    if (ui) styleReply(component, ui.theme);
  });
  pi.on("session_shutdown", () => {
    ui = undefined;
    restore?.();
  });
}
