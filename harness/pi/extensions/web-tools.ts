import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export const WEB_PACKAGE = "pi-web-access";
export const SWITCH = "PI_WEB_TOOLS";

type Sourced = { readonly name: string; readonly sourceInfo: { readonly path: string } };

export function isWebTool(tool: Sourced): boolean {
  return tool.sourceInfo.path.split("/").includes(WEB_PACKAGE);
}

export function requested(env: Readonly<Record<string, string | undefined>>): boolean {
  return env[SWITCH] === "1";
}

export function withWebTools(
  active: readonly string[],
  web: readonly string[],
  on: boolean,
): string[] {
  const rest = active.filter((name) => !web.includes(name));
  return on ? [...rest, ...web] : rest;
}

export function parseSwitch(args: string): boolean | undefined {
  const word = args.trim();
  if (word === "on") return true;
  if (word === "off") return false;
  return undefined;
}

export default function (pi: ExtensionAPI): void {
  const webToolNames = () => pi.getAllTools().filter(isWebTool).map((t) => t.name);
  const set = (on: boolean) => pi.setActiveTools(withWebTools(pi.getActiveTools(), webToolNames(), on));

  pi.on("session_start", () => set(requested(process.env)));

  pi.registerCommand("web", {
    description: `Switch the ${WEB_PACKAGE} tools for this session: /web on, /web off`,
    handler: async (args, ctx) => {
      const on = parseSwitch(args);
      if (on === undefined) {
        ctx.ui.notify(`/web takes "on" or "off"`, "warning");
        return;
      }
      const web = webToolNames();
      if (web.length === 0) {
        ctx.ui.notify(`No ${WEB_PACKAGE} tools are installed`, "warning");
        return;
      }
      set(on);
      ctx.ui.notify(`Web tools ${on ? "on" : "off"}: ${web.join(", ")}`);
    },
  });
}
