import { getLanguageFromPath, type Theme, type ThemeColor, type ToolRenderers } from "@earendil-works/pi-coding-agent";
import { type Component, Container, getCapabilities, getImageDimensions, imageFallback, Text } from "@earendil-works/pi-tui";
import { cleanOutput, paintOutput, type Scheme } from "./output";

type RenderCall = NonNullable<ToolRenderers["renderCall"]>;
type RenderResult = NonNullable<ToolRenderers["renderResult"]>;
type Result = Parameters<RenderResult>[0];
type Block = Result["content"][number];
type Image = Extract<Block, { readonly type: "image" }>;
type ResultContext = Parameters<RenderResult>[3];

export type Outcome = { readonly status: "running" } | { readonly status: "ok" } | { readonly status: "failed"; readonly reason: string };

export type Digest = { readonly outcome: Outcome; readonly tally: readonly string[]; readonly expandable: boolean };

export type Flags = { readonly isPartial: boolean; readonly isError: boolean };

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === "object" && value !== null;

const stringIn = (value: unknown, key: string): string | undefined => {
  const field = isRecord(value) ? value[key] : undefined;
  return typeof field === "string" ? field : undefined;
};

function truncatedTotal(details: unknown): number | undefined {
  const truncation = isRecord(details) ? details.truncation : undefined;
  if (!isRecord(truncation) || truncation.truncated !== true) return undefined;
  return typeof truncation.totalLines === "number" ? truncation.totalLines : undefined;
}

const countLines = (text: string): number => (text ? text.split("\n").length : 0);
const NOTHING_SHOWN = "no output";
const lineTally = (lines: number): string => (lines === 0 ? NOTHING_SHOWN : `${lines} line${lines === 1 ? "" : "s"}`);
const firstLine = (text: string): string => text.split("\n", 1)[0] ?? "";

function outcomeOf(flags: Flags, failure: () => string): Outcome {
  if (flags.isPartial) return { status: "running" };
  return flags.isError ? { status: "failed", reason: failure() || "failed" } : { status: "ok" };
}

const SHELL_STATUS = /(?:^|\n\n)Command (?:exited with code (\d+)|timed out after (\d[\d.e+-]*) seconds|(aborted)|terminated without an exit code)$/;
const NO_OUTPUT = "(no output)";

function shellStatus([, code, seconds, aborted]: RegExpExecArray): string {
  if (code) return `exit ${code}`;
  if (seconds) return `timed out after ${seconds}s`;
  return aborted ? "aborted" : "no exit code";
}

type Shell = { readonly output: string; readonly status: RegExpExecArray | null };

// Pi appends a status footer only to a failed command, so a successful one that prints the same words keeps them as output.
function splitShell(text: string, isError: boolean): Shell {
  const status = isError ? SHELL_STATUS.exec(text) : null;
  const body = (status ? text.slice(0, status.index) : text).trimEnd();
  return { output: body === NO_OUTPUT ? "" : body, status };
}

export function shellDigest(text: string, details: unknown, flags: Flags): Digest {
  const { output, status } = splitShell(text, flags.isError);
  const outcome = outcomeOf(flags, () => (status ? shellStatus(status) : firstLine(output)));
  return { outcome, tally: [lineTally(truncatedTotal(details) ?? countLines(output))], expandable: output !== "" };
}

const NOTICE = /\n\n\[[^\n]*\]$/;

export function textDigest(text: string, flags: Flags): Digest {
  const output = text.replace(NOTICE, "").trimEnd();
  const lines = countLines(output);
  const outcome = outcomeOf(flags, () => firstLine(output));
  return { outcome, tally: outcome.status === "failed" && lines <= 1 ? [] : [lineTally(lines)], expandable: output !== "" };
}

const SCRIPT_ERROR = /(?:^|\n)Script error:\n([^\n]+)/;

function callCount(details: unknown): number | undefined {
  const calls = isRecord(details) ? details.calls : undefined;
  return Array.isArray(calls) ? calls.length : undefined;
}

export function toolDigest(text: string, details: unknown, flags: Flags): Digest {
  const calls = callCount(details);
  const lines = countLines(text);
  const outcome = outcomeOf(flags, () => (calls === undefined ? undefined : SCRIPT_ERROR.exec(text)?.[1]) ?? firstLine(text));
  const said = [calls ? `${calls} call${calls === 1 ? "" : "s"}` : "", outcome.status === "failed" && lines <= 1 ? "" : lineTally(lines)];
  return { outcome, tally: said.filter(Boolean), expandable: text !== "" || Boolean(calls) };
}

export function writeDigest(content: string, text: string, flags: Flags): Digest {
  return { outcome: outcomeOf(flags, () => firstLine(text)), tally: [lineTally(countLines(content.trimEnd()))], expandable: content !== "" || flags.isError };
}

