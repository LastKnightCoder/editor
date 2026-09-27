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

/** 删除目录行（连同分支子树），返回被删的 id —— 调用方据此清会话文件与运行态 */
export const deleteChatSession = (id: string): Promise<{ deletedIds: string[] }> =>
  invoke("chat-session:delete", id);

export const getChatSession = (id: string): Promise<ChatSessionRow | null> =>
  invoke("chat-session:get", id);

export const listChatSessions = (filter?: ChatSessionListFilter): Promise<ChatSessionRow[]> =>
  invoke("chat-session:list", filter);

export const listChatSessionBranches = (parentSessionId: string): Promise<ChatSessionRow[]> =>
  invoke("chat-session:branches", parentSessionId);

export const getNextChatSessionBranchIndex = (parentSessionId: string): Promise<number> =>
  invoke("chat-session:next-branch-index", parentSessionId);

export const pinChatSession = (id: string): Promise<ChatSessionRow | null> =>
  invoke("chat-session:pin", id);

export const unpinChatSession = (id: string): Promise<ChatSessionRow | null> =>
  invoke("chat-session:unpin", id);
