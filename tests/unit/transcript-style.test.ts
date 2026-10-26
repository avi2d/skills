import { beforeAll, describe, expect, test } from "bun:test";
import { AssistantMessageComponent, initTheme, Theme, type ToolRenderers } from "@earendil-works/pi-coding-agent";
import { type Component, type TUI, TuiAltScreen, TuiMainScreen } from "@earendil-works/pi-tui";
import {
  bashRenderer,
  commandHeader,
  EDGE,
  expandGesture,
  isCaptainSession,
  tuiOf,
  WIDGET,
  patchReplies,
  styleReply,
  tokenize,
  withShellHeader,
  type CommandTheme,
  type Patchable,
  type ReplyTheme,
} from "../../harness/pi/extensions/transcript-style/index";

const tagged = (token: string, text: string): string => `<${token}>${text}</${token}>`;

const commandTheme: CommandTheme = {
  fg: tagged,
  bold: (text) => `*${text}*`,
  italic: (text) => `_${text}_`,
};

const replyTheme: ReplyTheme = {
  fg: tagged,
  style: (text, options) => {
    expect(options.bg).toBe("userMessageBg");
    return `[bg]${text}[/bg]`;
  },
};

const terminalDefaultTheme = new Theme(
  {
    accent: "#a798d7",
    border: "",
    borderAccent: "",
    borderMuted: "",
    success: "",
    error: "",
    warning: "",
    muted: "",
    dim: "",
    text: "",
    thinkingText: "",
    userMessageText: "",
    customMessageText: "",
    customMessageLabel: "",
    toolTitle: "",
    toolOutput: "",
    mdHeading: "",
    mdLink: "",
    mdLinkUrl: "",
    mdCode: "",
    mdCodeBlock: "",
    mdCodeBlockBorder: "",
    mdQuote: "",
    mdQuoteBorder: "",
    mdHr: "",
    mdListBullet: "",
    toolDiffAdded: "",
    toolDiffRemoved: "",
    toolDiffContext: "",
    syntaxComment: "",
    syntaxKeyword: "",
    syntaxFunction: "",
    syntaxVariable: "",
    syntaxString: "",
    syntaxNumber: "",
    syntaxType: "",
    syntaxOperator: "",
    syntaxPunctuation: "",
    thinkingOff: "",
    thinkingMinimal: "",
    thinkingLow: "",
    thinkingMedium: "",
    thinkingHigh: "",
    thinkingXhigh: "",
    bashMode: "",
  },
  {
    selectedBg: "",
    userMessageBg: "",
    customMessageBg: "",
    toolPendingBg: "",
    toolSuccessBg: "",
    toolErrorBg: "",
  },
  "truecolor",
);

const EDGE_CELL = `[bg]<accent>${EDGE}</accent>[/bg]`;

