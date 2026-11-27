import { sidebarT, sidebarNumber } from "../sidebar.binding";
import { SidebarError, sidebarErrorText } from "../sidebar-errors";
import { currentWhiteboardToolScope } from "@/services/whiteboard-documents/agent-scope";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { useMemoizedFn } from "ahooks";
import { toast } from "@tau/ui";
import type { ChatInputAreaHandle } from "@/components/ChatInputArea";
import { measurePerformance } from "./usePerformanceMonitor";
import type { ChatMessage, RequestMessage, Skill } from "@/types";
import type { PiPromptDisplay } from "@/types/pi-session";
import type { LLMModelSetting, LLMProviderSetting } from "@/types/pi-llm";
import type { PiThinkingLevel } from "@/types/pi-llm";
import { Role } from "@/constants";
import { piChatSessionManager } from "@/services/piChatSession";
import { prepareChatSession } from "./prepareChatSession";
import type { buildPiPromptPayload } from "@/services/piPromptPayload";
import { piChatRuntime } from "@/services/piChatRuntime";
import {
  onPiSessionEvent,
  piSessionAbort,
  piSessionCompact,
  piSessionPrompt,
  type PiSessionEdit,
} from "@/commands/piSession";
import useChatSessionStore, { bucketOfChatScope } from "@/stores/useChatSessionStore";
import { createAssistantMessage } from "@/services/assistantMessageBlocks";
import { createChatMessageClientId } from "@/services/chatMessageSchema";
import { shouldRestoreInputAfterSendError } from "../editingUtils";
import { getErrorMessage } from "@/utils/chat-retry";
import {
  isCompactCommand,
  visibleMessagesOf,
  userEntryIdAt,
  type EditingDraftState,
  type HiddenPromptContextState,
} from "../chatContainerUtils";
import type { MessageContentItem } from "@tau/shared";

/** 本条用户消息里 `$` 点名的 Skill（folderName，去重） */
const extractForcedSkills = (requestMessage: RequestMessage): string[] => {
  const content = requestMessage.content;
  if (!Array.isArray(content)) return [];
  return Array.from(
    new Set(content.flatMap(item => (item.type === "text" && item.skills ? item.skills : [])))
  );
};

/** 用户消息 → 展示 entry 载荷（文件卡片、mention、skills 原样保留，重开对话照原样显示） */
const toPromptDisplay = (message: RequestMessage): PiPromptDisplay | undefined => {
  const content =
    typeof message.content === "string"
      ? [{ type: "text" as const, text: message.content }]
      : message.content;
  return content.length > 0
    ? { content, ...(message.clientId ? { clientId: message.clientId } : {}) }
    : undefined;
};

// 同一对话可以在页面和停靠栏之间切换，停止操作必须找到最初发起的压缩。
const manualCompactions = new Map<string, AbortController>();

interface ChatSendingOptions {
  chatProviderConfig: LLMProviderSetting | null;
  chatModelConfig: LLMModelSetting | null;
  chatScope: string;
  toolScope?: string;
  customSystemPrompt?: string;
  onChatCreated?: (chatId: string) => void;
  beforeSendUserMessage?: (content: MessageContentItem[]) => Promise<boolean | void>;
  prepareUserContent?: (content: MessageContentItem[]) => MessageContentItem[];
  skills: Skill[];
  thinkingLevel: PiThinkingLevel;
  getConversationKey: (chatId: string) => string;
  actualChatRef: RefObject<ChatMessage>;
  conversationKeyRef: RefObject<string>;
  sendLoading: boolean;
  setSessionPending: (key: string, pending: boolean) => void;
  setChatError: Dispatch<SetStateAction<string | SidebarError | null>>;
  setChatRetryStatus: Dispatch<SetStateAction<{ attempt: number; maxRetries: number } | null>>;
  setUpdateCounter: Dispatch<SetStateAction<number>>;
  editSessionHistory: (edit: PiSessionEdit) => Promise<ChatMessage | null>;
  scrollToBottom: (options?: { force?: boolean }) => boolean;
  enableAutoScroll: () => void;
  forceScrollToBottomSoon: () => void;
  editTextRef: RefObject<ChatInputAreaHandle | null>;
  buildPromptPayload: (
    contentItems: MessageContentItem[]
  ) => ReturnType<typeof buildPiPromptPayload>;
  editingDraft: EditingDraftState | null;
  setEditingDraft: Dispatch<SetStateAction<EditingDraftState | null>>;
  hiddenPromptContext: HiddenPromptContextState | null;
  setHiddenPromptContext: Dispatch<SetStateAction<HiddenPromptContextState | null>>;
}

