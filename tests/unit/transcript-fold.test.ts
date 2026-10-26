import { beforeAll, describe, expect, test } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import { initTheme, type ToolRenderers } from "@earendil-works/pi-coding-agent";
import { type Component, resetCapabilitiesCache, setCapabilities } from "@earendil-works/pi-tui";
import { createAllToolRenderers } from "../../node_modules/@earendil-works/pi-coding-agent/dist/core/tools/renderers/index.js";
import { codemodeRenderers } from "../../node_modules/@earendil-works/pi-coding-agent/dist/extensions/codemode/renderer.js";
import { theme } from "../../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js";
import { editDigest, foldRenderers, shellDigest, summaryLine, textDigest, toolDigest, writeDigest, type Digest } from "../../harness/pi/extensions/transcript-style/fold";
import { transcriptRenderer } from "../../harness/pi/extensions/transcript-style/index";
import { classifyOutput, cleanOutput, paintOutput, type Scheme } from "../../harness/pi/extensions/transcript-style/output";

beforeAll(() => initTheme("dark", false));

const tagged = { fg: (token: string, text: string): string => `<${token}>${text}</${token}>` };

const spans = (output: string, scheme: Scheme): string[] =>
  classifyOutput(output, scheme).map((line) => line.map(({ role, text }) => `${role}:${text}`).join(" | "));

describe("classifyOutput", () => {
  const lines: ReadonlyArray<readonly [string, Scheme, string]> = [
    ["error: cannot find module 'x'", "meaning", "error:error: cannot find module 'x'"],
    ["FAIL  tests/unit/a.test.ts", "meaning", "error:FAIL  tests/unit/a.test.ts"],
    ["not ok 3 - parses", "meaning", "error:not ok 3 - parses"],
    ["npm ERR! code 1", "meaning", "error:npm ERR! code 1"],
    ["Command exited with code 2", "meaning", "error:Command exited with code 2"],
    ["warning: unused variable `x`", "meaning", "warning:warning: unused variable `x`"],
    ["npm WARN deprecated glob@7", "meaning", "warning:npm WARN deprecated glob@7"],
    [" 12 pass", "meaning", "success: 12 pass"],
    ["✓ built in 1.2s", "meaning", "success:✓ built in 1.2s"],
    [" 0 fail", "meaning", "text: 0 fail"],
    ["Found 0 errors and no warnings.", "meaning", "text:Found 0 errors and no warnings."],
    ["see src/errors.ts:12:3 for details", "meaning", "text:see  | link:src/errors.ts:12:3 | text: for details"],
    ["open https://example.com/a?b=1.", "meaning", "text:open  | link:https://example.com/a?b=1 | text:."],
    ["wrote ~/.pi/agent/settings.json", "meaning", "text:wrote  | link:~/.pi/agent/settings.json"],
    ["copied ./out to ../up/", "meaning", "text:copied  | link:./out | text: to  | link:../up/"],
    ["in .pi/agent/extensions", "meaning", "text:in  | link:.pi/agent/extensions"],
    ["(/tmp/x.png)", "meaning", "text:( | link:/tmp/x.png | text:)"],
    ["and/or 1/2 on 10/05/2026", "meaning", "text:and/or 1/2 on 10/05/2026"],
    ["-rw-r--r--  1 me  wheel  12 /tmp/a", "meaning", "text:-rw-r--r--  1 me  wheel  12  | link:/tmp/a"],
    ["src/a.ts:3:  throw new Error('failed')", "links", "link:src/a.ts:3 | text::  throw new Error('failed')"],
    ["notes.ts:1: export const answer = 41;", "links", "link:notes.ts:1 | text:: export const answer = 41;"],
    ["notes.ts", "links", "text:notes.ts"],
    ["data/", "links", "link:data/"],
    ["at 12:30 on host:8080", "meaning", "text:at 12:30 on host:8080"],
    ["notes.ts", "paths", "link:notes.ts"],
    ["", "meaning", ""],
  ];

  test.each(lines)("%p as %p", (line, scheme, expected) => {
    expect(spans(line, scheme)).toEqual([expected]);
  });

  test("colours added and removed lines only inside a diff", () => {
    expect(spans("@@ -1,2 +1,2 @@\n-old\n+new\n same\n--- a/x\n+++ b/x", "meaning")).toEqual([
      "text:@@ -1,2 +1,2 @@",
      "removed:-old",
      "added:+new",
      "text: same",
      "text:--- a/x",
      "text:+++ b/x",
    ]);
    expect(spans("-old\n+new", "meaning")).toEqual(["text:-old", "text:+new"]);
    expect(spans("@@ -1 +1 @@\n-old\n+new\n-rw-r--r--  1 me", "meaning")).toEqual(["text:@@ -1 +1 @@", "removed:-old", "added:+new", "text:-rw-r--r--  1 me"]);
    expect(spans("@@ -1 +1 @@\n-old", "links")).toEqual(["text:@@ -1 +1 @@", "text:-old"]);
    expect(spans("a.ts\n\nsrc/b.ts", "paths")).toEqual(["link:a.ts", "", "link:src/b.ts"]);
  });

  test("reads a changed line that looks like a file header by the hunk's line counts", () => {
    expect(spans("@@ -1,2 +1,2 @@\n--- comment\n+++ counter;\n same\n\\ No newline at end of file\n--- a/y\n+++ b/y\n@@ -0,0 +1 @@\n+new", "meaning")).toEqual([
      "text:@@ -1,2 +1,2 @@",
      "removed:--- comment",
      "added:+++ counter;",
      "text: same",
      "text:\\ No newline at end of file",
      "text:--- a/y",
      "text:+++ b/y",
      "text:@@ -0,0 +1 @@",
      "added:+new",
    ]);
  });
});