describe("tokenize", () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ["ls -la | head -3", "command:ls flag:-la operator:| command:head flag:-3"],
    ['FM_HOME="$HOME/x" gh-axi pr list', 'variable:FM_HOME operator:= string:"$HOME/x" command:gh-axi word:pr word:list'],
    ["A=$HOME/bin B=1 make -j4", "variable:A operator:= variable:$HOME word:/bin variable:B operator:= word:1 command:make flag:-j4"],
    ["A= && ls", "variable:A operator:= operator:&& command:ls"],
    ["cd /tmp && git status; echo $?", "command:cd word:/tmp operator:&& command:git word:status operator:; command:echo variable:$?"],
    ["foo 2>&1 >/dev/null # note", "command:foo operator:2>&1 operator:> word:/dev/null comment:# note"],
    ["if [ -f x ]; then sudo rm -rf x; fi", "keyword:if command:[ flag:-f word:x word:] operator:; keyword:then command:sudo command:rm flag:-rf word:x operator:; keyword:fi"],
    ["timeout 5 env FOO=1 npm test -- --watch", "command:timeout number:5 command:env variable:FOO operator:= word:1 command:npm word:test flag:-- flag:--watch"],
    ["{ echo a; } > out", "keyword:{ command:echo word:a operator:; keyword:} operator:> word:out"],
    ["echo $(date +%s) 'a b'", "command:echo operator:$( command:date word:+%s operator:) string:'a b'"],
    ["printf 'x\\n' | xargs -I{} grep -n {} f", "command:printf string:'x\\n' operator:| command:xargs flag:-I{} command:grep flag:-n word:{} word:f"],
    ["cat - <<EOF\nls", "command:cat word:- operator:<< word:EOF string:ls"],
    ["'my tool' --flag", "command:'my tool' flag:--flag"],
    ["sudo -u root rm file", "command:sudo flag:-u word:root command:rm word:file"],
    ["env -u FOO printenv", "command:env flag:-u word:FOO command:printenv"],
    ["xargs -I {} grep x", "command:xargs flag:-I word:{} command:grep word:x"],
    ["timeout -s KILL 5s make", "command:timeout flag:-s word:KILL number:5s command:make"],
    ['FOO=prefix"$HOME" npm test', 'variable:FOO operator:= word:prefix string:"$HOME" command:npm word:test'],
    [">out printf hi", "operator:> word:out command:printf word:hi"],
    ["printf %s foo\\|bar", "command:printf word:%s word:foo\\|bar"],
    ["cat <<EOF\nls\nEOF\npwd", "command:cat operator:<< word:EOF string:ls\nEOF command:pwd"],
    ["cat <<'EOF' | sh\necho $HOME\nEOF", "command:cat operator:<< string:'EOF' operator:| command:sh string:echo $HOME\nEOF"],
    ["grep x <<< \"$y\"", 'command:grep word:x operator:<<< string:"$y"'],
    ["make |& tee log", "command:make operator:|& command:tee word:log"],
    ["curl \\\n  -s url", "command:curl flag:-s word:url"],
    ["sudo --user root rm file", "command:sudo flag:--user word:root command:rm word:file"],
    ["env --unset FOO printenv", "command:env flag:--unset word:FOO command:printenv"],
    ["xargs --max-args 1 grep x", "command:xargs flag:--max-args word:1 command:grep word:x"],
    ["xargs --replace {} grep x", "command:xargs flag:--replace command:{} word:grep word:x"],
    ["xargs --replace={} grep x", "command:xargs flag:--replace={} command:grep word:x"],
    ["2>&1 printf hi", "operator:2>&1 command:printf word:hi"],
    ["exec 3<&0 4>&- cat", "command:exec operator:3<&0 operator:4>&- command:cat"],
    ["FOO=$(pwd) npm test", "variable:FOO operator:= operator:$( command:pwd operator:) command:npm word:test"],
    ["FOO=$(pwd)/x npm", "variable:FOO operator:= operator:$( command:pwd operator:) word:/x command:npm"],
    ["echo `date` file", "command:echo operator:` command:date operator:` word:file"],
    ["$(dirname $0)/run arg", "operator:$( command:dirname variable:$0 operator:) word:/run word:arg"],
    ["sudo -u $(whoami) rm x", "command:sudo flag:-u operator:$( command:whoami operator:) command:rm word:x"],
    ["(cd /tmp; ls) | wc -l", "operator:( command:cd word:/tmp operator:; command:ls operator:) operator:| command:wc flag:-l"],
    ["curl $URL#section | head -1", "command:curl variable:$URL word:#section operator:| command:head flag:-1"],
    [`printf '%s' "foo"#bar | head`, `command:printf string:'%s' string:"foo" word:#bar operator:| command:head`],
    ["echo $(date)#x | wc", "command:echo operator:$( command:date operator:) word:#x operator:| command:wc"],
    ["ls # list | not a pipe", "command:ls comment:# list | not a pipe"],
  ];

  test.each(cases)("%p", (command, expected) => {
    const kinds = tokenize(command)
      .filter((token) => token.kind !== "space")
      .map((token) => `${token.kind}:${token.text}`)
      .join(" ");
    expect(kinds).toBe(expected);
  });

  test("keeps every character of the command, in order", () => {
    for (const command of ["a=1 b\t'c d'  | e \"f\\\"g\" # h\n i", "cat <<-A <<B >x\n\tone\n\tA\ntwo\nB\nls \\\n -l foo\\|bar \\"]) {
      expect(
        tokenize(command)
          .map((token) => token.text)
          .join(""),
      ).toBe(command);
    }
  });
});

describe("commandHeader", () => {
  test("paints each part of the command in its own theme colour", () => {
    expect(commandHeader('grep -n "x" f | wc -l', undefined, commandTheme)).toBe(
      "<dim>$</dim> *<syntaxFunction>grep</syntaxFunction>* <syntaxType>-n</syntaxType> <muted>\"x\"</muted> <text>f</text> <syntaxOperator>|</syntaxOperator> *<syntaxFunction>wc</syntaxFunction>* <syntaxType>-l</syntaxType>",
    );
  });

  test("keeps pi's timeout suffix", () => {
    expect(commandHeader("make", 120, commandTheme)).toBe("<dim>$</dim> *<syntaxFunction>make</syntaxFunction>*<muted> (timeout 120s)</muted>");
  });
});