export function editDigest(text: string, details: unknown, flags: Flags): Digest {
  const diff = flags.isError ? "" : (stringIn(details, "diff") ?? "");
  const changed = (sign: string): number => diff.split("\n").filter((line) => line.startsWith(sign)).length;
  return { outcome: outcomeOf(flags, () => firstLine(text)), tally: diff ? [`+${changed("+")} −${changed("-")}`] : [], expandable: diff !== "" || flags.isError };
}

function withImages(digest: Digest, images: number, folded: boolean): Digest {
  if (images === 0) return digest;
  const tally = [...digest.tally.filter((said) => said !== NOTHING_SHOWN), `${images} image${images === 1 ? "" : "s"}`];
  return { ...digest, tally, expandable: digest.expandable || folded };
}

const MARK: Readonly<Record<Outcome["status"], readonly [ThemeColor, string] | undefined>> = { ok: ["success", "✓"], failed: ["error", "✗"], running: undefined };

export function summaryLine({ outcome, tally, expandable }: Digest, theme: Pick<Theme, "fg">, expandGesture: string): string {
  const counted = tally.join(" · ");
  const said = [outcome.status === "failed" ? outcome.reason : "", counted && outcome.status === "running" ? `${counted} so far` : counted];
  if (expandable && expandGesture) said.push(`${expandGesture} to expand`);
  const mark = MARK[outcome.status];
  return [mark ? theme.fg(...mark) : "", theme.fg("dim", said.filter(Boolean).join(" · "))].filter(Boolean).join(" ");
}

function shownShellOutput(text: string, details: unknown, flags: Flags): string {
  const fullOutputPath = stringIn(details, "fullOutputPath");
  const footer = text.lastIndexOf("\n\n[");
  if (!flags.isPartial && truncatedTotal(details) !== undefined && fullOutputPath && text.endsWith("]") && footer !== -1 && text.slice(footer).includes(fullOutputPath)) {
    return text.slice(0, footer).trimEnd();
  }
  const { status } = splitShell(text, flags.isError);
  if (!status) return text;
  const body = text.slice(0, status.index).trimEnd();
  return `${body}${body ? "\n\n" : ""}${status[0].trimStart()}`;
}

// A stripped base gets the result without its text, so pi still draws the warnings and timing it derives from details and state.
type Base = "full" | "stripped" | "hidden";

type Layout = { readonly lead: string; readonly base: Base } | { readonly paint: Scheme; readonly text: string; readonly base: Base; readonly belowBase?: true };

type View = {
  readonly digest: (text: string, result: Result, context: ResultContext) => Digest;
  readonly collapsedBase: Exclude<Base, "full">;
  readonly expanded: (text: string, result: Result, context: ResultContext) => Layout;
};

const PI_EXPANDED: Layout = { lead: "", base: "full" };

const listing = (paint: Scheme): View => ({
  digest: (text, _result, context) => textDigest(text, context),
  collapsedBase: "stripped",
  expanded: (text) => ({ paint, text, base: "stripped" }),
});

const SHELL: View = {
  digest: (text, result, context) => shellDigest(text, result.details, context),
  collapsedBase: "stripped",
  expanded: (text, result, context) => ({ paint: "meaning", text: shownShellOutput(text, result.details, context), base: "stripped" }),
};

// Another tool's renderer draws what it reads from details, such as codemode's nested calls, above its output, so the painted output goes below it.
const ANY_TOOL: View = {
  digest: (text, result, context) => toolDigest(text, result.details, context),
  collapsedBase: "hidden",
  expanded: (text) => ({ paint: "meaning", text, base: "stripped", belowBase: true }),
};

const VIEWS: ReadonlyMap<string, View> = new Map([
  ["bash", SHELL],
  ["powershell", SHELL],
  [
    "read",
    {
      digest: (text, _result, context) => textDigest(text, context),
      collapsedBase: "hidden",
      expanded: (text, _result, context) => {
        const path = stringIn(context.args, "file_path") ?? stringIn(context.args, "path");
        return path && getLanguageFromPath(path) && !context.isError ? PI_EXPANDED : { paint: "meaning", text, base: "hidden" };
      },
    },
  ],
  ["grep", listing("links")],
  ["find", listing("paths")],
  ["ls", listing("links")],
  ["write", { digest: (text, _result, context) => writeDigest(stringIn(context.args, "content") ?? "", text, context), collapsedBase: "hidden", expanded: () => PI_EXPANDED }],
  ["edit", { digest: (text, result, context) => editDigest(text, result.details, context), collapsedBase: "hidden", expanded: () => PI_EXPANDED }],
]);

// Pi hands back the component a renderer returned, while the wrapped renderer expects the one it built itself.
const INNER = new WeakMap<Component, Component>();
const innerOf = (component: Component | undefined): Component | undefined => (component ? INNER.get(component) : undefined);

function wrapping(inner: Component, render: (width: number) => string[]): Component {
  const outer: Component = { render, invalidate: () => inner.invalidate() };
  INNER.set(outer, inner);
  return outer;
}

