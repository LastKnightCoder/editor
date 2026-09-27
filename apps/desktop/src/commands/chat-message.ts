/**
 * 对话分组（chat_group）的渲染端封装。M4 起对话本身在 chat_session 目录表 + pi JSONL
 * （见 commands/chat-session.ts），旧 chat_message 行的读写命令已退役（主进程 handler 留到 M8）。
 */
import { invoke } from "@/electron";
import { ChatGroup, CreateChatGroup, UpdateChatGroup } from "@/types";

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
