/**
 * 引用目标的读取：会话目录行（标题、会话文件）+ 被引用的那一轮。
 * 只在悬停预览、打开时查询，不随正文渲染批量拉取。
 */

import { useQuery } from "@tanstack/react-query";
import { getChatSession } from "@/commands/chat-session";
import { piSessionTurn } from "@/commands/piSession";
import { getChatDatabase } from "@/services/chatDatabase";
import { currentCommandScope } from "@/services/command-context";
import type { ChatConversationTurn } from "@/types/pi-session";
import type { ChatSessionRow } from "@/types/chat-session";

export interface ChatRefTarget {
  session: ChatSessionRow;
  /** 引用整个对话时为 undefined；该轮已删除时为 null */
  turn?: ChatConversationTurn | null;
}

export const getChatRefDatabase = () =>
  getChatDatabase() || currentCommandScope()?.databaseName || "";

/** null = 会话已删除或不是主对话 */
export async function loadChatRefTarget(
  sessionId: string,
  entryId?: string,
  databaseName = getChatRefDatabase()
): Promise<ChatRefTarget | null> {
  const session = await getChatSession(sessionId, databaseName);
  if (!session || session.scope !== "main-chat") return null;
  if (!entryId) return { session };
  const result = await piSessionTurn({ sessionFile: session.sessionFile, databaseName }, entryId);
  if (!result.ok) {
    if (result.error) throw new Error(result.error);
    throw Object.assign(new Error("读取对话失败"), { code: "CHAT_REF_READ_FAILED" });
  }
  return { session, turn: result.turn ?? null };
}

export const chatRefQueryKey = (
  sessionId: string,
  entryId?: string,
  databaseName = getChatRefDatabase()
) => ["chat-ref", databaseName, sessionId, entryId ?? null] as const;

export function useChatRefTarget(sessionId: string, entryId: string | undefined, enabled: boolean) {
  const databaseName = getChatRefDatabase();
  return useQuery({
    queryKey: chatRefQueryKey(sessionId, entryId, databaseName),
    queryFn: () => loadChatRefTarget(sessionId, entryId, databaseName),
    enabled,
    staleTime: 30_000,
  });
}
