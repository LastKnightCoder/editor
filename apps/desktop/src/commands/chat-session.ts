/**
 * pi 会话目录表（chat_session）的渲染端封装（M4）。
 * 列表查询不带消息载荷——对话内容经 piSessionTranscript 从 JSONL 读。
 */
import { invoke } from "@/electron";
import type {
  ChatSessionInsert,
  ChatSessionListFilter,
  ChatSessionPatch,
  ChatSessionRow,
} from "@/types/chat-session";

export const createChatSession = (input: ChatSessionInsert): Promise<ChatSessionRow> =>
  invoke("chat-session:create", input);

export const updateChatSession = (
  id: string,
  patch: ChatSessionPatch
): Promise<ChatSessionRow | null> => invoke("chat-session:update", id, patch);

/** 删除目录行与它的会话文件（分支都在文件内部的会话树上，一起删掉） */
export const deleteChatSession = (id: string): Promise<void> => invoke("chat-session:delete", id);

export const getChatSession = (id: string): Promise<ChatSessionRow | null> =>
  invoke("chat-session:get", id);

export const listChatSessions = (filter?: ChatSessionListFilter): Promise<ChatSessionRow[]> =>
  invoke("chat-session:list", filter);

export const pinChatSession = (id: string): Promise<ChatSessionRow | null> =>
  invoke("chat-session:pin", id);

export const unpinChatSession = (id: string): Promise<ChatSessionRow | null> =>
  invoke("chat-session:unpin", id);
