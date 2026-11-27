import { useEffect, useRef, useState, type RefObject } from "react";
import { useMemoizedFn } from "ahooks";
import type { EditTextHandle } from "@tau/ui";
import type { ChatMessage } from "@/types";
import type { LLMModelSetting, LLMProviderSetting } from "@/types/pi-llm";
import type { SidebarError } from "../sidebar-errors";
import { Role, SUMMARY_TITLE_PROMPT } from "@/constants";
import { piCompleteChat } from "@/services/piLLM";
import { chatSessionKey } from "@/services/piChatSession";
import { piChatRuntime, type PiChatRuntimeDeps } from "@/services/piChatRuntime";
import { registerActiveSurface } from "@/services/notifications/aiNotify";
import useChatSessionStore from "@/stores/useChatSessionStore";
import useLLMConfig from "@/hooks/useLLMConfig";
import {
  buildTitleSummaryMessages,
  formatGeneratedChatTitle,
  shouldGenerateChatTitle,
} from "../editingUtils";

const ENABLE_TITLE_SUMMARY = true;

interface ChatRuntimeOptions {
  chatScope: string;
  currentChat: ChatMessage;
  chatProviderConfig: LLMProviderSetting | null;
  chatModelConfig: LLMModelSetting | null;
  titleRef?: RefObject<EditTextHandle | null>;
  setExternalSendLoading?: (loading: boolean) => void;
  /** 容器当前是否对用户可见（停靠栏收起时为 false，页面保活由 Activity 自动停驻 effect） */
  isVisible?: boolean;
}

/**
 * 会话运行时：会话键、pending/streaming 双源运行态、模块级 runtime 容器的接入
 * （deps 每次渲染重建）与「切换聊天 / 外部快照」时的视图同步对账。
 */