describe("paintOutput", () => {
  test("paints each role in its theme colour and the rest in the body text colour", () => {
    expect(paintOutput("ok\nsee /tmp/x\n@@ -1 +1 @@\n+a", tagged, "meaning")).toBe(
      "<success>ok</success>\n<text>see </text><mdLink>/tmp/x</mdLink>\n<text>@@ -1 +1 @@</text>\n<toolDiffAdded>+a</toolDiffAdded>",
    );
    expect(paintOutput("warn\nfatal\n-a", tagged, "meaning")).toBe("<warning>warn</warning>\n<error>fatal</error>\n<text>-a</text>");
  });
});

describe("cleanOutput", () => {
  test("drops terminal escapes, control characters and blank edges, and keeps indentation", () => {
    expect(cleanOutput("\n \n\u001b[31mred\u001b[0m\r\n  indented\u0007\ttab\n\n")).toBe("red\n  indented\ttab");
  });
});

const ok = { isPartial: false, isError: false };
const failed = { isPartial: false, isError: true };
const running = { isPartial: true, isError: false };

describe("shellDigest", () => {
  const cases: ReadonlyArray<readonly [string, string, unknown, typeof ok, Digest]> = [
    ["output", "a\nb", undefined, ok, { outcome: { status: "ok" }, tally: ["2 lines"], expandable: true }],
    ["no output", "(no output)", undefined, ok, { outcome: { status: "ok" }, tally: ["no output"], expandable: false }],
    ["an exit code", "a\n\nCommand exited with code 2", undefined, failed, { outcome: { status: "failed", reason: "exit 2" }, tally: ["1 line"], expandable: true }],
    ["an exit code after a trailing newline", "a\nb\n\n\nCommand exited with code 3", undefined, failed, { outcome: { status: "failed", reason: "exit 3" }, tally: ["2 lines"], expandable: true }],
    ["an exit code alone", "Command exited with code 1", undefined, failed, { outcome: { status: "failed", reason: "exit 1" }, tally: ["no output"], expandable: false }],
    ["a timeout", "(no output)\n\nCommand timed out after 5 seconds", undefined, failed, { outcome: { status: "failed", reason: "timed out after 5s" }, tally: ["no output"], expandable: false }],
    ["an abort", "x\n\nCommand aborted", undefined, failed, { outcome: { status: "failed", reason: "aborted" }, tally: ["1 line"], expandable: true }],
    ["a fractional timeout", "started\n\nCommand timed out after 0.25 seconds", undefined, failed, { outcome: { status: "failed", reason: "timed out after 0.25s" }, tally: ["1 line"], expandable: true }],
    ["a missing exit code", "Command terminated without an exit code", undefined, failed, { outcome: { status: "failed", reason: "no exit code" }, tally: ["no output"], expandable: false }],
    ["another error", "Working directory does not exist: /x\nCannot execute bash commands.", undefined, failed, { outcome: { status: "failed", reason: "Working directory does not exist: /x" }, tally: ["2 lines"], expandable: true }],
    ["truncated output", "tail", { truncation: { truncated: true, totalLines: 5000 } }, ok, { outcome: { status: "ok" }, tally: ["5000 lines"], expandable: true }],
    ["a running command", "a\nb\nc", undefined, running, { outcome: { status: "running" }, tally: ["3 lines"], expandable: true }],
    ["a successful command that prints a status", "Command aborted", undefined, ok, { outcome: { status: "ok" }, tally: ["1 line"], expandable: true }],
    ["a successful command that prints an exit code", "log\n\nCommand exited with code 2", undefined, ok, { outcome: { status: "ok" }, tally: ["3 lines"], expandable: true }],
  ];

  test.each(cases)("reads %s", (_name, text, details, flags, digest) => {
    expect(shellDigest(text, details, flags)).toEqual(digest);
  });
});

