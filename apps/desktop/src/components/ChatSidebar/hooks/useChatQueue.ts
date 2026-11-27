import { useEffect, useRef, type RefObject } from "react";
import { useMemoizedFn } from "ahooks";
import type { ChatInputAreaHandle } from "@/components/ChatInputArea";
import type { ChatMessage } from "@/types";
import { piChatRuntime } from "@/services/piChatRuntime";
import type { MessageContentItem } from "@tau/shared";
import type { EditingDraftState, HiddenPromptContextState } from "../chatContainerUtils";
import { useHooksFeedbackI18n } from "@/hooks/i18n";

interface ChatQueueOptions {
  sessionKey: string;
  runtimeTick: number;
  updateCounter: number;
  sendLoading: boolean;
  getConversationKey: (chatId: string) => string;
  actualChatRef: RefObject<ChatMessage>;
  conversationKeyRef: RefObject<string>;
  sendMessageContent: (
    userContent: MessageContentItem[],
    expectedConversationKey?: string
  ) => Promise<boolean>;
  editingDraft: EditingDraftState | null;
  hiddenPromptContext: HiddenPromptContextState | null;
  editTextRef: RefObject<ChatInputAreaHandle | null>;
}

/** 待发送队列：队列/插话快照、逐条管理入口与挂载期间的自动排空（用户停止后暂停） */
export function useChatQueue({
  sessionKey,
  runtimeTick,
  updateCounter,
  sendLoading,
  getConversationKey,
  actualChatRef,
  conversationKeyRef,
  sendMessageContent,
  editingDraft,
  hiddenPromptContext,
  editTextRef,
}: ChatQueueOptions) {
  const { t } = useHooksFeedbackI18n();
  const queueDrainInProgressRef = useRef(false);

  // 待发送队列与已提交插话都归模块级 runtime（切页/卸载不丢）；
  // 变更经 runtime.subscribe → runtimeTick 触发重渲染，这里每次渲染取最新快照
  const queuedMessages = piChatRuntime.listQueue(sessionKey);
  const pendingSteers = piChatRuntime.listPendingSteers(sessionKey);
  const queuePaused = piChatRuntime.isQueuePaused(sessionKey);
  // 能否插话：会话在运行中，且不在「编辑重发/图片编辑」这类要重建会话的上下文里
  const canSteerNow = piChatRuntime.canSteer(sessionKey) && !editingDraft && !hiddenPromptContext;

  const queuedMessageText = useMemoizedFn((content: MessageContentItem[]) =>
    content
      .map(item =>
        item.type === "text"
          ? item.text
          : item.type === "file"
            ? t("chatQueue.file", { name: item.fileName ?? item.file })
            : t("chatQueue.image")
      )
      .join("\n")
  );

  const editQueuedMessage = useMemoizedFn((index: number) => {
    const content = piChatRuntime.takeQueuedMessage(sessionKey, index);
    if (!content) return;
    editTextRef.current?.setValue(queuedMessageText(content));
    editTextRef.current?.focusEnd();
  });

  const removeQueuedMessage = useMemoizedFn((index: number) => {
    piChatRuntime.removeQueuedMessage(sessionKey, index);
  });

  // 队列排空：发送编排在组件里，所以由挂载中的组件执行；队列本身在 runtime，
  // 切页期间不排空、回到页面自动继续。用户按过停止时队列是暂停的（dequeue 不交出内容）。
  useEffect(() => {
    const conversationKey = sessionKey;
    if (
      sendLoading ||
      queueDrainInProgressRef.current ||
      piChatRuntime.isQueuePaused(conversationKey) ||
      piChatRuntime.queueSize(conversationKey) === 0 ||
      conversationKey !== getConversationKey(actualChatRef.current.id)
    ) {
      return;
    }

    queueDrainInProgressRef.current = true;
    void (async () => {
      while (conversationKeyRef.current === conversationKey) {
        const nextMessage = piChatRuntime.dequeueMessage(conversationKey);
        if (!nextMessage) return;

        const sent = await sendMessageContent(nextMessage, conversationKey);
        const isConversationInactive =
          conversationKeyRef.current !== conversationKey ||
          getConversationKey(actualChatRef.current.id) !== conversationKey;
        if (!sent && isConversationInactive) {
          piChatRuntime.requeueMessage(conversationKey, nextMessage);
          return;
        }
        if (sent) return;
        // 仍是当前对话却没发出（内容不合法等）：丢弃这条继续下一条，避免原地死循环
      }
    })().finally(() => {
      queueDrainInProgressRef.current = false;
    });
  }, [runtimeTick, sendLoading, sendMessageContent, sessionKey, updateCounter]);

  return {
    queuedMessages,
    pendingSteers,
    queuePaused,
    canSteerNow,
    queuedMessageText,
    editQueuedMessage,
    removeQueuedMessage,
  };
}
