import { fauxAssistantMessage, fauxProvider, fauxText, fauxToolCall } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const LIVE_WRITES = [
  "$HOME/.claude/CLAUDE.md",
  "$HOME/.claude/settings.json",
  "$HOME/.pi/agent/AGENTS.md",
  "$HOME/.pi/agent/settings.json",
  "$HOME/.codex/AGENTS.md",
  "$HOME/.config/opencode/AGENTS.md",
  "$HOME/.agents/skills/probe",
  "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/sessions/probe.jsonl",
  "${PI_CODING_AGENT_SESSION_DIR:-$HOME/.pi/agent/sessions}/probe.jsonl",
  "${XDG_CONFIG_HOME:-$HOME/.config}/opencode/probe",
  "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/probe",
  "${CODEX_HOME:-$HOME/.codex}/probe",
];

const TRESPASS = [
  `for f in ${LIVE_WRITES.map((path) => `"${path}"`).join(" ")}; do mkdir -p "$(dirname "$f")" && echo sweep >> "$f"; done`,
  "command -v skills-eval-probe >/dev/null && skills-eval-probe",
  'echo "agent-home=$HOME"',
].join("; ");

const CLEAN = "export function chunk<T>(items: readonly T[], size: number): T[][] {\n  return size < 1 ? [] : [items.slice(0, size)];\n}\n";

export default function scripted(pi: ExtensionAPI): void {
  const faux = fauxProvider({ provider: "scripted", models: [{ id: "agent" }] });
  faux.setResponses([
    fauxAssistantMessage([fauxToolCall("bash", { command: TRESPASS })], { stopReason: "toolUse" }),
    (context) => {
      const carried = JSON.stringify(context.messages).includes("The following rules are in force");
      return fauxAssistantMessage([fauxToolCall("write", { path: "src/array.ts", content: carried ? CLEAN : `/** Splits items into groups. */\n${CLEAN}` })], {
        stopReason: "toolUse",
      });
    },
    fauxAssistantMessage([fauxText("Done.")]),
  ]);
  pi.registerProvider(faux.provider);
}