/**
 * 发送流水线（三层守卫链整体在此，不拆散）：
 * submitMessageContent（排队/占用判定）→ sendMessageContent（内容校验/编辑重发回退）
 * → processMessageSending（乐观写入 + pi prompt 提交与失败恢复），外加停止语义。
 */
export function useChatSending({
  chatProviderConfig,
  chatModelConfig,
  chatScope,
  toolScope,
  customSystemPrompt,
  onChatCreated,
  beforeSendUserMessage,
  prepareUserContent,
  skills,
  thinkingLevel,
  getConversationKey,
  actualChatRef,
  conversationKeyRef,
  sendLoading,
  setSessionPending,
  setChatError,
  setChatRetryStatus,
  setUpdateCounter,
  editSessionHistory,
  scrollToBottom,
  enableAutoScroll,
  forceScrollToBottomSoon,
  editTextRef,
  buildPromptPayload,
  editingDraft,
  setEditingDraft,
  hiddenPromptContext,
  setHiddenPromptContext,
}: ChatSendingOptions) {
  const message = toast;

  const sessionSetup = {
    chatProviderConfig,
    chatModelConfig,
    skills,
    thinkingLevel,
    chatScope,
    customSystemPrompt,
  };

  // 抽离的公共方法：处理消息发送逻辑（pi 会话驱动）
  const processMessageSending = useMemoizedFn(
    async (
      requestMessage: RequestMessage,
      options?: {
        shouldClearInput?: boolean;
        /** 聊天流里展示的那一版（图片编辑时模型收到的文本拼了隐藏上下文） */
        persistedRequestMessage?: RequestMessage;
        /** 编辑重发 / 重新生成：先把会话回退到这条用户消息（entry id）之前再发 */
        rewindBeforeEntryId?: string;
        retryMessage?: RequestMessage;
        toolContext?: {
          flags?: {
            forceReview?: boolean;
            feedbackProposalId?: string;
          };
        };
      }
    ) => {
      if (!chatProviderConfig || !chatModelConfig) {
        message.error(sidebarT("config.required"));
        return false;
      }
      const capturedScope =
        toolScope ?? (chatScope === "main-chat" ? currentWhiteboardToolScope() : undefined);
      const shouldClearInput = options?.shouldClearInput ?? true;
      const persistedRequestMessage = options?.persistedRequestMessage ?? requestMessage;
      const perf = measurePerformance("sendMessage");
      const conversationKey = getConversationKey(actualChatRef.current.id);
      const clearPending = () => setSessionPending(conversationKey, false);
      setChatError(null);
      setChatRetryStatus(null);
      setSessionPending(conversationKey, true);

      if (options?.rewindBeforeEntryId) {
        const rewound = await editSessionHistory({
          kind: "rewind",
          entryId: options.rewindBeforeEntryId,
        });
        if (!rewound) {
          clearPending();
          return false;
        }
      }

      scrollToBottom();

      // 乐观写入用户消息与助手占位（界面立即反馈）；事实源是 pi 写的 JSONL，settled 后以投影为准
      let actualCurrentChat: ChatMessage = {
        ...actualChatRef.current,
        messages: options?.retryMessage
          ? [
              ...actualChatRef.current.messages.slice(
                0,
                actualChatRef.current.messages.indexOf(options.retryMessage) + 1
              ),
              createAssistantMessage(),
            ]
          : [...actualChatRef.current.messages, persistedRequestMessage, createAssistantMessage()],
      };
      actualChatRef.current = actualCurrentChat;
      setUpdateCounter(prev => prev + 1);
      useChatSessionStore.getState().publishChat(actualCurrentChat);

      // 添加新消息后立即强制贴底，避免虚拟列表测量期间被 scroll 监听误判为用户离开底部。
      enableAutoScroll();
      setTimeout(forceScrollToBottomSoon, 0);

      if (shouldClearInput) {
        editTextRef.current?.clear();
      }

      try {
        const ensured = await prepareChatSession(actualCurrentChat, {
          ...sessionSetup,
          forcedSkills: extractForcedSkills(requestMessage),
          toolScope: capturedScope,
          toolContext: options?.toolContext,
        });
        const sessionId = ensured.sessionId;

        // 草稿首轮：宿主回传了会话文件名，登记目录行（id 不变，只是从草稿变成正式对话）。
        // 必须在 prompt 之前——会话空闲时 prompt 要等整轮跑完才返回
        if (!actualCurrentChat.sessionFile && ensured.sessionFile) {
          const bucket = bucketOfChatScope(chatScope);
          const row = await useChatSessionStore.getState().registerChat(
            {
              ...actualChatRef.current,
              scope: bucket.scope,
              domainRef: bucket.domainRef,
            },
            ensured.sessionFile
          );
          actualCurrentChat = {
            ...actualChatRef.current,
            sessionFile: row.sessionFile,
          };
          actualChatRef.current = actualCurrentChat;
          useChatSessionStore.getState().publishChat(actualCurrentChat);
          onChatCreated?.(actualCurrentChat.id);
        }

        // runtime 常驻绑定：同一会话多轮发送共享归约器（重建换了 sessionId 自动重建）
        piChatRuntime.bindSession(conversationKey, sessionId);

        const contentItems = Array.isArray(requestMessage.content)
          ? requestMessage.content
          : [
              {
                type: "text" as const,
                text: requestMessage.content as string,
              },
            ];
        const { promptText, images } = options?.retryMessage?.piEntryIds?.length
          ? { promptText: "", images: [] }
          : await buildPromptPayload(contentItems as MessageContentItem[]);
        const display = toPromptDisplay(persistedRequestMessage);

        const retry = options?.retryMessage
          ? {
              entryId: options.retryMessage.piEntryIds?.[0],
              clientId: options.retryMessage.clientId,
            }
          : undefined;
        const submitPrompt = () => piSessionPrompt(sessionId, promptText, images, display, retry);
        let promptOutcome = await submitPrompt();
        let requestTimedOut = false;
        // 停止后立即发送（pi 仍在收尾）会被拒：等该会话沉淀事件后自动提交，15s 兜底放弃
        if (!promptOutcome.ok && /already processing|正在处理/i.test(promptOutcome.error ?? "")) {
          promptOutcome = await new Promise<typeof promptOutcome>(resolve => {
            let settled = false;
            const cleanup = () => {
              unsubscribeSettled();
              clearTimeout(giveUpTimer);
            };
            const unsubscribeSettled = onPiSessionEvent(sessionId, event => {
              if (settled || event.type !== "agent_settled") return;
              settled = true;
              void submitPrompt().then(outcome => {
                cleanup();
                resolve(outcome);
              });
            });
            const giveUpTimer = setTimeout(() => {
              cleanup();
              requestTimedOut = true;
              resolve({ ok: false, error: "会话仍在处理中，请稍后重试" });
            }, 15000);
          });
        }
        if (!promptOutcome.ok) {
          setChatError(
            requestTimedOut
              ? new SidebarError("error.busy", "会话仍在处理中，请稍后重试")
              : (promptOutcome.error ?? new SidebarError("error.send", "发送失败"))
          );
          clearPending();
          const shouldRestoreInput = shouldRestoreInputAfterSendError(
            new Error(promptOutcome.error ?? "")
          );
          if (shouldClearInput && shouldRestoreInput && promptText) {
            setTimeout(() => {
              editTextRef.current?.setValue(promptText);
              editTextRef.current?.focusEnd();
            }, 100);
          }
          perf.end();
          return true;
        }
        // 流式完成由 agent_settled 事件驱动（onSettled：持久化 + 清 pending）
        return true;
      } catch (error) {
        const errorMessage = error instanceof SidebarError ? error : getErrorMessage(error);
        setChatError(errorMessage);
        clearPending();
        perf.end();
        return true;
      }
    }
  );

  // 停止流式请求：pi 会话 abort（半成品由 agent_settled 流程持久化）。
  // 乐观清 pending 让输入区立即恢复；settled 后的清理是幂等的
  const stopStreaming = useMemoizedFn(() => {
    const activeChat = actualChatRef.current;
    const conversationKey = getConversationKey(activeChat.id);
    const compaction = manualCompactions.get(conversationKey);
    if (compaction) {
      compaction.abort();
      return;
    }
    // 立即反馈：清 pending + runtime streaming 位；后台 pi 自行收尾（settled 落库幂等）
    setSessionPending(conversationKey, false);
    piChatRuntime.forceStopStreaming(conversationKey);
    const sessionId = piChatSessionManager.resolveSessionId(chatScope, activeChat.id);
    if (!sessionId) {
      return;
    }
    void piSessionAbort(sessionId);
  });

  const sendMessageContent = useMemoizedFn(
    async (
      userContent: MessageContentItem[],
      expectedConversationKey = conversationKeyRef.current
    ) => {
      if (
        expectedConversationKey !== conversationKeyRef.current ||
        expectedConversationKey !== getConversationKey(actualChatRef.current.id)
      ) {
        return false;
      }

      if (!userContent || userContent.length === 0) {
        message.warning(sidebarT("input.required"));
        return false;
      }

      const hasMeaningfulContent = userContent.some(item => {
        if (item.type === "text") {
          return item.text.trim().length > 0;
        }
        return true;
      });
      if (!hasMeaningfulContent) {
        message.warning(sidebarT("input.required"));
        return false;
      }

      if (beforeSendUserMessage) {
        const shouldContinue = await beforeSendUserMessage(userContent);
        if (shouldContinue === false) {
          return false;
        }
        if (
          expectedConversationKey !== conversationKeyRef.current ||
          expectedConversationKey !== getConversationKey(actualChatRef.current.id)
        ) {
          return false;
        }
      }

      const newMessage: RequestMessage = {
        clientId: createChatMessageClientId(),
        role: Role.User,
        content: userContent as RequestMessage["content"],
      };
      const requestMessageForModel: RequestMessage = hiddenPromptContext
        ? {
            ...newMessage,
            content: Array.isArray(newMessage.content)
              ? [
                  ...newMessage.content.map(item =>
                    item.type === "text"
                      ? {
                          ...item,
                          text: `${hiddenPromptContext.text}\n\n用户编辑要求：${item.text}`,
                        }
                      : item
                  ),
                ]
              : `${hiddenPromptContext.text}\n\n用户编辑要求：${newMessage.content}`,
          }
        : newMessage;

      // 编辑重发：会话回退到被编辑的那条用户消息之前，再以新内容发送
      const editedEntryId = editingDraft
        ? userEntryIdAt(visibleMessagesOf(actualChatRef.current), editingDraft.messageIndex)
        : undefined;

      if (editingDraft && !editedEntryId) {
        setEditingDraft(null);
        message.warning(sidebarT("edit.unsaved"));
        return false;
      }

      setEditingDraft(null);
      const sent = await processMessageSending(requestMessageForModel, {
        shouldClearInput: true,
        persistedRequestMessage: newMessage,
        ...(editedEntryId ? { rewindBeforeEntryId: editedEntryId } : {}),
      });

      if (sent) {
        setHiddenPromptContext(null);
      }
      return sent;
    }
  );

  const compactCurrentChat = async (key: string): Promise<boolean> => {
    const chat = actualChatRef.current;
    if (!chat.sessionFile || !chat.messages.length) {
      message.info(sidebarT("compact.empty"));
      return false;
    }
    const controller = new AbortController();
    manualCompactions.set(key, controller);
    setSessionPending(key, true);
    const progress = message.loading(() => sidebarT("compact.loading"));
    try {
      let sessionId = piChatSessionManager.resolveSessionId(chatScope, chat.id, chat.databaseName);
      const run = async (id: string) => {
        controller.signal.throwIfAborted();
        const abort = () => void piSessionAbort(id, { compactionOnly: true });
        controller.signal.addEventListener("abort", abort, { once: true });
        try {
          piChatRuntime.bindSession(key, id);
          return await piSessionCompact(id);
        } finally {
          controller.signal.removeEventListener("abort", abort);
        }
      };
      let result = sessionId ? await run(sessionId) : undefined;
      // 宿主可能已被空闲回收，按当前对话自己的文件恢复。
      if (!result || result.missing) {
        controller.signal.throwIfAborted();
        sessionId = (
          await prepareChatSession(chat, {
            ...sessionSetup,
            toolScope:
              toolScope ?? (chatScope === "main-chat" ? currentWhiteboardToolScope() : undefined),
          })
        ).sessionId;
        result = await run(sessionId);
      }
      if (!result.ok)
        throw result.error !== undefined && result.error !== null
          ? new Error(result.error)
          : new SidebarError("error.compact", "压缩失败");
      if (result.unchanged) {
        message.info(sidebarT("compact.unchanged"));
        return true;
      }
      message.success(
        result.estimatedTokensAfter === undefined
          ? sidebarT("compact.done")
          : sidebarT("compact.tokens", { tokens: sidebarNumber(result.estimatedTokensAfter) })
      );
      return true;
    } catch (error) {
      const reason = getErrorMessage(error);
      if (controller.signal.aborted) message.info(sidebarT("compact.stopped"));
      else if (reason.includes("already processing")) message.info(sidebarT("compact.waitAnswer"));
      else message.error(sidebarErrorText(error));
      return false;
    } finally {
      message.dismiss(progress);
      manualCompactions.delete(key);
      setSessionPending(key, false);
    }
  };

  const submitMessageContent = useMemoizedFn(
    async (rawContent: MessageContentItem[]): Promise<boolean> => {
      const conversationKey = conversationKeyRef.current;
      if (!editingDraft && !hiddenPromptContext && isCompactCommand(rawContent)) {
        if (conversationKey !== getConversationKey(actualChatRef.current.id)) return false;
        if (
          sendLoading ||
          piChatRuntime.isPending(conversationKey) ||
          piChatRuntime.isStreaming(conversationKey) ||
          manualCompactions.has(conversationKey)
        ) {
          message.info(sidebarT("compact.waitOperation"));
          return false;
        }
        return compactCurrentChat(conversationKey);
      }
      const content = prepareUserContent ? prepareUserContent(rawContent) : rawContent;
      if (
        sendLoading ||
        piChatRuntime.isPending(conversationKey) ||
        piChatRuntime.isStreaming(conversationKey)
      ) {
        piChatRuntime.enqueueMessage(conversationKey, content);
        return true;
      }

      if (conversationKey !== getConversationKey(actualChatRef.current.id)) {
        piChatRuntime.enqueueMessage(conversationKey, content);
        return true;
      }

      // 手动发送即恢复排空：停止只是暂停队列，用户自己继续发说明可以接着排
      piChatRuntime.resumeQueue(conversationKey);
      const sent = await sendMessageContent(content, conversationKey);
      const isConversationInactive =
        conversationKey !== conversationKeyRef.current ||
        conversationKey !== getConversationKey(actualChatRef.current.id);
      if (!sent && isConversationInactive) {
        piChatRuntime.enqueueMessage(conversationKey, content);
        return true;
      }
      return sent;
    }
  );

  return { processMessageSending, sendMessageContent, submitMessageContent, stopStreaming };
}
