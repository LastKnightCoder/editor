import { useEffect, useState } from "react";
import { Role } from "@/constants";
import type { ChatMessage } from "@/types";
import type { EditingDraftState, HiddenPromptContextState } from "../chatContainerUtils";

interface ChatEditingStateOptions {
  hideInput: boolean;
  visibleMessages: ChatMessage["messages"];
}

/** 编辑态与隐藏上下文（图片编辑要求）：发送/停止/渲染共用的两个 UI 状态及其失效清理 */
export function useChatEditingState({ hideInput, visibleMessages }: ChatEditingStateOptions) {
  const [editingDraft, setEditingDraft] = useState<EditingDraftState | null>(null);
  const [hiddenPromptContext, setHiddenPromptContext] = useState<HiddenPromptContextState | null>(
    null
  );

  useEffect(() => {
    if (hideInput) {
      setEditingDraft(null);
    }
  }, [hideInput]);

  useEffect(() => {
    if (!editingDraft) {
      return;
    }

    // 任意一条用户消息都能编辑（原内容作为一个版本留在树上）
    const targetMessage = visibleMessages[editingDraft.messageIndex];
    const isEditingTargetStillValid = targetMessage?.role === Role.User;

    if (!isEditingTargetStillValid) {
      setEditingDraft(null);
    }
  }, [editingDraft, visibleMessages]);

  return { editingDraft, setEditingDraft, hiddenPromptContext, setHiddenPromptContext };
}
