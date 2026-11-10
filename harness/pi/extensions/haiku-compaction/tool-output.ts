import { convertToLlm, serializeConversation } from "@earendil-works/pi-coding-agent";
import { contentText } from "@earendil-works/pi-ai";
import type { AgentMessage } from "@earendil-works/pi-agent-core";

function toolOutputStubOf(chars: number): string {
  return `[output hidden before summarizing: ${String(chars)} chars]`;
}

// An error result stays whole: the summary prompt asks for exact error messages.
function hideToolOutput(messages: readonly AgentMessage[]): AgentMessage[] {
  return messages.map((message) => {
    if (message.role !== "toolResult" || message.isError) return message;
    const chars = contentText(message.content, "").length;
    return { ...message, content: [{ type: "text", text: toolOutputStubOf(chars) }] };
  });
}

export function historyConversationOf(messages: readonly AgentMessage[]): string {
  return serializeConversation(convertToLlm(hideToolOutput(messages)));
}
