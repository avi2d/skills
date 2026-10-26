import { AssistantMessageComponent, keyText, type ExtensionAPI, type Theme, type ToolRendererResolver } from "@earendil-works/pi-coding-agent";
import { type Component, Markdown, type TUI, type TuiMode } from "@earendil-works/pi-tui";
import { foldRenderers } from "./fold";
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

export function styleReply(component: object, theme: ReplyTheme): boolean {
  if (!isReplyInternals(component) || component.hasToolCalls || component.isStreaming) return false;
  const texts = component.contentContainer.children.filter(isMarkdownInternals);
  if (texts.length === 0) return false;
  const band = (text: string): string => theme.style(text, { bg: "userMessageBg" });
  const edge = band(theme.fg("accent", EDGE));
  for (const text of texts) {
    text.defaultTextStyle = { ...text.defaultTextStyle, bgColor: band };
    text.paddingY = 1;
    const render = text.render.bind(text);
    text.render = (width) => render(width - 1).map((line) => edge + line);
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

export type Kind = "space" | "command" | "keyword" | "flag" | "string" | "variable" | "number" | "operator" | "comment" | "word";

export type Token = { readonly kind: Kind; readonly text: string };

type Fragment = { readonly lexeme: "quoted" | "variable" | "word"; readonly text: string };
type Boundary = { readonly lexeme: "newline" | "space" | "comment" | "operator" | "heredoc"; readonly text: string };
type Lexed = Fragment | Boundary;

const LEXEMES: ReadonlyArray<Lexed["lexeme"]> = ["newline", "space", "comment", "quoted", "quoted", "variable", "operator", "word"];

const BLANKS = /(\n)|((?:[^\S\n]|\\\n)+)/;
const FRAGMENTS_AND_OPERATORS =
  /('[^']*'?)|("(?:\\[\s\S]|[^"\\])*"?)|(\$\{[^}]*\}?|\$[A-Za-z_?@#!*0-9][A-Za-z0-9_]*)|(\$\(|\d*[<>]&(?:\d+-?|-)|&>>?|\d*>>?|<<<|<<-?|<|\|\||\|&|\||&&|;;|;|&|\(|\)|`)|((?:\\[^\n]|[^\s'"|&;()<>`$\\])+|\\|\$)/;

// Every character matches some alternative, so the sticky matches tile the whole command; `#` inside a word falls to the word alternative.
const lexer = (comment: RegExp): RegExp => new RegExp(`${BLANKS.source}|${comment.source}|${FRAGMENTS_AND_OPERATORS.source}`, "y");
const LEX_AT_WORD_START = lexer(/(#[^\n]*)/);
const LEX_IN_WORD = lexer(/((?!))/);

const KEYWORDS = new Set(["{", "}", "if", "then", "else", "elif", "fi", "for", "while", "until", "do", "done", "case", "esac", "in", "function", "select", "time", "!"]);
const OPENS_COMMAND = new Set(["{", "if", "then", "else", "elif", "while", "until", "do", "!", "time"]);
const SEPARATORS = new Set(["|", "||", "&&", ";", "&", "|&", ";;"]);
const NESTING = new Set(["$(", "(", ")", "`"]);
const REDIRECT = /^(?:\d*>>?|&>>?|<<<|<<-?|<)$/;
const DURATION = /^\d+(?:\.\d+)?[smhd]?$/;

const OPTIONS_TAKING_OPERAND_BY_WRAPPER: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  [
    "sudo",
    new Set(["-u", "-g", "-p", "-C", "-D", "-r", "-t", "-U", "-T", "--user", "--group", "--prompt", "--close-from", "--chdir", "--role", "--type", "--other-user", "--command-timeout", "--host"]),
  ],
  ["env", new Set(["-u", "-C", "-S", "--unset", "--chdir", "--split-string"])],
  ["xargs", new Set(["-I", "-L", "-n", "-P", "-s", "-d", "-E", "-a", "--arg-file", "--delimiter", "--max-args", "--max-procs", "--max-chars", "--process-slot-var"])],
  ["timeout", new Set(["-s", "-k", "--signal", "--kill-after"])],
  ["exec", new Set(["-a"])],
  ["command", new Set()],
  ["builtin", new Set()],
  ["nohup", new Set()],
  ["time", new Set()],
]);

type Heredoc = { readonly delimiter: string; readonly stripTabs: boolean };

const isFragment = (lexed: Lexed): lexed is Fragment => lexed.lexeme === "quoted" || lexed.lexeme === "variable" || lexed.lexeme === "word";

const continuesWord = (previous: Lexed | undefined): boolean =>
  previous !== undefined && (isFragment(previous) || (previous.lexeme === "operator" && (previous.text === ")" || previous.text === "`")));

function heredocEnd(command: string, from: number, pending: readonly Heredoc[]): number {
  const waiting = [...pending];
  let at = from;
  for (;;) {
    const newline = command.indexOf("\n", at);
    const end = newline === -1 ? command.length : newline;
    const line = command.slice(at, end);
    const [heredoc] = waiting;
    if (heredoc && (heredoc.stripTabs ? line.replace(/^\t+/, "") : line) === heredoc.delimiter) waiting.shift();
    if (waiting.length === 0 || newline === -1) return end;
    at = newline + 1;
  }
}

function readDelimiter(opened: Heredoc | undefined, next: Lexed, pending: Heredoc[]): Heredoc | undefined {
  if (opened && isFragment(next)) return { ...opened, delimiter: opened.delimiter + next.text };
  if (opened && next.lexeme === "space" && !opened.delimiter) return opened;
  if (opened?.delimiter) pending.push({ ...opened, delimiter: opened.delimiter.replace(/['"\\]/g, "") });
  return next.lexeme === "operator" && (next.text === "<<" || next.text === "<<-") ? { stripTabs: next.text === "<<-", delimiter: "" } : undefined;
}

function lexemes(command: string): Lexed[] {
  const lexed: Lexed[] = [];
  const pending: Heredoc[] = [];
  let opened: Heredoc | undefined;
  for (let at = 0; at < command.length; ) {
    const lex = continuesWord(lexed.at(-1)) ? LEX_IN_WORD : LEX_AT_WORD_START;
    lex.lastIndex = at;
    const match = lex.exec(command);
    if (!match) break;
    const next: Lexed = { lexeme: LEXEMES[match.slice(1).findIndex(Boolean)] ?? "word", text: match[0] };
    lexed.push(next);
    at = lex.lastIndex;
    opened = readDelimiter(opened, next, pending);
    if (next.lexeme === "newline" && pending.length > 0) {
      const end = heredocEnd(command, at, pending.splice(0));
      if (end > at) lexed.push({ lexeme: "heredoc", text: command.slice(at, end) });
      at = end;
    }
  }
  return lexed;
}

// A redirect target or a wrapper option's operand is `valueNext`, and leaves command position as it was.
type Position = { command: boolean; wrapper: ReadonlySet<string> | undefined; valueNext: boolean };

const VALUE_KIND = { quoted: "string", variable: "variable", word: "word" } as const satisfies Record<Fragment["lexeme"], Kind>;

const values = (fragments: readonly Fragment[]): Token[] => fragments.map(({ lexeme, text }) => ({ kind: VALUE_KIND[lexeme], text }));

function argument({ lexeme, text }: Fragment): Token {
  if (lexeme !== "word") return { kind: VALUE_KIND[lexeme], text };
  if (/^(--?[A-Za-z0-9]|--$)/.test(text)) return { kind: "flag", text };
  return { kind: /^\d+$/.test(text) ? "number" : "word", text };
}

function shellWord(first: Fragment, rest: readonly Fragment[], at: Position): Token[] {
  const text = first.text + rest.map((fragment) => fragment.text).join("");
  if (at.valueNext) {
    at.valueNext = false;
    return values([first, ...rest]);
  }
  if (at.wrapper && first.lexeme === "word" && first.text.startsWith("-")) {
    at.valueNext = rest.length === 0 && at.wrapper.has(first.text);
    return [{ kind: "flag", text: first.text }, ...values(rest)];
  }
  if (at.wrapper && DURATION.test(text)) return [{ kind: "number", text }];
  if (!at.command) return [first, ...rest].map(argument);
  const assignment = first.lexeme === "word" ? /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/s.exec(first.text) : null;
  if (assignment) {
    const [, name = "", value = ""] = assignment;
    return [{ kind: "variable", text: name }, { kind: "operator", text: "=" }, ...(value ? [{ kind: "word" as const, text: value }] : []), ...values(rest)];
  }
  if (rest.length === 0 && first.lexeme === "word" && KEYWORDS.has(text)) {
    at.command = OPENS_COMMAND.has(text);
    at.wrapper = OPTIONS_TAKING_OPERAND_BY_WRAPPER.get(text);
    return [{ kind: "keyword", text }];
  }
  if (first.lexeme === "variable") {
    Object.assign(at, { command: false, wrapper: undefined });
    return values([first, ...rest]);
  }
  at.wrapper = OPTIONS_TAKING_OPERAND_BY_WRAPPER.get(text);
  at.command = at.wrapper !== undefined;
  return [first, ...rest].map((fragment) => ({ kind: fragment.lexeme === "variable" ? "variable" : "command", text: fragment.text }));
}

function boundary({ lexeme, text }: Boundary, at: Position): Token {
  switch (lexeme) {
    case "newline":
      Object.assign(at, { command: true, wrapper: undefined, valueNext: false });
      return { kind: "space", text };
    case "operator":
      if (REDIRECT.test(text)) at.valueNext = true;
      else if (SEPARATORS.has(text)) Object.assign(at, { command: true, wrapper: undefined, valueNext: false });
      return { kind: "operator", text };
    case "heredoc":
      return { kind: "string", text };
    case "space":
    case "comment":
      return { kind: lexeme, text };
  }
}

type Frame = { readonly closer: ")" | "`"; readonly resume: Position };

const commandStart = (): Position => ({ command: true, wrapper: undefined, valueNext: false });
const afterCommand = (): Position => ({ command: false, wrapper: undefined, valueNext: false });

// A substitution that starts a word in command position is the command word itself.
function resumeAfter(opener: string, at: Position, glued: boolean): Position {
  if (opener === "(") return afterCommand();
  if (glued || !(at.command || at.valueNext)) return { ...at };
  return at.valueNext ? { ...at, valueNext: false } : afterCommand();
}

function nest(text: string, glued: boolean, at: Position, frames: Frame[]): "closed" | "opened" | "unmatched" {
  const top = frames.at(-1);
  if (top?.closer === text) {
    frames.pop();
    Object.assign(at, top.resume);
    return "closed";
  }
  if (text === ")") return "unmatched";
  frames.push({ closer: text === "`" ? "`" : ")", resume: resumeAfter(text, at, glued) });
  Object.assign(at, commandStart());
  return "opened";
}

export function tokenize(command: string): Token[] {
  const at = commandStart();
  const frames: Frame[] = [];
  const tokens: Token[] = [];
  let word: Fragment[] = [];
  let afterSubstitution = false;
  const endWord = (): void => {
    const [first, ...rest] = word;
    if (afterSubstitution) tokens.push(...values(word));
    else if (first) tokens.push(...shellWord(first, rest, at));
    word = [];
  };
  for (const lexed of lexemes(command)) {
    if (isFragment(lexed)) {
      word.push(lexed);
      continue;
    }
    const glued: boolean = word.length > 0 || afterSubstitution;
    endWord();
    const nesting = lexed.lexeme === "operator" && NESTING.has(lexed.text);
    afterSubstitution = nesting && nest(lexed.text, glued, at, frames) === "closed";
    tokens.push(nesting ? { kind: "operator", text: lexed.text } : boundary(lexed, at));
  }
  endWord();
  return tokens;
}

export type CommandTheme = Pick<Theme, "fg" | "bold" | "italic">;

export function palette(theme: CommandTheme): Readonly<Record<Kind, (text: string) => string>> {
  return {
    space: (text) => text,
    command: (text) => theme.bold(theme.fg("syntaxFunction", text)),
    keyword: (text) => theme.fg("syntaxKeyword", text),
    flag: (text) => theme.fg("syntaxType", text),
    string: (text) => theme.fg("muted", text),
    variable: (text) => theme.fg("syntaxNumber", text),
    number: (text) => theme.fg("syntaxNumber", text),
    operator: (text) => theme.fg("syntaxOperator", text),
    comment: (text) => theme.italic(theme.fg("syntaxComment", text)),
    word: (text) => theme.fg("text", text),
  };
}

export function commandHeader(command: string, timeout: unknown, theme: CommandTheme): string {
  const paint = palette(theme);
  const body = tokenize(command)
    .map(({ kind, text }) => paint[kind](text))
    .join("");
  const suffix = typeof timeout === "number" && timeout > 0 ? theme.fg("muted", ` (timeout ${timeout}s)`) : "";
  return `${theme.fg("dim", "$")} ${body}${suffix}`;
}

const settable = (component: Component): component is Component & { setText(text: string): void } =>
  "setText" in component && typeof component.setText === "function";

function commandArgs(args: unknown): { readonly command?: unknown; readonly timeout?: unknown } {
  return typeof args === "object" && args !== null ? args : {};
}

export function withShellHeader<Args, Context, T extends CommandTheme>(
  renderCall: (args: Args, theme: T, context: Context) => Component,
): (args: Args, theme: T, context: Context) => Component {
  return (args, theme, context) => {
    const component = renderCall(args, theme, context);
    const { command, timeout } = commandArgs(args);
    if (typeof command === "string" && command && settable(component)) component.setText(commandHeader(command, timeout, theme));
    return component;
  };
}

export const bashRenderer: ToolRendererResolver = (toolName, next) => {
  const base = next();
  const renderCall = base?.renderCall;
  if (toolName !== "bash" || !base || !renderCall) return base;
  return { ...base, renderCall: withShellHeader(renderCall) };
};

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
