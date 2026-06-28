import type { ChatMessage, ResponseMessage } from "@/types";
import { Role } from "@/constants";
import { getAssistantContentBlocks } from "@/services/assistantMessageBlocks";

export const withStreamingUpdateTime = <
  T extends Pick<ChatMessage, "updateTime">,
>(
  chat: T,
  now = Date.now(),
): T => ({
  ...chat,
  updateTime: Math.max(chat.updateTime || 0, now),
});

const getAssistantStreamVersion = (message: ResponseMessage): string => {
  const blocks = getAssistantContentBlocks(message);
  return blocks
    .map((block) => {
      if (block.type === "text" || block.type === "reasoning") {
        return `${block.type}:${block.content.length}:${block.content}`;
      }

      return `tool_calls:${block.executions
        .map(
          (execution) =>
            `${execution.toolCallId}:${execution.status}:${execution.input}:${execution.output || ""}:${execution.error || ""}`,
        )
        .join("|")}`;
    })
    .join("||");
};

export const getStreamingScrollKey = (
  chat: Pick<ChatMessage, "id" | "messages">,
  visibleMessageCount: number,
): string => {
  const lastMessage = chat.messages[chat.messages.length - 1];
  const lastAssistantVersion =
    lastMessage?.role === Role.Assistant
      ? getAssistantStreamVersion(lastMessage as ResponseMessage)
      : "";

  return `${chat.id}:${visibleMessageCount}:${lastAssistantVersion}`;
};