export function useChatRuntime({
  chatScope,
  currentChat,
  chatProviderConfig,
  chatModelConfig,
  titleRef,
  setExternalSendLoading,
  isVisible,
}: ChatRuntimeOptions) {
  const { provider: titleProviderConfig, model: titleModelConfig } = useLLMConfig("titleSummary");

  // 草稿也有真 id，会话键从头到尾不变（不再有 id 0→N 的迁移）
  const sessionKey = chatSessionKey(chatScope, currentChat.id, currentChat.databaseName);
  const [pendingSessionKeys, setPendingSessionKeys] = useState<Set<string>>(() => new Set());
  const setSessionPending = useMemoizedFn((key: string, pending: boolean) => {
    piChatRuntime.setPending(key, pending);
    setPendingSessionKeys(current => {
      const next = new Set(current);
      if (pending) next.add(key);
      else next.delete(key);
      return next;
    });
  });
  // 运行态双源：pending = 本轮提交中（含停止后排队等待提交）；streaming = pi 会话运行中
  // （模块级 runtime 维护，组件卸载/切页后依然准确）。中断恢复由 pi 会话 JSONL 事实源承接（M4）
  const streamingNow = piChatRuntime.isStreaming(sessionKey);
  const sendLoading =
    piChatRuntime.isPending(sessionKey) || pendingSessionKeys.has(sessionKey) || streamingNow;
  // runtime streaming 位变化不触发渲染：订阅一个轻量 tick 保持响应（后台事件到达时刷新）
  const [runtimeTick, setRuntimeTick] = useState(0);
  useEffect(() => {
    return piChatRuntime.subscribe(key => {
      if (key === sessionKey) setRuntimeTick(tick => tick + 1);
    });
  }, [sessionKey]);

  useEffect(() => {
    setExternalSendLoading?.(sendLoading);
  }, [sendLoading, setExternalSendLoading]);

  const [chatError, setChatError] = useState<string | SidebarError | null>(null);
  const [chatRetryStatus, setChatRetryStatus] = useState<{
    attempt: number;
    maxRetries: number;
  } | null>(null);

  /** 标题生成（纯计算，不写聊天行）：回写与落库由 piChatRuntime 在最新快照上补丁完成 */
  const generateChatTitle = useMemoizedFn(async (chat: ChatMessage): Promise<string | null> => {
    if (
      !ENABLE_TITLE_SUMMARY ||
      !titleProviderConfig ||
      !titleModelConfig ||
      !shouldGenerateChatTitle(chat, true)
    ) {
      return null;
    }

    const titleMessages = buildTitleSummaryMessages(chat);
    if (titleMessages.length === 0) {
      return null;
    }

    const titleResult = await piCompleteChat({
      provider: titleProviderConfig,
      model: titleModelConfig,
      source: { feature: "titleSummary", entityId: chat.id, library: chat.databaseName },
      messages: [
        {
          role: Role.System,
          content: [{ type: "text", text: SUMMARY_TITLE_PROMPT }],
        },
        ...titleMessages,
        {
          role: Role.User,
          content: [
            {
              type: "text",
              text: "请根据以上对话内容生成一个简洁的标题",
            },
          ],
        },
      ],
    });
    if (!titleResult.ok || titleResult.aborted || !titleResult.text) {
      return null;
    }
    return formatGeneratedChatTitle(titleResult.text) || null;
  });

  // 跟踪实际使用的聊天对象：模块级 runtime 容器（单一事实源）——组件卸载/切页后
  // 事件归约与持久化仍在 runtime 中继续（后台运行），重挂载时拿回同一容器无缝接续。
  // deps 每次渲染刷新（均为无组件生命周期的引用：store action / IPC command / 安全闭包）
  const runtimeDeps: PiChatRuntimeDeps = {
    chatScope,
    publish: chat => useChatSessionStore.getState().publishChat(chat),
    settle: chat =>
      useChatSessionStore.getState().settleChat(chat.id, chat.databaseName, chat.sessionFile),
    evict: chat => useChatSessionStore.getState().evictChat(chat.id, chat.databaseName),
    generateTitle: chat => generateChatTitle(chat),
    saveTitle: (chatId, title) =>
      useChatSessionStore.getState().renameChat(chatId, title, currentChat.databaseName),
    ui: {
      onRetryStatus: status =>
        conversationKeyRef.current === sessionKey &&
        setChatRetryStatus(
          status ? { attempt: status.attempt, maxRetries: status.maxAttempts } : null
        ),
      onStreamError: errorMessage => {
        if (conversationKeyRef.current === sessionKey) setChatError(errorMessage);
      },
      onSettled: key => {
        setSessionPending(key, false);
        if (conversationKeyRef.current === sessionKey) setChatError(null);
      },
      onTitleGenerated: (chatId, title) => {
        if (displayedChatIdRef.current === chatId) {
          titleRef?.current?.setValue(title);
        }
      },
    },
    ...(chatProviderConfig && chatModelConfig
      ? {
          usageModel: {
            providerId: chatProviderConfig.id,
            modelId: chatModelConfig.id,
          },
        }
      : {}),
  };
  const actualChatRef = piChatRuntime.ensureConversation(sessionKey, currentChat, runtimeDeps);
  // 挂载引用：挂着的条目不回收；卸载后条目常驻（后台运行），空闲时才可能被 LRU 回收
  useEffect(() => piChatRuntime.retain(sessionKey), [sessionKey]);
  // 登记当前可见对话面：供 AI 通知在用户正注视本对话时抑制提醒
  useEffect(() => {
    if (isVisible === false) return;
    return registerActiveSurface(`chat:${sessionKey}`);
  }, [sessionKey, isVisible]);
  useEffect(() => {
    void piChatRuntime
      .restoreSession(sessionKey, chatScope, currentChat.id)
      .catch(error => console.error("恢复对话运行状态失败:", error));
  }, [sessionKey, chatScope, currentChat.id]);

  // 强制更新计数器，用于触发visibleMessages重新计算
  const [updateCounter, setUpdateCounter] = useState(0);

  const displayedChatIdRef = useRef(currentChat.id);
  /** 当前对话键（与 runtime/会话键同一套取值）：发送期间对话可能切换，异步流程据此对账 */
  const conversationKeyRef = useRef(sessionKey);
  const activeAssistantTurnIdRef = useRef<string | null>(null);
  const hasRestoredScrollPositionRef = useRef(false);
  const isRestoringScrollPositionRef = useRef(false);

  const getConversationKey = useMemoizedFn((chatId: string) =>
    chatSessionKey(chatScope, chatId, currentChat.databaseName)
  );

  // 上次同步到视图的 runtime 容器：容器按 sessionKey 分条目，切换会话时 ensureConversation
  // 返回的是另一个已用 currentChat 初始化的容器，只比对 id/快照会漏判——必须比对容器身份。
  const syncedConversationRef = useRef(actualChatRef);

  // 当切换聊天或收到同一聊天的外部最新快照时同步 ref
  useEffect(() => {
    displayedChatIdRef.current = currentChat.id;
    const isDifferentConversation = syncedConversationRef.current !== actualChatRef;
    syncedConversationRef.current = actualChatRef;
    const actualChat = actualChatRef.current;
    const isDifferentChat = isDifferentConversation || currentChat.id !== actualChat.id;
    const hasExternalSnapshot = currentChat !== actualChat;

    if (isDifferentChat || hasExternalSnapshot) {
      actualChatRef.current = currentChat;
      if (isDifferentChat) {
        setChatError(null);
        setChatRetryStatus(null);
      }
      if (isDifferentChat) {
        activeAssistantTurnIdRef.current = null;
        hasRestoredScrollPositionRef.current = false;
      }
      setUpdateCounter(prev => prev + 1);
    }
    conversationKeyRef.current = sessionKey;
  }, [actualChatRef, currentChat, sessionKey]);

  return {
    sessionKey,
    sendLoading,
    setSessionPending,
    runtimeTick,
    updateCounter,
    setUpdateCounter,
    actualChatRef,
    conversationKeyRef,
    chatError,
    setChatError,
    chatRetryStatus,
    setChatRetryStatus,
    getConversationKey,
    hasRestoredScrollPositionRef,
    isRestoringScrollPositionRef,
  };
}
