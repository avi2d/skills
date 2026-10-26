import { describe, expect, test } from "bun:test";
import { CustomEditor, type TerminalInputHandler, TreeSelectorComponent } from "@earendil-works/pi-coding-agent";
import { type Component, TuiAltScreen, TuiMainScreen, type TUI } from "@earendil-works/pi-tui";
import install, { type Context, copySelectionOn, type Pi, WIDGET } from "../../harness/pi/extensions/copy-selection";

const CTRL_X = "\x18";
const SUPER_C = "\x1b[99;9u";
const CTRL_X_RELEASE = "\x1b[120;5:3u";
const SUPER_C_RELEASE = "\x1b[99;9:3u";

const EDITOR: Component = Object.create(CustomEditor.prototype);
const TREE: Component = Object.create(TreeSelectorComponent.prototype);

function altScreen(
  selected: string | undefined,
  focused: Component | null = TREE,
): { screen: TuiAltScreen; copied: string[] } {
  const copied: string[] = [];
  const screen: TuiAltScreen = Object.create(TuiAltScreen.prototype);
  screen.getFocusedComponent = () => focused;
  screen.hasActiveSelection = () => selected !== undefined;
  screen.copyActiveSelectionToClipboard = async () => {
    if (selected === undefined) return false;
    copied.push(selected);
    return true;
  };
  return { screen, copied };
}

describe("copySelectionOn", () => {
  test("copies the selection on ctrl+x and on super+c and consumes the key", () => {
    for (const key of [CTRL_X, SUPER_C]) {
      const { screen, copied } = altScreen("SELECTED");
      expect(copySelectionOn(screen, key)).toEqual({ consume: true });
      expect(copied).toEqual(["SELECTED"]);
    }
  });

  test("copies the selection whatever has focus", () => {
    for (const focused of [EDITOR, TREE, null]) {
      const { screen, copied } = altScreen("SELECTED", focused);
      expect(copySelectionOn(screen, SUPER_C)).toEqual({ consume: true });
      expect(copied).toEqual(["SELECTED"]);
    }
  });

  test("swallows a copy key in the editor when nothing is selected, so the editor never falls back to the last reply", () => {
    for (const key of [CTRL_X, SUPER_C]) {
      const { screen, copied } = altScreen(undefined, EDITOR);
      expect(copySelectionOn(screen, key)).toEqual({ consume: true });
      expect(copied).toEqual([]);
    }
  });

  test("swallows a copy key in the editor outside the fullscreen view", () => {
    const screen: TuiMainScreen = Object.create(TuiMainScreen.prototype);
    screen.getFocusedComponent = () => EDITOR;
    expect(copySelectionOn(screen, CTRL_X)).toEqual({ consume: true });
  });

  test("lets a copy key through to a picker when nothing is selected, so the picker copies its highlighted entry", () => {
    for (const key of [CTRL_X, SUPER_C]) {
      const { screen, copied } = altScreen(undefined, TREE);
      expect(copySelectionOn(screen, key)).toBeUndefined();
      expect(copied).toEqual([]);
    }
  });

  test("lets the release of a copy key through without copying again", () => {
    for (const key of [CTRL_X_RELEASE, SUPER_C_RELEASE]) {
      const { screen, copied } = altScreen("SELECTED", EDITOR);
      expect(copySelectionOn(screen, key)).toBeUndefined();
      expect(copied).toEqual([]);
    }
  });

  test("lets every other key through while a selection is active", () => {
    const { screen, copied } = altScreen("SELECTED", EDITOR);
    expect(copySelectionOn(screen, "c")).toBeUndefined();
    expect(copySelectionOn(screen, "\x03")).toBeUndefined();
    expect(copied).toEqual([]);
  });

  test("lets a copy key through while it holds no screen", () => {
    expect(copySelectionOn(undefined, CTRL_X)).toBeUndefined();
  });
});

function started(mode: string, tui: TUI) {
  const widgets: (string | undefined)[] = [];
  const listeners: TerminalInputHandler[] = [];
  const ctx: Context = {
    mode,
    ui: {
      setWidget: (key: string, content: ((tui: TUI) => Component) | undefined) => {
        widgets.push(content === undefined ? undefined : key);
        content?.(tui);
      },
      onTerminalInput: (handler: TerminalInputHandler) => listeners.push(handler),
    },
  };
  const pi: Pi = { on: (_event, handler) => handler({}, ctx) };
  install(pi);
  return { widgets, listeners };
}

describe("install", () => {
  test("listens for the copy keys on the TUI pi hands its widget factory, and leaves no widget behind", () => {
    const { screen, copied } = altScreen("SELECTED");
    const { widgets, listeners } = started("tui", screen);
    expect(widgets).toEqual([WIDGET, undefined]);
    expect(listeners.map((listen) => listen(SUPER_C))).toEqual([{ consume: true }]);
    expect(copied).toEqual(["SELECTED"]);
  });

  test("does nothing outside the TUI", () => {
    const { screen } = altScreen("SELECTED");
    expect(started("rpc", screen)).toEqual({ widgets: [], listeners: [] });
  });
});
