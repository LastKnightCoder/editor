/**
 * 一个对话的树谱数据（M4-d）：读主进程的用户消息树并排版。对话内容一变（发送、settled、切版本、删除）
 * 就重读——触发键是当前路径的 entry id 串，而不是消息数组本身（流式期间内容高频变化，树不变）。
 */
import { useEffect, useMemo, useState } from "react";
import type { ChatMessage } from "@/types";
import type { ConversationTreeNode } from "@/types/pi-session";
import { piSessionTree } from "@/commands/piSession";
import { layoutConversationTree } from "./conversationTree";

export function useConversationTree(
  chat: Pick<ChatMessage, "id" | "sessionFile" | "messages" | "databaseName">
) {
  const [nodes, setNodes] = useState<ConversationTreeNode[]>([]);
  const pathKey = chat.messages.map(message => message.piEntryIds?.[0] ?? "").join("|");

  useEffect(() => {
    if (!chat.sessionFile) {
      setNodes([]);
      return;
    }
    let cancelled = false;
    void piSessionTree({ sessionFile: chat.sessionFile, databaseName: chat.databaseName }).then(
      outcome => {
        if (cancelled) return;
        if (outcome.ok) setNodes(outcome.nodes ?? []);
        else console.error("[conversationTree] 读取分支失败:", outcome.error);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [chat.id, chat.sessionFile, chat.databaseName, pathKey]);

  return useMemo(() => layoutConversationTree(nodes), [nodes]);
}