describe("withShellHeader", () => {
  function piHeader(): { text: string; setText(text: string): void; render(): string[]; invalidate(): void } {
    return {
      text: "pi's own header",
      setText(text) {
        this.text = text;
      },
      render: () => [],
      invalidate() {},
    };
  }

  test("redraws pi's bash header after pi has drawn it", () => {
    const header = piHeader();
    const calls: unknown[] = [];
    const renderCall = withShellHeader((args: unknown, _theme: CommandTheme, context: string) => {
      calls.push(args, context);
      return header;
    });
    expect(renderCall({ command: "ls -l", timeout: 5 }, commandTheme, "context")).toBe(header);
    expect(calls).toEqual([{ command: "ls -l", timeout: 5 }, "context"]);
    expect(header.text).toBe("<dim>$</dim> *<syntaxFunction>ls</syntaxFunction>* <syntaxType>-l</syntaxType><muted> (timeout 5s)</muted>");
  });

  test("leaves pi's header while the command has not streamed in", () => {
    const header = piHeader();
    const renderCall = withShellHeader((_args: unknown, _theme: CommandTheme, _context: undefined) => header);
    renderCall({ command: "" }, commandTheme, undefined);
    renderCall(undefined, commandTheme, undefined);
    expect(header.text).toBe("pi's own header");
  });
});

describe("bashRenderer", () => {
  const renderResult = () => ({ render: () => [], invalidate() {} });
  const builtIn: ToolRenderers = { renderCall: renderResult, renderResult };

  test("replaces only the bash call header and keeps pi's result renderer", () => {
    const renderers = bashRenderer("bash", () => builtIn);
    expect(renderers?.renderCall).not.toBe(builtIn.renderCall);
    expect(renderers?.renderResult).toBe(renderResult);
  });

  test("passes every other tool through untouched", () => {
    expect(bashRenderer("read", () => builtIn)).toBe(builtIn);
    expect(bashRenderer("bash", () => undefined)).toBeUndefined();
    expect(bashRenderer("bash", () => ({ renderResult }))).toEqual({ renderResult });
  });
});

describe("expandGesture", () => {
  test("is a click where pi routes the mouse to a tool block, and pi's expand key everywhere else", () => {
    expect(expandGesture("fullscreen", "ctrl+o")).toBe("click");
    expect(expandGesture("regular", "ctrl+o")).toBe("ctrl+o");
    expect(expandGesture(undefined, "ctrl+o")).toBe("ctrl+o");
  });
});

describe("tuiOf", () => {
  test("returns the TUI pi hands its widget factory, and leaves no widget behind", () => {
    for (const screen of [Object.create(TuiAltScreen.prototype), Object.create(TuiMainScreen.prototype)]) {
      const widgets: (string | undefined)[] = [];
      const ui = {
        setWidget: (key: string, content: ((tui: TUI) => Component) | undefined) => {
          widgets.push(content === undefined ? undefined : key);
          content?.(screen);
        },
      };
      expect(tuiOf(ui)).toBe(screen);
      expect(widgets).toEqual([WIDGET, undefined]);
    }
  });

  test("returns nothing when pi never calls the factory", () => {
    expect(tuiOf({ setWidget: () => {} })).toBeUndefined();
  });
});

describe("isCaptainSession", () => {
  test("is the session Firstmate launched no pane for", () => {
    expect(isCaptainSession({})).toBe(true);
    expect(isCaptainSession({ FM_TASK_INBOX: "" })).toBe(true);
    expect(isCaptainSession({ FM_TASK_INBOX: "/home/state/task.inbox" })).toBe(false);
  });
});

type Message = Parameters<AssistantMessageComponent["updateContent"]>[0];

const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };

const message = (content: Message["content"], stopReason: Message["stopReason"]): Message => ({
  role: "assistant",
  content,
  api: "anthropic-messages",
  provider: "test",
  model: "test",
  usage,
  stopReason,
  timestamp: 0,
});

const reply = message([{ type: "thinking", thinking: "plan" }, { type: "text", text: "Captain, **done**." }], "stop");

