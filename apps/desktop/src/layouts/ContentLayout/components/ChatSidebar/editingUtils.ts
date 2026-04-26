import { produce } from "immer";
import type { ChatMessage, RequestMessage, TextContent } from "@/types";
import { Role } from "@/constants";

export const getRequestMessageText = (message: RequestMessage): string => {
  if (typeof message.content === "string") {
    return message.content;
  }

  return message.content
    .filter((item): item is TextContent => item.type === "text")
    .map((item) => item.text)
    .join("\n");
};

export const getLastUserMessageIndex = (
  messages: ChatMessage["messages"],
): number =>
  messages.reduce((lastIndex, message, index) => {
    if (message.role === Role.User) {
      return index;
    }
    return lastIndex;
  }, -1);

export const formatGeneratedChatTitle = (title: string): string =>
  title.trim().slice(0, 20);

export const buildResetBaseChat = (
  chat: ChatMessage,
  visibleMessageIndex: number,
): ChatMessage | null => {
  const actualIndex = visibleMessageIndex + 1;
  const targetMessage = chat.messages[actualIndex];
  if (!targetMessage || targetMessage.role !== Role.User) {
    return null;
  }

  return produce(chat, (draft) => {
    draft.messages = draft.messages.slice(0, actualIndex);
  });
};
