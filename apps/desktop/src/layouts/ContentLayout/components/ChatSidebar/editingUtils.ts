import type { ChatMessage, RequestMessage, ResponseMessage, TextContent } from "@/types";
import { Role } from "@/constants";
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

export const formatGeneratedChatTitle = (title: string): string => title.trim().slice(0, 20);

export const shouldGenerateChatTitle = (
  chat: Pick<ChatMessage, "titleDirty">,
  hasTitleModelConfig: boolean
): boolean => chat.titleDirty === false && hasTitleModelConfig;

export const buildTitleSummaryMessages = (chat: ChatMessage): RequestMessage[] =>
  chat.messages
    .filter(message => message.role !== Role.System)
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
