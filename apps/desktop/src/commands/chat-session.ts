/**
 * pi 会话目录表（chat_session）的渲染端封装（M4）。
 * 列表查询不带消息载荷——对话内容经 piSessionTranscript 从 JSONL 读。
 */
import { invoke } from "@/electron";
import { getChatDatabase } from "@/services/chatDatabase";
import { bindDatabaseCommands, currentCommandScope } from "@/services/command-context";
import type {
  ChatSessionInsert,
  ChatSessionListFilter,
  ChatSessionPatch,
  ChatSessionRow,
} from "@/types/chat-session";

const commands = (databaseName: string) => {
  const scope = currentCommandScope();
  return bindDatabaseCommands(
    { invoke },
    scope?.databaseName?.replace(/\.db$/, "") === databaseName.replace(/\.db$/, "")
      ? scope
      : { databaseName }
  );
};

export const createChatSession = (
  input: ChatSessionInsert,
  databaseName = getChatDatabase()
): Promise<ChatSessionRow> => commands(databaseName).invoke("chat-session:create", input);

export const updateChatSession = (
  id: string,
  patch: ChatSessionPatch,
  databaseName = getChatDatabase()
): Promise<ChatSessionRow | null> =>
  commands(databaseName).invoke("chat-session:update", id, patch);

/** 删除目录行与它的会话文件（分支都在文件内部的会话树上，一起删掉） */
export const deleteChatSession = (id: string, databaseName = getChatDatabase()): Promise<void> =>
  commands(databaseName).invoke("chat-session:delete", id);

export const getChatSession = (id: string): Promise<ChatSessionRow | null> =>
  commands(getChatDatabase()).invoke("chat-session:get", id);

export const listChatSessions = (filter?: ChatSessionListFilter): Promise<ChatSessionRow[]> =>
  commands(getChatDatabase()).invoke("chat-session:list", filter);

export const pinChatSession = (id: string): Promise<ChatSessionRow | null> =>
  commands(getChatDatabase()).invoke("chat-session:pin", id);

export const unpinChatSession = (id: string): Promise<ChatSessionRow | null> =>
  commands(getChatDatabase()).invoke("chat-session:unpin", id);
