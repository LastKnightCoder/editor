import { Role } from "@/constants";
import type { ChatMessage } from "@/types";

/** 界面上的消息序列（投影不含 system；旧快照可能还带着，一并滤掉） */
export const visibleMessagesOf = (chat: ChatMessage) =>
  chat.messages.filter(message => message.role !== Role.System);

/** 第 index 条可见消息（须为用户消息）对应的 pi entry id */
export const userEntryIdAt = (
  messages: ChatMessage["messages"],
  index: number
): string | undefined => {
  const target = messages[index];
  return target?.role === Role.User ? target.piEntryIds?.[0] : undefined;
};

export interface EditingDraftState {
  messageIndex: number;
}

export interface HiddenPromptContextState {
  text: string;
  label?: string;
}