function rendered(update: Message, streaming: boolean): { styled: boolean; lines: string[] } {
  const component = new AssistantMessageComponent(undefined, true);
  component.updateContent(update, streaming);
  const styled = styleReply(component, replyTheme);
  return { styled, lines: component.render(40) };
}

describe("styleReply", () => {
  beforeAll(() => initTheme("dark", false));

  test("puts a finished reply on the user message background behind an accent edge, with a row of padding each side", () => {
    const { styled, lines } = rendered(reply, false);
    expect(styled).toBe(true);
    const banded = lines.filter((line) => line.includes(EDGE_CELL));
    expect(banded).toHaveLength(3);
    for (const line of banded) expect(line.startsWith(EDGE_CELL) || line.includes(`\u0007${EDGE_CELL}`)).toBe(true);
    expect(banded[1]).toContain("Captain,");
  });

  test("paints the band in the background pi gives a user message when the theme leaves it to the terminal", () => {
    const component = new AssistantMessageComponent(undefined, true);
    component.updateContent(reply, false);
    expect(styleReply(component, terminalDefaultTheme)).toBe(true);
    const banded = component.render(40).filter((line) => line.includes(EDGE));
    expect(banded).toHaveLength(3);
    for (const line of banded) {
      expect(line).toContain(terminalDefaultTheme.getBgAnsi("userMessageBg"));
      expect(line).not.toContain("\x1b[48;");
    }
  });

  test("leaves the thinking label off the band", () => {
    const thinking = rendered(reply, false).lines.find((line) => line.includes("Thinking"));
    expect(thinking).toBeDefined();
    expect(thinking).not.toContain("[bg]");
  });

  test("leaves a reply that is still streaming as pi draws it", () => {
    const { styled, lines } = rendered(reply, true);
    expect(styled).toBe(false);
    expect(lines.join("\n")).not.toContain("[bg]");
  });

  test("leaves a message that goes on to call a tool as pi draws it", () => {
    const toolTurn = message([{ type: "text", text: "Checking." }, { type: "toolCall", id: "1", name: "bash", arguments: { command: "ls" } }], "toolUse");
    expect(rendered(toolTurn, false).styled).toBe(false);
  });

  test("falls back to pi's look, without throwing, when the component's shape changes", () => {
    expect(styleReply({}, replyTheme)).toBe(false);
    expect(styleReply({ hasToolCalls: false, isStreaming: false }, replyTheme)).toBe(false);
    expect(styleReply({ hasToolCalls: false, isStreaming: false, contentContainer: { children: [{ render: () => [] }] } }, replyTheme)).toBe(false);
    expect(styleReply({ hasToolCalls: "no", isStreaming: false, contentContainer: { children: [] } }, replyTheme)).toBe(false);
  });
});

describe("patchReplies", () => {
  function prototype(): { proto: Patchable; calls: string[] } {
    const calls: string[] = [];
    const proto: Patchable = {
      updateContent: () => {
        calls.push("pi");
      },
    };
    return { proto, calls };
  }

  test("styles after pi's own update", () => {
    const { proto, calls } = prototype();
    expect(patchReplies(proto, () => calls.push("style"))).toBeFunction();
    proto.updateContent(reply);
    expect(calls).toEqual(["pi", "style"]);
  });

  test("wraps pi's method once however often the extension reloads", () => {
    const { proto, calls } = prototype();
    patchReplies(proto, () => calls.push("first load"));
    patchReplies(proto, () => calls.push("reload"));
    proto.updateContent(reply);
    expect(calls).toEqual(["pi", "reload"]);
  });

  test("gives pi its own method back when the extension shuts down", () => {
    const { proto, calls } = prototype();
    const pi = proto.updateContent;
    patchReplies(proto, () => calls.push("style"))?.();
    expect(proto.updateContent).toBe(pi);
    proto.updateContent(reply);
    expect(calls).toEqual(["pi"]);
  });

  test("leaves the wrapper of a later load in place when an earlier load shuts down", () => {
    const { proto, calls } = prototype();
    const restoreFirst = patchReplies(proto, () => calls.push("first load"));
    patchReplies(proto, () => calls.push("reload"));
    restoreFirst?.();
    proto.updateContent(reply);
    expect(calls).toEqual(["pi", "reload"]);
  });

  test("patches nothing when pi no longer has the method", () => {
    const proto: Partial<Patchable> = {};
    expect(patchReplies(proto, () => {})).toBeUndefined();
    expect(proto).toEqual({});
  });
});
