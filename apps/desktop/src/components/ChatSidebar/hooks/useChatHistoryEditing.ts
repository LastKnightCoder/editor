import type { Dispatch, RefObject, SetStateAction } from "react";
import { useMemoizedFn } from "ahooks";
import { toast } from "@tau/ui";
import type { ChatMessage } from "@/types";
import type { PiSessionEdit } from "@/commands/piSession";
import { adoptTranscript } from "@/services/piChatRuntime";
import useChatSessionStore from "@/stores/useChatSessionStore";
import { getErrorMessage } from "@/utils/chat-retry";

interface ChatHistoryEditingOptions {
  actualChatRef: RefObject<ChatMessage>;
  setUpdateCounter: Dispatch<SetStateAction<number>>;
}

/** 改会话树的统一入口：回退/分叉/切版本/删除都经这里投影回容器并发布 */
export function useChatHistoryEditing({
  actualChatRef,
  setUpdateCounter,
}: ChatHistoryEditingOptions) {
  const message = toast;

  /**
   * 改会话树：回退/分叉/切版本/删除都在同一文件的树上。宿主会话开着且空闲时主进程
   * 直接改它（不重建，本会话的工具授权保留），把改后的投影写回容器。
   */
  const editSessionHistory = useMemoizedFn(
    async (edit: PiSessionEdit): Promise<ChatMessage | null> => {
      const chat = actualChatRef.current;
      if (!chat.sessionFile) {
        message.warning("对话还没有保存下来，暂时不能修改历史");
        return null;
      }
      let projection: Pick<ChatMessage, "messages" | "compaction">;
      try {
        projection = await useChatSessionStore.getState().editChat(chat.id, edit);
      } catch (error) {
        message.error(getErrorMessage(error) || "修改对话历史失败");
        return null;
      }
      const next = {
        ...adoptTranscript(chat, projection.messages),
        compaction: projection.compaction,
      };
      if (
        actualChatRef.current.id === chat.id &&
        actualChatRef.current.databaseName === chat.databaseName
      ) {
        actualChatRef.current = next;
        setUpdateCounter(prev => prev + 1);
      }
      useChatSessionStore.getState().publishChat(next);
      return next;
    }
  );

  return { editSessionHistory };
}
