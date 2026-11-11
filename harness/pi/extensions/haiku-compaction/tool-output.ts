import { convertToLlm, serializeConversation } from "@earendil-works/pi-coding-agent";
import { contentText } from "@earendil-works/pi-ai";
import type { AgentMessage } from "@earendil-works/pi-agent-core";

const TOOL_OUTPUT_STUB_MIN_CHARS = 100;

function balancedParens(url: string): string {
  let open = 0;
  let end = url.length;
  let i = 0;
  for (const char of url) {
    if (char === "(") open += 1;
    else if (char === ")") {
      if (open === 0) {
        end = i;
        break;
      }
      open -= 1;
    }
    i += 1;
  }
  return url.slice(0, end).replace(/[.,;:!?*`]+$/, "");
}

function urlsOf(text: string): string[] {
  const found = text.match(/https?:\/\/[^\s<>\]"'`*]+/g) ?? [];
  return [...new Set(found.map((url) => balancedParens(url)))];
}

function toolOutputStubOf(chars: number, urls: readonly string[]): string {
  const kept = urls.length > 0 ? `; urls: ${urls.join(" ")}` : "";
  return `[output hidden before summarizing: ${String(chars)} chars${kept}]`;
}

// An error result is not hidden: the summary prompt asks for exact error messages.
function hideToolOutput(messages: readonly AgentMessage[]): AgentMessage[] {
  return messages.map((message) => {
    if (message.role !== "toolResult" || message.isError) return message;
    const text = contentText(message.content, "");
    if (text.length <= TOOL_OUTPUT_STUB_MIN_CHARS) return message;
    const stub = toolOutputStubOf(text.length, urlsOf(text));
    if (stub.length >= text.length) return message;
    return { ...message, content: [{ type: "text", text: stub }] };
  });
}

export function historyConversationOf(messages: readonly AgentMessage[]): string {
  return serializeConversation(convertToLlm(hideToolOutput(messages)));
}