describe("the other digests", () => {
  test("count a read, grep, find or ls result without its continuation notice", () => {
    expect(textDigest("a\nb\n\n[Showing lines 1-2 of 9. Use offset=3 to continue.]", ok)).toEqual({ outcome: { status: "ok" }, tally: ["2 lines"], expandable: true });
    expect(textDigest("a\nb\n\n\n[3 more lines in file. Use offset=3 to continue.]", ok).tally).toEqual(["2 lines"]);
    expect(textDigest("File not found: x", failed)).toEqual({ outcome: { status: "failed", reason: "File not found: x" }, tally: [], expandable: true });
  });

  test("count the lines a write sent", () => {
    expect(writeDigest("a\nb\n", "Successfully wrote 4 bytes", ok)).toEqual({ outcome: { status: "ok" }, tally: ["2 lines"], expandable: true });
    expect(writeDigest("a", "EACCES: permission denied", failed).outcome).toEqual({ status: "failed", reason: "EACCES: permission denied" });
  });

  test("count another tool's output and the calls a script made, without its script header", () => {
    expect(toolDigest("a\nb", undefined, ok)).toEqual({ outcome: { status: "ok" }, tally: ["2 lines"], expandable: true });
    expect(toolDigest("", { calls: [{}, {}] }, running)).toEqual({ outcome: { status: "running" }, tally: ["2 calls", "no output"], expandable: true });
    expect(toolDigest("a\nScript error:\nTypeError: x is not a function\n    at main", { calls: [] }, failed)).toEqual({
      outcome: { status: "failed", reason: "TypeError: x is not a function" },
      tally: ["4 lines"],
      expandable: true,
    });
    expect(toolDigest("Script error:\nboom", undefined, failed).outcome).toEqual({ status: "failed", reason: "Script error:" });
  });

  test("count the lines an edit added and removed", () => {
    expect(editDigest("ok", { diff: "+1 a\n-2 b\n+3 c\n 4 d" }, ok)).toEqual({ outcome: { status: "ok" }, tally: ["+2 −1"], expandable: true });
    expect(editDigest("Could not find the text\nin x", undefined, failed)).toEqual({ outcome: { status: "failed", reason: "Could not find the text" }, tally: [], expandable: true });
  });
});

describe("summaryLine", () => {
  test("marks the outcome and dims the rest", () => {
    expect(summaryLine({ outcome: { status: "ok" }, tally: ["2 lines"], expandable: true }, tagged, "ctrl+o")).toBe("<success>✓</success> <dim>2 lines · ctrl+o to expand</dim>");
    expect(summaryLine({ outcome: { status: "failed", reason: "exit 2" }, tally: ["no output"], expandable: false }, tagged, "ctrl+o")).toBe(
      "<error>✗</error> <dim>exit 2 · no output</dim>",
    );
    expect(summaryLine({ outcome: { status: "running" }, tally: ["12 lines"], expandable: true }, tagged, "ctrl+o")).toBe("<dim>12 lines so far · ctrl+o to expand</dim>");
  });

  test("leaves the hint out when no key expands tools", () => {
    expect(summaryLine({ outcome: { status: "ok" }, tally: ["1 line"], expandable: true }, tagged, "")).toBe("<success>✓</success> <dim>1 line</dim>");
  });
});

type RenderCall = NonNullable<ToolRenderers["renderCall"]>;
type Context = Parameters<RenderCall>[2];
type Result = Parameters<NonNullable<ToolRenderers["renderResult"]>>[0];

const contextFor = (overrides: Partial<Context>): Context => ({
  args: {},
  toolCallId: "call",
  invalidate: () => {},
  lastComponent: undefined,
  state: { startedAt: 0, endedAt: 1400 },
  cwd: "/tmp",
  executionStarted: true,
  argsComplete: true,
  isPartial: false,
  expanded: false,
  showImages: false,
  isError: false,
  durationMs: undefined,
  outputPad: 1,
  ...overrides,
});