const SCRIPT_HEADER = /^Script (?:completed|failed)\nWall time [\d.]+ seconds\nOutput:\n$/;

function outputBlocks({ content, details }: Result): Result["content"] {
  const [first, ...rest] = content;
  return callCount(details) !== undefined && first?.type === "text" && SCRIPT_HEADER.test(first.text) ? rest : content;
}

const textOf = (result: Result): string =>
  outputBlocks(result)
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("\n");

const isImage = (block: Block): block is Image => block.type === "image";

function imageFallbacks(images: readonly Image[], showImages: boolean): string[] {
  if (getCapabilities().images && showImages) return [];
  return images.map(({ data, mimeType }) => imageFallback(mimeType, getImageDimensions(data, mimeType) ?? undefined));
}

const NOTHING: RenderResult = () => new Container();

function foldResult(view: View, renderResult: RenderResult, selfShell: boolean, expandGesture: () => string): RenderResult {
  return (result, options, theme, context) => {
    const text = cleanOutput(textOf(result));
    const images = result.content.filter(isImage);
    const fallbacks = imageFallbacks(images, context.showImages);
    const layout = options.expanded
      ? view.expanded(text, result, context)
      : { lead: summaryLine(withImages(view.digest(text, result, context), images.length, fallbacks.length > 0), theme, expandGesture()), base: view.collapsedBase };
    const inner = renderResult(layout.base === "stripped" ? { ...result, content: [] } : result, options, theme, { ...context, lastComponent: innerOf(context.lastComponent) });
    const lead = "paint" in layout ? paintOutput([layout.text, ...fallbacks].filter(Boolean).join("\n"), theme, layout.paint) : layout.lead;
    const shown = [...(lead ? [selfShell ? new Text(lead, 1, 0) : new Text(`\n${lead}`, 0, 0)] : []), ...(layout.base === "hidden" ? [] : [inner])];
    const outer = new Container();
    for (const child of "paint" in layout && layout.belowBase ? shown.reverse() : shown) outer.addChild(child);
    INNER.set(outer, inner);
    return outer;
  };
}

export const COMMAND_PREVIEW_ROWS = 3;

type CallFold = {
  readonly args?: (args: unknown) => unknown;
  readonly rows: (inner: Component, width: number, hint: (hidden: number) => string) => string[];
};

function firstRows(inner: Component, width: number, hint: (hidden: number) => string): string[] {
  const rows = inner.render(width);
  if (rows.length <= COMMAND_PREVIEW_ROWS + 1) return rows;
  return [...rows.slice(0, COMMAND_PREVIEW_ROWS), ...new Text(hint(rows.length - COMMAND_PREVIEW_ROWS), 0, 0).render(width)];
}

const hasChildren = (component: Component): component is Component & { children: Component[] } => "children" in component && Array.isArray(component.children);

// Pi's edit result rebuilds the call's box after this renderer returns, so the box is cut at render time rather than here.
function headerRows(inner: Component, width: number): string[] {
  if (!hasChildren(inner) || inner.children.length < 2) return inner.render(width);
  const all = inner.children;
  inner.children = all.slice(0, 1);
  try {
    return inner.render(width);
  } finally {
    inner.children = all;
  }
}

const CALL_FOLDS: ReadonlyMap<string, CallFold> = new Map<string, CallFold>([
  ["bash", { rows: firstRows }],
  ["powershell", { rows: firstRows }],
  ["edit", { rows: headerRows }],
  ["write", { args: (args) => (isRecord(args) ? { ...args, content: "" } : args), rows: (inner, width) => inner.render(width) }],
]);

export const moreLines = (hidden: number, gesture: string): string => `… ${hidden} more line${hidden === 1 ? "" : "s"}${gesture ? ` · ${gesture} to expand` : ""}`;

function foldCall(fold: CallFold, renderCall: RenderCall, expandGesture: () => string): RenderCall {
  return (args, theme, context) => {
    const lastComponent = innerOf(context.lastComponent);
    if (context.expanded) {
      const inner = renderCall(args, theme, { ...context, lastComponent });
      return wrapping(inner, (width) => inner.render(width));
    }
    const inner = renderCall(fold.args ? fold.args(args) : args, theme, { ...context, lastComponent });
    const gesture = expandGesture();
    const hint = (hidden: number): string => theme.fg("dim", moreLines(hidden, gesture));
    return wrapping(inner, (width) => fold.rows(inner, width, hint));
  };
}

export function foldRenderers(toolName: string, base: ToolRenderers | undefined, expandGesture: () => string): ToolRenderers | undefined {
  if (!base) return base;
  const fold = CALL_FOLDS.get(toolName);
  const { renderCall, renderResult = NOTHING } = base;
  return {
    ...base,
    ...(fold && renderCall ? { renderCall: foldCall(fold, renderCall, expandGesture) } : {}),
    renderResult: foldResult(VIEWS.get(toolName) ?? ANY_TOOL, renderResult, base.renderShell === "self", expandGesture),
  };
}
