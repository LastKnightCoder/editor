import type { ChatSessionMessage, ResponseMessage } from "@/types";

/** 只重试末尾尚无正文或工具调用的一问，已有结果与后续对话必须保留为版本。 */
export function canRetryChatMessage(messages: ChatSessionMessage[], index: number): boolean {
  if (messages[index]?.role !== "user") return false;
  return messages.slice(index + 1).every(message => {
    if (message.role !== "assistant") return false;
    const answer = message as ResponseMessage;
    return (
      !answer.content.trim() &&
      !answer.tool_calls?.length &&
      !(answer.assistant_blocks ?? []).some(
        block => block.type === "tool_call" || (block.type === "text" && block.content.trim())
      )
    );
  });
}
