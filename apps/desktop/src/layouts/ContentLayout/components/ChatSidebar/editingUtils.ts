import { produce } from "immer";
import type { ChatMessage, RequestMessage, ResponseMessage, TextContent } from "@/types";
import { Role } from "@/constants";
import { buildAssistantHistoryMessages } from "@/services/assistantMessageBlocks";
import { isAbortError } from "@tau/agent";

export const shouldRestoreInputAfterSendError = (error: unknown): boolean => !isAbortError(error);

export const getRequestMessageText = (message: RequestMessage): string => {
  if (typeof message.content === "string") {
    return message.content;
  }

  return message.content
    .filter((item): item is TextContent => item.type === "text")
    .map(item => item.text)
    .join("\n");
};

export const getLastUserMessageIndex = (messages: ChatMessage["messages"]): number =>
  messages.reduce((lastIndex, message, index) => {
    if (message.role === Role.User) {
      return index;
    }
    return lastIndex;
  }, -1);

export const formatGeneratedChatTitle = (title: string): string => title.trim().slice(0, 20);

export const shouldGenerateChatTitle = (
  chat: Pick<ChatMessage, "titleDirty">,
  hasTitleModelConfig: boolean
): boolean => chat.titleDirty === false && hasTitleModelConfig;

export const buildTitleSummaryMessages = (chat: ChatMessage): RequestMessage[] =>
  chat.messages
    .slice(1)
    .slice(-2)
    .map((message): RequestMessage => {
      if (message.role === Role.User) {
        const userMessage = message as RequestMessage;
        const sourceContent = userMessage.content;
        const textContent = Array.isArray(sourceContent)
          ? sourceContent.filter(
              (item): item is TextContent => item.type === "text" && item.text.trim().length > 0
            )
          : sourceContent
            ? [
                {
                  type: "text",
                  text: sourceContent,
                } as TextContent,
              ]
            : [];
        return {
          role: message.role,
          content: textContent,
        };
      }

      const responseMsg = message as ResponseMessage;
      return {
        role: message.role,
        content: [{ type: "text", text: responseMsg.content }],
      };
    })
    .filter(
      message =>
        Array.isArray(message.content) &&
        message.content.length > 0 &&
        message.content.some(item => item.type === "text" && item.text.trim().length > 0)
    );

export const buildResetBaseChat = (
  chat: ChatMessage,
  visibleMessageIndex: number
): ChatMessage | null => {
  const actualIndex = visibleMessageIndex + 1;
  const targetMessage = chat.messages[actualIndex];
  if (!targetMessage || targetMessage.role !== Role.User) {
    return null;
  }

  return produce(chat, draft => {
    draft.messages = draft.messages.slice(0, actualIndex);
  });
};

export const buildFullHistoryMessages = (
  chat: ChatMessage,
  options?: {
    excludeMessageIndex?: number;
  }
): RequestMessage[] =>
  chat.messages
    .slice(1)
    .map((message, index) => ({
      message,
      originIndex: index + 1,
    }))
    .filter(({ originIndex }) => originIndex !== options?.excludeMessageIndex)
    .flatMap(({ message }): RequestMessage[] => {
      if (message.role === Role.User || message.role === Role.Tool) {
        return [message as RequestMessage];
      }

      return buildAssistantHistoryMessages(message as ResponseMessage);
    });
