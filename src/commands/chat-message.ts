import { invoke } from "@/electron";
import {
  ChatMessage,
  ChatSessionMessage,
  ChatGroup,
  CreateChatGroup,
  UpdateChatGroup,
} from "@/types";

export const createChatMessage = (
  messages: ChatSessionMessage[],
  title = "新对话",
  groupId?: number | null,
): Promise<ChatMessage> => {
  return invoke("create-chat-message", messages, title, groupId);
};

export const getChatMessageById = (id: number): Promise<ChatMessage> => {
  return invoke("get-chat-message-by-id", { id });
};

export const updateChatMessage = (
  chatMessage: Omit<ChatMessage, "updateTime">,
): Promise<ChatMessage> => {
  return invoke("update-chat-message", chatMessage);
};

export const deleteChatMessage = (id: number): Promise<number> => {
  return invoke("delete-chat-message", id);
};

export const getAllChatMessages = (): Promise<ChatMessage[]> => {
  return invoke("get-all-chat-messages");
};

export const createChatGroup = (data: CreateChatGroup): Promise<ChatGroup> => {
  return invoke("chat-group:create", data);
};

export const updateChatGroup = (data: UpdateChatGroup): Promise<ChatGroup> => {
  return invoke("chat-group:update", data);
};

export const deleteChatGroup = (id: number): Promise<number> => {
  return invoke("chat-group:delete", id);
};

export const getAllChatGroups = (): Promise<ChatGroup[]> => {
  return invoke("chat-group:get-all");
};

export const getChatGroupById = (id: number): Promise<ChatGroup> => {
  return invoke("chat-group:get-by-id", id);
};
