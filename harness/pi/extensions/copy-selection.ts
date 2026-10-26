import { CustomEditor, type TerminalInputHandler } from "@earendil-works/pi-coding-agent";
import { type Component, isKeyRelease, matchesKey, TuiAltScreen, TuiMainScreen, type TUI } from "@earendil-works/pi-tui";

export const COPY_KEYS = ["ctrl+x", "super+c"] as const;

export const WIDGET = "copy-selection";

export type Screen = TuiAltScreen | TuiMainScreen;

export type Context = {
  readonly mode: string;
  readonly ui: {
    setWidget(key: string, content: ((tui: TUI) => Component) | undefined): void;
    onTerminalInput(handler: TerminalInputHandler): unknown;
  };
};

export type Pi = {
  on(event: "session_start", handler: (event: unknown, ctx: Context) => void): unknown;
};

export function isCopyKey(data: string): boolean {
  return !isKeyRelease(data) && COPY_KEYS.some((key) => matchesKey(data, key));
}

export function copySelectionOn(screen: Screen | undefined, data: string): { consume: true } | undefined {
  if (!isCopyKey(data) || screen === undefined) return undefined;
  if (screen instanceof TuiAltScreen && screen.hasActiveSelection()) {
    void screen.copyActiveSelectionToClipboard();
    return { consume: true };
  }
  // Only the editor's app.message.copy falls back to the last reply; a picker copies its own highlighted entry.
  return screen.getFocusedComponent() instanceof CustomEditor ? { consume: true } : undefined;
}

export default function (pi: Pi): void {
  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    let screen: Screen | undefined;
    // Pi hands an extension its TUI only through a component factory, which it calls before setWidget returns.
    ctx.ui.setWidget(WIDGET, (tui) => {
      if (tui instanceof TuiAltScreen || tui instanceof TuiMainScreen) screen = tui;
      return { render: () => [], invalidate: () => {} };
    });
    ctx.ui.setWidget(WIDGET, undefined);
    ctx.ui.onTerminalInput((data) => copySelectionOn(screen, data));
  });
}