const rows = (component: Component): string[] => component.render(80).map((row) => stripVTControlCharacters(row).trimEnd());
const textResult = (text: string, details?: unknown): Result => ({ content: [{ type: "text", text }], details });

describe("transcriptRenderer over pi's own renderers", () => {
  const piRenderers: Readonly<Record<string, ToolRenderers>> = createAllToolRenderers();
  const definitions: Readonly<Record<string, ToolRenderers>> = { ...piRenderers, edit: { ...piRenderers.edit, renderShell: "self" }, codemode: codemodeRenderers };
  const folded = (tool: string): Required<Pick<ToolRenderers, "renderCall" | "renderResult">> => {
    const renderers = transcriptRenderer(() => "ctrl+o")(tool, () => definitions[tool]);
    if (!renderers?.renderCall || !renderers.renderResult) throw new Error(`no renderers for ${tool}`);
    return { renderCall: renderers.renderCall, renderResult: renderers.renderResult };
  };
  const render = (tool: string, args: unknown, result: Result, overrides: Partial<Context> = {}): string[] => {
    const context = contextFor({ args, ...overrides });
    const { renderCall, renderResult } = folded(tool);
    const call = renderCall(args, theme, context);
    return [...rows(call), ...rows(renderResult(result, { expanded: context.expanded, isPartial: context.isPartial }, theme, context))];
  };

  const longCommand = { command: "echo 1\necho 2\necho 3\necho 4\necho 5\necho 6" };

  test("folds a long bash command to its first rows and a dim count of the rest", () => {
    expect(rows(folded("bash").renderCall(longCommand, theme, contextFor({ args: longCommand })))).toEqual(["$ echo 1", "echo 2", "echo 3", "… 3 more lines · ctrl+o to expand"]);
  });

  test("names the gesture it is given in both folds", () => {
    const clicked = transcriptRenderer(() => "click")("bash", () => definitions.bash);
    if (!clicked?.renderCall || !clicked.renderResult) throw new Error("no renderers for bash");
    const context = contextFor({ args: longCommand });
    expect(rows(clicked.renderCall(longCommand, theme, context)).at(-1)).toBe("… 3 more lines · click to expand");
    expect(rows(clicked.renderResult(textResult("a\nb"), { expanded: false, isPartial: false }, theme, context))).toContain("✓ 2 lines · click to expand");
  });

  test("shows the whole command when expanded, and a short one whole either way", () => {
    expect(rows(folded("bash").renderCall(longCommand, theme, contextFor({ args: longCommand, expanded: true })))).toHaveLength(6);
    const short = { command: "echo 1\necho 2\necho 3\necho 4" };
    expect(rows(folded("bash").renderCall(short, theme, contextFor({ args: short })))).toEqual(["$ echo 1", "echo 2", "echo 3", "echo 4"]);
  });

  test("collapses bash output to one summary line and keeps pi's truncation warning and timing", () => {
    const details = { truncation: { truncated: true, truncatedBy: "lines", totalLines: 5000, outputLines: 2000 }, fullOutputPath: "/tmp/full.log" };
    expect(render("bash", { command: "seq 5000" }, textResult("4999\n5000\n\n[Showing lines 3001-5000 of 5000. Full output: /tmp/full.log]", details))).toEqual([
      "$ seq 5000",
      "",
      "✓ 5000 lines · ctrl+o to expand",
      "",
      "[Full output: /tmp/full.log. Truncated: showing 2000 of 5000 lines]",
      "",
      "Took 1.4s",
    ]);
  });

  test("keeps the exit code of a failed command in the summary", () => {
    expect(render("bash", { command: "false" }, textResult("boom\n\nCommand exited with code 1"), { isError: true })).toEqual([
      "$ false",
      "",
      "✗ exit 1 · 1 line · ctrl+o to expand",
      "",
      "Took 1.4s",
    ]);
  });

  test("keeps one blank row between expanded output and its exit status", () => {
    expect(render("bash", { command: "false" }, textResult("boom\n\n\nCommand exited with code 1"), { isError: true, expanded: true })).toEqual([
      "$ false",
      "",
      "boom",
      "",
      "Command exited with code 1",
      "",
      "Took 1.4s",
    ]);
  });

  test("keeps a status a successful command printed as its output", () => {
    expect(render("bash", { command: "printf 'Command aborted'" }, textResult("Command aborted"))).toEqual(["$ printf 'Command aborted'", "", "✓ 1 line · ctrl+o to expand", "", "Took 1.4s"]);
    expect(render("bash", { command: "cat log" }, textResult("done\n\n\nCommand exited with code 2"), { expanded: true })).toEqual([
      "$ cat log",
      "",
      "done",
      "",
      "",
      "Command exited with code 2",
      "",
      "Took 1.4s",
    ]);
  });

  test("colours expanded bash output by meaning instead of pi's grey", () => {
    const expanded = folded("bash").renderResult(
      textResult("src/a.ts:1: error TS2322\nsee /tmp/x\nall ok\n\nCommand exited with code 2"),
      { expanded: true, isPartial: false },
      theme,
      contextFor({ isError: true, expanded: true }),
    );
    const painted = expanded.render(60).join("\n");
    expect(painted).toContain(theme.fg("error", "src/a.ts:1: error TS2322"));
    expect(painted).toContain(theme.fg("text", "see ") + theme.fg("mdLink", "/tmp/x"));
    expect(painted).toContain(theme.fg("success", "all ok"));
    expect(painted).toContain(theme.fg("error", "Command exited with code 2"));
    expect(painted).not.toContain(theme.fg("toolOutput", "all ok"));
  });

  test("collapses read, grep, find and ls to a summary and keeps grep's limit warning", () => {
    expect(render("read", { path: "a.ts" }, textResult("const a = 1;\nconst b = 2;"))).toEqual(["read a.ts", "", "✓ 2 lines · ctrl+o to expand"]);
    expect(render("grep", { pattern: "x" }, textResult("a.ts:1: x\nb.ts:2: x", { matchLimitReached: 2 }))).toEqual([
      "grep /x/ in .",
      "",
      "✓ 2 lines · ctrl+o to expand",
      "",
      "[Truncated: 2 matches limit]",
    ]);
    expect(render("find", { pattern: "*.ts" }, textResult("a.ts"))).toEqual(["find *.ts in .", "", "✓ 1 line · ctrl+o to expand"]);
    expect(render("ls", {}, textResult("a/\nb.ts"))).toEqual(["ls .", "", "✓ 2 lines · ctrl+o to expand"]);
  });

  test("keeps pi's highlighting for an expanded read of a known language and colours the rest", () => {
    const source = textResult("const a = 1;");
    const expanded = { expanded: true, isPartial: false };
    const pi = piRenderers.read?.renderResult?.(source, expanded, theme, contextFor({ args: { path: "a.ts" }, expanded: true }));
    expect(folded("read").renderResult(source, expanded, theme, contextFor({ args: { path: "a.ts" }, expanded: true })).render(60)).toEqual(pi?.render(60) ?? []);
    const log = folded("read").renderResult(textResult("warning: slow\nERROR: down"), expanded, theme, contextFor({ args: { path: "app.log" }, expanded: true }));
    expect(log.render(60).join("\n")).toContain(theme.fg("error", "ERROR: down"));
  });

  const script = (output: string, calls: readonly unknown[]): Result => ({
    content: [
      { type: "text", text: "Script completed\nWall time 0.1 seconds\nOutput:\n" },
      { type: "text", text: output },
    ],
    details: { calls },
  });

  test("collapses codemode to a summary of its calls and output", () => {
    const calls = [{ name: "read", args: "{}", status: "ok", durationMs: 3 }];
    expect(render("codemode", { code: "text('ok')" }, script("ok", calls))).toEqual(["codemode", "text('ok')", "", "✓ 1 call · 1 line · ctrl+o to expand"]);
    expect(render("codemode", { code: "text('ok')" }, script("ok", calls), { expanded: true })).toEqual(["codemode", "text('ok')", "", "✓ read {} 3ms", "", "Took 1.4s", "", "ok"]);
  });

  test("colours expanded codemode output by meaning instead of pi's grey", () => {
    const context = contextFor({ args: { code: "" }, expanded: true });
    const painted = folded("codemode").renderResult(script("all ok\nsee /tmp/x", []), { expanded: true, isPartial: false }, theme, context).render(60).join("\n");
    expect(painted).toContain(theme.fg("success", "all ok"));
    expect(painted).toContain(theme.fg("mdLink", "/tmp/x"));
    expect(painted).not.toContain(theme.fg("toolOutput", "all ok"));
  });

  const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  const withImage = ({ content, details }: Result): Result => ({ content: [...content, { type: "image", data: PNG, mimeType: "image/png" }], details });

  test("counts a codemode image pi does not draw and keeps its fallback when opened", () => {
    const result = withImage(script("", []));
    expect(render("codemode", { code: "image(x)" }, result)).toEqual(["codemode", "image(x)", "", "✓ 1 image · ctrl+o to expand"]);
    expect(render("codemode", { code: "image(x)" }, result, { expanded: true })).toEqual(["codemode", "image(x)", "", "Took 1.4s", "", "[Image: [image/png] 1x1]"]);
  });

  test("counts a codemode image instead of saying the script printed nothing", () => {
    const calls = [{ name: "read", args: "{}", status: "ok", durationMs: 3 }];
    expect(render("codemode", { code: "image(x)" }, withImage(script("", calls)))).toEqual(["codemode", "image(x)", "", "✓ 1 call · 1 image · ctrl+o to expand"]);
  });

  test("counts a read image pi does not draw and keeps its fallback when opened", () => {
    const result = withImage(textResult("Read image file [image/png]"));
    expect(render("read", { path: "a.png" }, result)).toEqual(["read a.png", "", "✓ 1 line · 1 image · ctrl+o to expand"]);
    expect(render("read", { path: "a.png" }, result, { expanded: true })).toEqual(["read a.png", "", "Read image file [image/png]", "[Image: [image/png] 1x1]"]);
  });

  test("leaves an image pi draws itself out of the opened output", () => {
    setCapabilities({ images: "kitty", trueColor: true, hyperlinks: false });
    try {
      expect(render("codemode", { code: "image(x)" }, withImage(script("", [])), { expanded: true, showImages: true })).toEqual(["codemode", "image(x)", "", "Took 1.4s"]);
    } finally {
      resetCapabilitiesCache();
    }
  });

  test("collapses a tool that has no result renderer of its own", () => {
    const renderResult = foldRenderers("some_future_tool", {}, () => "ctrl+o")?.renderResult;
    const shown = (expanded: boolean): string[] =>
      renderResult ? rows(renderResult(script("1\n2\n3", []), { expanded, isPartial: false }, theme, contextFor({ expanded }))) : [];
    expect(shown(false)).toEqual(["", "✓ 3 lines · ctrl+o to expand"]);
    expect(shown(true)).toEqual(["", "1", "2", "3"]);
  });

  test("shows only the header of a collapsed write and its line count", () => {
    const args = { path: "a.txt", content: "one\ntwo\nthree\n" };
    expect(render("write", args, textResult("Successfully wrote 14 bytes to a.txt"))).toEqual(["write a.txt", "", "✓ 3 lines · ctrl+o to expand"]);
    expect(render("write", args, textResult("Successfully wrote 14 bytes to a.txt"), { expanded: true })).toEqual(["write a.txt", "", "one", "two", "three"]);
  });

  test("shows only the header of a collapsed edit, and pi's diff when expanded", () => {
    const args = { path: "a.txt", edits: [{ oldText: "old", newText: "new" }] };
    const result = textResult("Edited a.txt", { diff: "-1 old\n+1 new" });
    const editRows = (expanded: boolean): string[] => {
      const context = contextFor({ args, argsComplete: false, expanded, state: {} });
      const { renderCall, renderResult } = folded("edit");
      const call = renderCall(args, theme, context);
      const summary = renderResult(result, { expanded, isPartial: false }, theme, context);
      return [...rows(call), ...rows(summary)];
    };
    expect(editRows(false)).toEqual(["", " edit a.txt", "", " ✓ +1 −1 · ctrl+o to expand"]);
    expect(editRows(true).join("\n")).toContain("+1 new");
  });
});

describe("foldRenderers", () => {
  const component = (label: string): Component & { label: string } => ({ label, render: () => [label], invalidate: () => {} });

  test("leaves a tool with no definition to pi", () => {
    expect(foldRenderers("bash", undefined, () => "")).toBeUndefined();
  });

  test("hands pi's renderer back the component it built, not the wrapper", () => {
    const seen: unknown[] = [];
    const built = component("pi");
    const renderResult: NonNullable<ToolRenderers["renderResult"]> = (_result, _options, _theme, context) => {
      seen.push(context.lastComponent);
      return built;
    };
    const fold = foldRenderers("grep", { renderResult }, () => "")?.renderResult;
    const first = fold?.(textResult("a"), { expanded: false, isPartial: false }, theme, contextFor({}));
    fold?.(textResult("a"), { expanded: false, isPartial: false }, theme, contextFor({ lastComponent: first }));
    expect(seen).toEqual([undefined, built]);
  });
});
