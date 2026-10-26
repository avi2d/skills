import { readFileSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const CARRIAGE_VARIABLE = "SKILLS_EVAL_CARRIAGE";
const RULES = "skills-rule";

export default function carry(pi: ExtensionAPI): void {
  const path = process.env[CARRIAGE_VARIABLE];
  const content = path === undefined ? "" : readFileSync(path, "utf8");
  if (content.trim() === "") return;
  pi.on("context", (event) => ({
    messages: [{ role: "custom" as const, customType: RULES, content, display: false, timestamp: Date.now() }, ...event.messages],
  }));
}
