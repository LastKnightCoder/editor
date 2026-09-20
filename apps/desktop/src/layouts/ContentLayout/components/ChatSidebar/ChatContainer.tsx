import React, {
  useRef,
  useMemo,
  memo,
  useEffect,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import { App } from "antd";
import { produce } from "immer";
import { useLocalStorageState, useMemoizedFn } from "ahooks";
import { useDrop } from "react-dnd";
import { selectDirectoryWithDialog } from "@/commands";

import ChatInputArea from "@/components/ChatInputArea";
import type { ChatInputAreaHandle } from "@/components/ChatInputArea";

import { measurePerformance } from "./hooks/usePerformanceMonitor";
import MessageItem from "./MessageItem";

import {
  ChatMessage,
  RequestMessage,
  ResponseMessage,
  ReasoningEffort,
  ToolCallPayload,
  ToolCallExecutionState,
  ChatAgentType,
} from "@/types";
import {
  Role,
  SUMMARY_TITLE_PROMPT,
  DEFAULT_SYSTEM_PROMPT,
  buildSessionAwareSystemPrompt,
} from "@/constants";
import useChatLLM from "@/hooks/useChatLLM";
import useLLMConfig from "@/hooks/useLLMConfig";
import useSettingStore from "@/stores/useSettingStore";
import useSkillStore from "@/stores/useSkillStore";
import type { EditTextHandle } from "@/components/EditText";
import classNames from "classnames";
import useThemeColors from "@/hooks/useThemeColors";
import {
  ChatContainerCore,
  type ChatContainerCoreHandle,
  type ChatMessageType as CoreChatMessageType,
  type MessageContentItem,
  useChatAutoScroll,
} from "@tau/shared";
import { ASK_QUESTION_TOOL_NAME, buildAskQuestionToolResult } from "@/tools/askQuestionTypes";
import { ToolRendererInteractionProvider } from "@/tool-call-renderers/ToolRendererInteractionContext";
import { useAskQuestionSessionStore } from "@/tools/askQuestionSessionStore";
import {
  applyAssistantReasoningSnapshot,
  applyAssistantProviderMetadataSnapshot,
  applyAssistantTextSnapshot,
  applyAssistantToolCallsSnapshot,
  createAssistantMessage,
  ensureAssistantMessage,
  finalizeAssistantTurn,
  syncAssistantDerivedFields,
} from "@/services/assistantMessageBlocks";
import { createChatMessageClientId } from "@/services/chatMessageSchema";
import {
  buildFullHistoryMessages,
  buildResetBaseChat,
  buildTitleSummaryMessages,
  formatGeneratedChatTitle,
  getLastUserMessageIndex,
  getRequestMessageText,
  shouldRestoreInputAfterSendError,
  shouldGenerateChatTitle,
} from "./editingUtils";
import { withStreamingUpdateTime } from "./streamingUtils";
import { ConversationMessageQueue } from "./messageQueue";
import { streamCodexChat } from "@/services/codex/codexChatStream";
import { chatRunManager } from "@/services/chatRunManager";
import type { ChatSource, ChatSessionKey } from "@/types/chat-run";
import {
  CHAT_CONTENT_DND_TYPE,
  SIDEBAR_ITEM_DND_TYPE,
  getChatContentDragReference,
} from "@/utils/chat-content-dnd";
import useChatRunStore from "@/stores/useChatRunStore";
import type { CodexMappedEvent } from "@/services/codex/codexEventAdapter";
import { buildCodexInputFromMessageContent } from "@/services/codex/codexInputAdapter";
import {
  buildCodexSystemPrompt,
  prependCodexSystemPromptToInput,
} from "@/services/codex/codexSystemPrompt";
import {
  CHAT_AGENT_TYPE_STORAGE_KEY,
  CHAT_AGENT_WORKING_DIRECTORY_STORAGE_KEY,
  normalizeChatAgentType,
} from "@/constants/chatAgent";
import {
  getReasoningEffortOptions,
  normalizeReasoningEffort,
} from "@/utils/openai-reasoning-effort";
import {
  DEFAULT_CHAT_MAX_RETRIES,
  getErrorMessage,
  isContextLengthError,
} from "@/utils/chat-retry";

const ENABLE_TITLE_SUMMARY = true;
interface ChatScrollAnchor {
  index: number;
  messageId?: string;
  offset: number;
  wasAtBottom: boolean;
}

const CHAT_SCROLL_POSITION_CACHE = new Map<string, ChatScrollAnchor>();

interface EditingDraftState {
  messageIndex: number;
}

interface HiddenPromptContextState {
  text: string;
  label?: string;
}

interface ChatContainerProps {
  currentChat: ChatMessage;
  isDark: boolean;
  markdownComponents: any;
  isVisible: boolean; // 控制是否应该渲染内容
  updateChatMessage: (chat: ChatMessage) => Promise<ChatMessage>;
  updateCurrentChat: (chat: ChatMessage) => void;
  sendLoading: boolean;
  setSendLoading: (loading: boolean) => void;
  titleRef: React.RefObject<EditTextHandle | null>;
  onCreateNewMessage: () => void;
  createMessageLoading: boolean;
  hideInput?: boolean; // 控制是否隐藏输入框
  chatScope?: string; // 对话作用域，用于构建 ask-question 会话键
  preserveScrollPosition?: boolean; // 侧边栏收起后重新打开时恢复滚动位置
  scrollPositionScope?: string; // 滚动位置缓存作用域，不影响模型会话键
  onChatCreated?: (chatId: number) => void; // 新对话创建后的回调
  customSystemPrompt?: string; // 自定义系统提示（覆盖默认）
  onCreateChat: (
    messages: ChatMessage["messages"],
    title?: string,
    agentType?: ChatAgentType,
    agentSessionId?: string | null
  ) => Promise<ChatMessage>;
  onCreateBranch: (parentChatId: number, messages: ChatMessage["messages"]) => Promise<ChatMessage>;
  beforeSendUserMessage?: (content: MessageContentItem[]) => Promise<boolean | void>;
}

export type ChatContainerHandle = {
  scrollToTop: () => void;
  focusInput: () => void;
  setInputValue: (value: string) => void;
  sendUserMessage: (content: MessageContentItem[]) => Promise<boolean>;
};

const normalizeAskQuestionExecutionInput = (input: string) => {
  try {
    return JSON.stringify(JSON.parse(input));
  } catch {
    return input.trim();
  }
};

const markAskQuestionExecutionResolved = (
  chat: ChatMessage,
  toolCallId: string,
  expectedInput: string,
  output: string
) => {
  const normalizedExpectedInput = normalizeAskQuestionExecutionInput(expectedInput);

  return produce(chat, draft => {
    const isMatchedExecution = (execution: ToolCallExecutionState) =>
      execution.toolCallId === toolCallId &&
      execution.toolName === ASK_QUESTION_TOOL_NAME &&
      normalizeAskQuestionExecutionInput(execution.input) === normalizedExpectedInput;

    draft.messages.forEach(message => {
      if (message.role !== Role.Assistant) {
        return;
      }

      const assistant = ensureAssistantMessage(message as ResponseMessage);
      assistant.assistant_blocks = assistant.assistant_blocks?.map(block => {
        if (block.type !== "tool_call" || !block.execution) {
          return block;
        }

        return {
          ...block,
          execution: isMatchedExecution(block.execution)
            ? {
                ...block.execution,
                status: "success",
                output,
                duration: block.execution.duration || Date.now() - block.execution.timestamp,
              }
            : block.execution,
        };
      });
      syncAssistantDerivedFields(assistant);
    });
  });
};

const buildAskQuestionExecutionSnapshotKey = (execution: ToolCallExecutionState) =>
  `${execution.toolCallId}::${execution.input}`;

const ChatContainer = forwardRef<ChatContainerHandle, ChatContainerProps>(
  (
    {
      currentChat,
      isDark,
      markdownComponents,
      isVisible,
      updateChatMessage,
      updateCurrentChat,
      sendLoading: _externalSendLoading,
      setSendLoading: setExternalSendLoading,
      titleRef,
      onCreateNewMessage,
      createMessageLoading,
      hideInput = false,
      chatScope = "main-chat",
      preserveScrollPosition = false,
      scrollPositionScope,
      onChatCreated,
      customSystemPrompt,
      onCreateChat,
      onCreateBranch,
      beforeSendUserMessage,
    },
    ref
  ) => {
    const { message } = App.useApp();
    const { chatLLMStream } = useChatLLM();
    const { providerConfig: chatProviderConfig, modelConfig: chatModelConfig } =
      useLLMConfig("chat");
    const { providerConfig: titleProviderConfig, modelConfig: titleModelConfig } =
      useLLMConfig("titleSummary");

    const { inputBgClass } = useThemeColors();
    const chatRuns = useChatRunStore(state => state.runs);
    const sessionKey = `${chatScope.split(":")[0]}:${currentChat.id}` as ChatSessionKey;
    const sessionRun = useMemo(
      () =>
        Object.values(chatRuns)
          .filter(run => run.sessionKey === sessionKey)
          .sort((a, b) => b.updatedAt - a.updatedAt)[0],
      [chatRuns, sessionKey]
    );
    const [pendingSessionKeys, setPendingSessionKeys] = useState<Set<ChatSessionKey>>(
      () => new Set()
    );
    const setSessionPending = useMemoizedFn((key: ChatSessionKey, pending: boolean) => {
      setPendingSessionKeys(current => {
        const next = new Set(current);
        if (pending) next.add(key);
        else next.delete(key);
        return next;
      });
    });
    const sendLoading =
      pendingSessionKeys.has(sessionKey) ||
      Boolean(
        sessionRun && ["queued", "running", "retrying", "waiting_input"].includes(sessionRun.status)
      );

    useEffect(() => {
      setExternalSendLoading(sendLoading);
    }, [sendLoading, setExternalSendLoading]);

    const llmConfigs = useSettingStore(state => state.setting.llmConfigs);
    const skills = useSkillStore(state => state.skills);
    const loadSkills = useSkillStore(state => state.loadSkills);
    const askQuestionRecords = useAskQuestionSessionStore(state => state.records);
    const completeAskQuestionSession = useAskQuestionSessionStore(state => state.completeSession);

    // 加载 Skills 数据（用于注入系统 Prompt）
    useEffect(() => {
      loadSkills();
    }, [loadSkills]);

    const [reasoningEffort, setReasoningEffort] = useLocalStorageState<ReasoningEffort>(
      "reasoningEffort",
      {
        defaultValue: "none",
      }
    );
    const effectiveReasoningEffort = reasoningEffort ?? "none";
    const reasoningEffortOptions = useMemo(
      () => getReasoningEffortOptions(chatModelConfig),
      [chatModelConfig]
    );
    const normalizedReasoningEffort =
      chatModelConfig?.messageFormat === "claude" &&
      !reasoningEffortOptions.includes(effectiveReasoningEffort)
        ? (reasoningEffortOptions[0] ?? "none")
        : normalizeReasoningEffort(effectiveReasoningEffort, reasoningEffortOptions);
    const [rememberedAgentType, setRememberedAgentType] = useLocalStorageState<ChatAgentType>(
      CHAT_AGENT_TYPE_STORAGE_KEY,
      {
        defaultValue: "local",
      }
    );
    const [codexWorkingDirectory, setCodexWorkingDirectory] = useLocalStorageState<string | null>(
      CHAT_AGENT_WORKING_DIRECTORY_STORAGE_KEY,
      {
        defaultValue: null,
      }
    );
    const effectiveRememberedAgentType = normalizeChatAgentType(rememberedAgentType);

    const editTextRef = useRef<ChatInputAreaHandle>(null);
    const messagesRef = useRef<HTMLDivElement>(null);
    const coreRef = useRef<ChatContainerCoreHandle>(null);
    const [{ isOver: isChatContentDragOver, canDrop: canDropChatContent }, dropChatContent] =
      useDrop({
        accept: [CHAT_CONTENT_DND_TYPE, SIDEBAR_ITEM_DND_TYPE],
        canDrop: (item: unknown) =>
          !hideInput && !sendLoading && Boolean(getChatContentDragReference(item)),
        drop: (item: unknown) => {
          const reference = getChatContentDragReference(item);
          if (!reference) return;
          editTextRef.current?.appendMention?.(reference);
          return { chatContentReferenceAdded: true };
        },
        collect: monitor => ({
          isOver: monitor.isOver({ shallow: true }),
          canDrop: monitor.canDrop(),
        }),
      });
    const {
      containerRef: setMessagesContainerRef,
      enableAutoScroll,
      forceScrollToBottom,
      isScrolledToBottom,
      scrollToBottom,
      setAutoScrollEnabled,
    } = useChatAutoScroll({
      containerRef: messagesRef,
      scrollToBottomImpl: useMemoizedFn(() => {
        if (!coreRef.current) {
          return false;
        }
        coreRef.current.scrollToBottom();
        return true;
      }),
    });
    const forceScrollToBottomSoon = useMemoizedFn(() => {
      forceScrollToBottom();
      requestAnimationFrame(() => {
        forceScrollToBottom();
        requestAnimationFrame(forceScrollToBottom);
      });
    });
    const [editingDraft, setEditingDraft] = useState<EditingDraftState | null>(null);
    const [hiddenPromptContext, setHiddenPromptContext] = useState<HiddenPromptContextState | null>(
      null
    );
    const [chatError, setChatError] = useState<string | null>(null);
    const [chatRetryStatus, setChatRetryStatus] = useState<{
      attempt: number;
      maxRetries: number;
    } | null>(null);

    // 跟踪实际使用的聊天对象，解决新建对话时的状态同步问题
    const actualChatRef = useRef<ChatMessage>(currentChat);

    // 强制更新计数器，用于触发visibleMessages重新计算
    const [updateCounter, setUpdateCounter] = useState(0);

    const selectedAgentType = actualChatRef.current.agentType ?? effectiveRememberedAgentType;
    const isCodexAgent = selectedAgentType === "codex";
    const modelFeatureSupport = chatModelConfig?.features;
    const supportImage =
      isCodexAgent || (modelFeatureSupport?.image ?? modelFeatureSupport?.multimodal ?? false);
    const supportFile = !isCodexAgent && (modelFeatureSupport?.file ?? false);

    const abortControllerRef = useRef<AbortController | null>(null);
    const displayedChatIdRef = useRef(currentChat.id);
    const messageQueueRef = useRef(new ConversationMessageQueue<MessageContentItem[]>());
    const queueConversationKeyRef = useRef(`${chatScope}:${currentChat.id}`);
    const queueDrainInProgressRef = useRef(false);
    const [queueConversationKey, setQueueConversationKey] = useState(
      queueConversationKeyRef.current
    );
    const [queuedMessageCount, setQueuedMessageCount] = useState(0);
    const [queueDrainRevision, setQueueDrainRevision] = useState(0);
    const activeAssistantTurnIdRef = useRef<string | null>(null);
    const persistedAskQuestionSnapshotsRef = useRef<Set<string>>(new Set());
    const resumingAskQuestionRef = useRef<Set<string>>(new Set());
    const streamCounterRef = useRef(0);
    const resumedRunIdsRef = useRef<Set<string>>(new Set());
    const hasRestoredScrollPositionRef = useRef(false);
    const isRestoringScrollPositionRef = useRef(false);

    const activateConversationQueue = useMemoizedFn((conversationKey: string) => {
      queueConversationKeyRef.current = conversationKey;
      setQueueConversationKey(conversationKey);
      setQueuedMessageCount(messageQueueRef.current.size(conversationKey));
    });

    const migrateConversationQueue = useMemoizedFn((sourceKey: string, targetKey: string) => {
      const shouldActivateTarget = queueConversationKeyRef.current === sourceKey;
      messageQueueRef.current.move(sourceKey, targetKey);
      if (shouldActivateTarget) {
        activateConversationQueue(targetKey);
      } else if (queueConversationKeyRef.current === targetKey) {
        setQueuedMessageCount(messageQueueRef.current.size(targetKey));
      }
    });

    const getQueueConversationKey = useMemoizedFn((chatId: number) => `${chatScope}:${chatId}`);

    const getScrollPositionKey = useMemoizedFn((chatId: number) => {
      if (!preserveScrollPosition || chatId === 0) {
        return null;
      }
      return `${scrollPositionScope || chatScope}:${chatId}`;
    });

    const getVisibleMessageId = useMemoizedFn(
      (message: ChatMessage["messages"][number], index: number) =>
        message.clientId || `${actualChatRef.current.id}-${index}-${message.role}`
    );

    const saveScrollPosition = useMemoizedFn(() => {
      const key = getScrollPositionKey(actualChatRef.current.id);
      const container = messagesRef.current;
      if (!key || !container || isRestoringScrollPositionRef.current) {
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const itemElements = Array.from(
        container.querySelectorAll<HTMLElement>("[data-virtual-message-item]")
      );
      const firstVisibleItem = itemElements.find(element => {
        const rect = element.getBoundingClientRect();
        return rect.bottom > containerRect.top && rect.top < containerRect.bottom;
      });

      if (!firstVisibleItem) {
        return;
      }

      const index = Number(firstVisibleItem.dataset.index);
      if (!Number.isFinite(index)) {
        return;
      }

      CHAT_SCROLL_POSITION_CACHE.set(key, {
        index,
        messageId:
          firstVisibleItem.dataset.messageId ||
          (visibleMessages[index] ? getVisibleMessageId(visibleMessages[index], index) : undefined),
        offset: containerRect.top - firstVisibleItem.getBoundingClientRect().top,
        wasAtBottom: isScrolledToBottom(),
      });
    });

    const restoreScrollAnchor = useMemoizedFn((anchor: ChatScrollAnchor, attempt = 0) => {
      const container = messagesRef.current;
      if (!container) {
        isRestoringScrollPositionRef.current = false;
        return;
      }

      const targetIndex = anchor.messageId
        ? visibleMessages.findIndex(
            (message, index) => getVisibleMessageId(message, index) === anchor.messageId
          )
        : anchor.index;

      if (targetIndex < 0 || targetIndex >= visibleMessages.length) {
        const key = getScrollPositionKey(actualChatRef.current.id);
        if (key) {
          CHAT_SCROLL_POSITION_CACHE.delete(key);
        }
        isRestoringScrollPositionRef.current = false;
        return;
      }

      coreRef.current?.scrollToItemOffset(targetIndex, anchor.offset);
      requestAnimationFrame(() => {
        const targetElement = container.querySelector<HTMLElement>(
          `[data-virtual-message-item][data-index="${targetIndex}"]`
        );
        if (!targetElement) {
          if (attempt < 12) {
            restoreScrollAnchor(anchor, attempt + 1);
            return;
          }
          isRestoringScrollPositionRef.current = false;
          return;
        }

        const containerRect = container.getBoundingClientRect();
        const targetRect = targetElement.getBoundingClientRect();
        const currentOffset = containerRect.top - targetRect.top;
        const delta = currentOffset - anchor.offset;

        if (Math.abs(delta) > 1 && attempt < 12) {
          container.scrollTop -= delta;
          restoreScrollAnchor(anchor, attempt + 1);
          return;
        }

        isRestoringScrollPositionRef.current = false;
        saveScrollPosition();
      });
    });

    // 当切换聊天或收到同一聊天的外部最新快照时同步 ref
    useEffect(() => {
      displayedChatIdRef.current = currentChat.id;
      const actualChat = actualChatRef.current;
      const isDifferentChat = currentChat.id !== actualChat.id;
      const hasExternalSnapshot = currentChat !== actualChat;
      const nextConversationKey = getQueueConversationKey(currentChat.id);
      const isDifferentQueue = nextConversationKey !== queueConversationKeyRef.current;

      if (isDifferentChat || hasExternalSnapshot) {
        actualChatRef.current = currentChat;
        if (isDifferentChat) {
          setChatError(null);
          setChatRetryStatus(null);
        }
        if (isDifferentChat) {
          activeAssistantTurnIdRef.current = null;
          persistedAskQuestionSnapshotsRef.current.clear();
          resumingAskQuestionRef.current.clear();
          hasRestoredScrollPositionRef.current = false;
        }
        setUpdateCounter(prev => prev + 1);
      }
      if (isDifferentQueue) {
        activateConversationQueue(nextConversationKey);
      }
    }, [activateConversationQueue, currentChat, getQueueConversationKey]);

    useEffect(() => {
      if (hideInput) {
        setEditingDraft(null);
      }
    }, [hideInput]);

    const getConversationKey = useMemoizedFn((chatId: number) => {
      return `${chatScope.split(":")[0]}:${chatId}`;
    });

    const publishStreamingChatSnapshot = useMemoizedFn((chat: ChatMessage) => {
      const nextChat = withStreamingUpdateTime(chat);
      updateCurrentChat(nextChat);
      if (displayedChatIdRef.current === nextChat.id) {
        actualChatRef.current = nextChat;
        setUpdateCounter(prev => prev + 1);
        setTimeout(() => {
          scrollToBottom();
        }, 0);
      }
      return nextChat;
    });

    const buildSystemMessageWithRequest = useMemoizedFn((chat: ChatMessage) => {
      const defaultSystemPromptForSend = customSystemPrompt || DEFAULT_SYSTEM_PROMPT;
      const baseSystemContent =
        (chat.messages[0] as ResponseMessage | undefined)?.content || defaultSystemPromptForSend;
      return {
        role: Role.System,
        content: [
          {
            type: "text",
            text: baseSystemContent,
          },
        ],
      } as RequestMessage;
    });

    const buildHistoryMessages = useMemoizedFn(
      (
        chat: ChatMessage,
        options?: {
          excludeMessageIndex?: number;
        }
      ) => buildFullHistoryMessages(chat, options)
    );

    const persistFinishedChatAndGenerateTitle = useMemoizedFn(async (finishedChat: ChatMessage) => {
      const updatedChatMessage = await updateChatMessage(finishedChat);
      updateCurrentChat(updatedChatMessage);
      if (displayedChatIdRef.current === updatedChatMessage.id) {
        actualChatRef.current = updatedChatMessage;
        setUpdateCounter(prev => prev + 1);
        scrollToBottom();
      }

      try {
        if (
          ENABLE_TITLE_SUMMARY &&
          shouldGenerateChatTitle(
            updatedChatMessage,
            Boolean(titleProviderConfig && titleModelConfig)
          )
        ) {
          if (!titleProviderConfig || !titleModelConfig) {
            return updatedChatMessage;
          }

          const titleMessages = buildTitleSummaryMessages(updatedChatMessage);
          if (titleMessages.length === 0) {
            return updatedChatMessage;
          }

          chatLLMStream(
            titleProviderConfig,
            titleModelConfig,
            [
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
            {
              onFinish: async content => {
                const nextTitle = content ? formatGeneratedChatTitle(content) : "";
                if (nextTitle) {
                  const updateChat = produce(updatedChatMessage, draft => {
                    draft.title = nextTitle;
                    draft.titleDirty = true;
                  });
                  const saved = await updateChatMessage(updateChat);
                  updateCurrentChat(saved);
                  if (displayedChatIdRef.current === saved.id) {
                    actualChatRef.current = saved;
                    setUpdateCounter(prev => prev + 1);
                    titleRef.current?.setValue(nextTitle);
                  }
                }
              },
            }
          );
        }
      } catch (e) {
        console.error("Failed to generate title:", e);
      }

      return updatedChatMessage;
    });

    const getPersistedSystemContent = useMemoizedFn((chat: ChatMessage) => {
      const systemMessage = chat.messages.find(message => message.role === Role.System) as
        ResponseMessage | undefined;
      return systemMessage?.content || customSystemPrompt || DEFAULT_SYSTEM_PROMPT;
    });

    // 抽离的公共方法：处理消息发送逻辑
    const processMessageSending = useMemoizedFn(
      async (
        requestMessage: RequestMessage,
        options?: {
          shouldClearInput?: boolean;
          shouldCreateNewChat?: boolean;
          persistRequestMessage?: boolean;
          extraHistoryMessages?: RequestMessage[];
          persistedRequestMessage?: RequestMessage;
          baseChatOverride?: ChatMessage;
          runId?: string;
          attempt?: number;
          assistantMessageClientId?: string;
          toolContext?: {
            flags?: {
              forceReview?: boolean;
              feedbackProposalId?: string;
            };
          };
        }
      ) => {
        const shouldClearInput = options?.shouldClearInput ?? true;
        const shouldCreateNewChat = options?.shouldCreateNewChat ?? true;
        const persistRequestMessage = options?.persistRequestMessage ?? true;
        const persistedRequestMessage = options?.persistedRequestMessage ?? requestMessage;
        const extraHistoryMessages = options?.extraHistoryMessages || [];
        const perf = measurePerformance("sendMessage");
        let actualCurrentChat = options?.baseChatOverride || actualChatRef.current;
        let pendingSessionKey = getConversationKey(actualCurrentChat.id) as ChatSessionKey;
        const clearPending = () => setSessionPending(pendingSessionKey, false);
        setChatError(null);
        setChatRetryStatus(null);
        setSessionPending(pendingSessionKey, true);

        scrollToBottom();

        const responseMessage = createAssistantMessage({
          clientId: options?.assistantMessageClientId,
        });

        // 如果当前没有真实的对话（id为0），则先创建一个新对话
        if (shouldCreateNewChat && actualCurrentChat.id === 0) {
          const provisionalConversationKey = queueConversationKeyRef.current;
          try {
            const defaultSystemPrompt = customSystemPrompt || DEFAULT_SYSTEM_PROMPT;
            const systemContent =
              (actualCurrentChat.messages[0] as ResponseMessage | undefined)?.content ||
              defaultSystemPrompt;
            const systemMessage: ResponseMessage = {
              role: Role.System,
              content:
                (actualCurrentChat.agentType ?? selectedAgentType) === "codex"
                  ? buildCodexSystemPrompt(
                      buildSessionAwareSystemPrompt(systemContent || defaultSystemPrompt)
                    )
                  : buildSessionAwareSystemPrompt(systemContent || defaultSystemPrompt),
            };

            const newChatMessages = [systemMessage];

            // 使用外部传入的创建对话回调
            actualCurrentChat = await onCreateChat(
              newChatMessages,
              actualCurrentChat.title || "新对话",
              actualCurrentChat.agentType ?? selectedAgentType,
              actualCurrentChat.agentSessionId ?? null
            );
            const createdSessionKey = getConversationKey(actualCurrentChat.id) as ChatSessionKey;
            setSessionPending(pendingSessionKey, false);
            pendingSessionKey = createdSessionKey;
            setSessionPending(pendingSessionKey, true);
            migrateConversationQueue(
              provisionalConversationKey,
              getQueueConversationKey(actualCurrentChat.id)
            );

            // 立即更新ref，确保UI使用新创建的对话
            actualChatRef.current = actualCurrentChat;
            setUpdateCounter(prev => prev + 1);

            // 通知父组件新对话已创建
            onChatCreated?.(actualCurrentChat.id);
          } catch (error) {
            message.error("创建新对话失败");
            clearPending();
            return false;
          }
        }

        const sendMessages: RequestMessage[] = [
          buildSystemMessageWithRequest(actualCurrentChat),
          ...buildHistoryMessages(actualCurrentChat),
          ...extraHistoryMessages,
          requestMessage,
        ];
        const conversationKey = getConversationKey(actualCurrentChat.id);
        const streamId = `${conversationKey}:${++streamCounterRef.current}`;

        // 立即添加用户消息和初始的助手回复到状态中
        const hasAssistantPlaceholder = actualCurrentChat.messages.some(
          item => item.role === Role.Assistant && item.clientId === responseMessage.clientId
        );
        const chatWithNewMessages = {
          ...actualCurrentChat,
          messages: [
            ...actualCurrentChat.messages,
            ...(persistRequestMessage ? [persistedRequestMessage] : []),
            ...(hasAssistantPlaceholder ? [] : [responseMessage]),
          ],
        };

        // 更新当前聊天状态
        actualCurrentChat = chatWithNewMessages;
        actualChatRef.current = chatWithNewMessages;
        setUpdateCounter(prev => prev + 1);
        updateCurrentChat(chatWithNewMessages);
        // 先写入用户消息和助手占位符，后台任务即使在组件卸载后也能恢复。
        actualCurrentChat = await updateChatMessage(chatWithNewMessages);
        actualChatRef.current = actualCurrentChat;

        let activeRunId: string | null = null;
        try {
          const source = chatScope.split(":")[0] as ChatSource;
          const run = await chatRunManager.start({
            runId: options?.runId,
            sessionKey: conversationKey as ChatSessionKey,
            source,
            chatId: actualCurrentChat.id,
            agentType: actualCurrentChat.agentType ?? selectedAgentType,
            status: "running",
            requestPayload: sendMessages,
            userMessageClientId: persistedRequestMessage.clientId || "",
            assistantMessageClientId: responseMessage.clientId || "",
            agentSessionId: actualCurrentChat.agentSessionId ?? null,
            attempt: options?.attempt ?? 0,
            assistantSnapshot: "",
            reasoningSnapshot: "",
            toolSnapshot: [],
            errorMessage: null,
          });
          activeRunId = run.runId;
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") {
            clearPending();
            return false;
          }
          console.warn("创建聊天后台任务记录失败，继续使用当前流:", error);
        }

        // 添加新消息后立即强制贴底，避免虚拟列表测量期间被 scroll 监听误判为用户离开底部。
        enableAutoScroll();
        setTimeout(forceScrollToBottomSoon, 0);

        if (shouldClearInput) {
          editTextRef.current?.clear();
        }

        if (actualCurrentChat.agentType === "codex") {
          const rawCodexInput = await buildCodexInputFromMessageContent(requestMessage.content);
          const codexInput = actualCurrentChat.agentSessionId
            ? rawCodexInput
            : prependCodexSystemPromptToInput(
                rawCodexInput,
                buildCodexSystemPrompt(getPersistedSystemContent(actualCurrentChat))
              );
          if (codexInput.length === 0) {
            message.warning("请输入内容");
            clearPending();
            return false;
          }

          const codexTurnId = `${streamId}:codex`;
          const codexTurnIds = new Set<string>();
          const resolveCodexTurnId = (turnId?: string) => {
            const resolvedTurnId = turnId ? `${codexTurnId}:${turnId}` : codexTurnId;
            codexTurnIds.add(resolvedTurnId);
            return resolvedTurnId;
          };
          const finalizeCodexTurns = (message: ResponseMessage) => {
            const turnIds = codexTurnIds.size > 0 ? Array.from(codexTurnIds) : [codexTurnId];
            turnIds.forEach(turnId => {
              finalizeAssistantTurn(message, turnId);
            });
          };
          activeAssistantTurnIdRef.current = codexTurnId;
          const controller = new AbortController();
          abortControllerRef.current = controller;
          let codexRunCompleted = false;
          if (activeRunId) chatRunManager.attachController(activeRunId, controller);

          const applyCodexMappedEvent = (event: CodexMappedEvent) => {
            if (event.type === "thread-started") {
              const updatedChat = {
                ...actualCurrentChat,
                agentSessionId: event.threadId,
              };
              actualCurrentChat = publishStreamingChatSnapshot(updatedChat);
              if (activeRunId)
                chatRunManager.update(activeRunId, {
                  agentSessionId: event.threadId,
                });
              return;
            }

            if (event.type === "text-delta") {
              const eventTurnId = resolveCodexTurnId(event.turnId);
              const updatedChat = produce(actualCurrentChat, draft => {
                const lastMessageIndex = draft.messages.length - 1;
                if (
                  lastMessageIndex >= 0 &&
                  draft.messages[lastMessageIndex].role === Role.Assistant
                ) {
                  applyAssistantTextSnapshot(
                    draft.messages[lastMessageIndex] as ResponseMessage,
                    eventTurnId,
                    event.responseText
                  );
                }
              });
              actualCurrentChat = publishStreamingChatSnapshot(updatedChat);
              if (activeRunId)
                chatRunManager.update(activeRunId, {
                  assistantSnapshot: event.responseText,
                });
              return;
            }

            if (event.type === "reasoning-delta") {
              const eventTurnId = resolveCodexTurnId(event.turnId);
              const updatedChat = produce(actualCurrentChat, draft => {
                const lastMessageIndex = draft.messages.length - 1;
                if (
                  lastMessageIndex >= 0 &&
                  draft.messages[lastMessageIndex].role === Role.Assistant
                ) {
                  applyAssistantReasoningSnapshot(
                    draft.messages[lastMessageIndex] as ResponseMessage,
                    eventTurnId,
                    event.reasoningText
                  );
                }
              });
              actualCurrentChat = publishStreamingChatSnapshot(updatedChat);
              if (activeRunId)
                chatRunManager.update(activeRunId, {
                  reasoningSnapshot: event.reasoningText,
                });
              return;
            }

            if (event.type === "tool-calls-update") {
              const eventTurnId = resolveCodexTurnId(event.turnId);
              const updatedChat = produce(actualCurrentChat, draft => {
                const lastMessageIndex = draft.messages.length - 1;
                if (
                  lastMessageIndex >= 0 &&
                  draft.messages[lastMessageIndex].role === Role.Assistant
                ) {
                  applyAssistantToolCallsSnapshot(
                    draft.messages[lastMessageIndex] as ResponseMessage,
                    eventTurnId,
                    event.executions,
                    event.toolCalls
                  );
                }
              });
              actualCurrentChat = publishStreamingChatSnapshot(updatedChat);
              if (activeRunId)
                chatRunManager.update(activeRunId, {
                  toolSnapshot: event.executions,
                });
              return;
            }

            if (event.type === "error") {
              console.error("Codex stream error:", event.error);
            }
          };

          try {
            await streamCodexChat({
              input: codexInput,
              runId: activeRunId ?? undefined,
              sessionKey: conversationKey,
              agentSessionId: actualCurrentChat.agentSessionId ?? null,
              workingDirectory: codexWorkingDirectory ?? null,
              signal: controller.signal,
              onEvent: applyCodexMappedEvent,
            });

            const finalizedChat = produce(actualCurrentChat, draft => {
              const lastMessageIndex = draft.messages.length - 1;
              if (
                lastMessageIndex >= 0 &&
                draft.messages[lastMessageIndex].role === Role.Assistant
              ) {
                finalizeCodexTurns(draft.messages[lastMessageIndex] as ResponseMessage);
              }
            });

            activeAssistantTurnIdRef.current = null;
            actualCurrentChat = await persistFinishedChatAndGenerateTitle(finalizedChat);
            codexRunCompleted = true;
          } catch (error) {
            const isAbortError = error instanceof Error && error.name === "AbortError";
            const finalizedChat = produce(actualCurrentChat, draft => {
              const lastMessageIndex = draft.messages.length - 1;
              if (
                lastMessageIndex >= 0 &&
                draft.messages[lastMessageIndex].role === Role.Assistant
              ) {
                finalizeCodexTurns(draft.messages[lastMessageIndex] as ResponseMessage);
              }
            });
            actualCurrentChat = finalizedChat;
            updateCurrentChat(finalizedChat);
            if (displayedChatIdRef.current === finalizedChat.id) {
              actualChatRef.current = finalizedChat;
              setUpdateCounter(prev => prev + 1);
            }
            let finalizedChatPersisted = false;
            try {
              actualCurrentChat = await updateChatMessage(finalizedChat);
              finalizedChatPersisted = true;
            } catch (persistError) {
              console.error("Codex 失败后持久化对话失败:", persistError);
            }
            if (activeRunId) {
              if (isAbortError && finalizedChatPersisted) {
                chatRunManager.finalizePersisted(activeRunId, "cancelled");
              } else {
                chatRunManager.finish(
                  activeRunId,
                  isAbortError ? "cancelled" : "failed",
                  isAbortError ? null : error instanceof Error ? error.message : "Codex 请求失败"
                );
              }
            }
            if (activeAssistantTurnIdRef.current === codexTurnId) {
              activeAssistantTurnIdRef.current = null;
            }
            if (!isAbortError) {
              message.error(error instanceof Error ? error.message : "Codex 请求失败");
            }
          } finally {
            clearPending();
            abortControllerRef.current = null;
            if (activeRunId && codexRunCompleted)
              chatRunManager.finalizePersisted(activeRunId, "completed");
            perf.end();
            if (shouldClearInput) {
              setTimeout(() => {
                editTextRef.current?.focusEnd();
              }, 100);
            }
          }

          return true;
        }

        if (!chatProviderConfig || !chatModelConfig) {
          message.error("请先在设置中配置对话功能的大模型");
          clearPending();
          return false;
        }

        let resolveStreamAttempt: (() => void) | null = null;
        let rejectStreamAttempt: ((error: unknown) => void) | null = null;
        let activeLocalAssistantTurnId: string | null = null;

        const finalizeLocalAssistantTurn = () => {
          if (!activeLocalAssistantTurnId) return null;
          const finalizedChat = produce(actualCurrentChat, draft => {
            const lastMessage = draft.messages.at(-1);
            if (lastMessage?.role === Role.Assistant) {
              finalizeAssistantTurn(lastMessage as ResponseMessage, activeLocalAssistantTurnId!);
            }
          });
          activeLocalAssistantTurnId = null;
          actualCurrentChat = finalizedChat;
          return finalizedChat;
        };

        const resetAssistantForRetry = () => {
          const resetChat = produce(actualCurrentChat, draft => {
            const lastMessageIndex = draft.messages.length - 1;
            const lastMessage = draft.messages[lastMessageIndex];
            if (lastMessage?.role === Role.Assistant) {
              draft.messages[lastMessageIndex] = createAssistantMessage({
                clientId: (lastMessage as ResponseMessage).clientId,
              });
            }
          });
          actualCurrentChat = resetChat;
          updateCurrentChat(resetChat);
          if (displayedChatIdRef.current === resetChat.id) {
            actualChatRef.current = resetChat;
            setUpdateCounter(prev => prev + 1);
          }
        };

        const runStreamAttempt = async (): Promise<void> => {
          await new Promise<void>((resolve, reject) => {
            resolveStreamAttempt = resolve;
            rejectStreamAttempt = reject;
            void chatLLMStream(chatProviderConfig, chatModelConfig, sendMessages, {
              enableTools: true,
              conversationKey,
              toolContext: options?.toolContext,
              skills,
              reasoningEffort: chatModelConfig?.features?.thinking
                ? normalizedReasoningEffort
                : undefined,
              onFinish: () => {},

              onAssistantTurnEnd: async ({ turnId, resultType, providerMetadata }) => {
                activeLocalAssistantTurnId = null;
                const finalizedChat = produce(actualCurrentChat, draft => {
                  const lastMessageIndex = draft.messages.length - 1;
                  if (
                    lastMessageIndex >= 0 &&
                    draft.messages[lastMessageIndex].role === Role.Assistant
                  ) {
                    const lastMessage = draft.messages[lastMessageIndex] as ResponseMessage;
                    applyAssistantProviderMetadataSnapshot(lastMessage, turnId, providerMetadata);
                    finalizeAssistantTurn(lastMessage, turnId);
                  }
                });

                actualCurrentChat = finalizedChat;
                updateCurrentChat(finalizedChat);
                if (displayedChatIdRef.current === finalizedChat.id) {
                  actualChatRef.current = finalizedChat;
                  setUpdateCounter(prev => prev + 1);
                }
                if (activeRunId && resultType === "response") {
                  chatRunManager.update(
                    activeRunId,
                    {
                      assistantSnapshot:
                        (finalizedChat.messages.at(-1) as ResponseMessage)?.content || "",
                      reasoningSnapshot:
                        (finalizedChat.messages.at(-1) as ResponseMessage)?.reasoning_content || "",
                    },
                    true
                  );
                }

                if (resultType !== "response") {
                  return;
                }

                try {
                  actualCurrentChat = await persistFinishedChatAndGenerateTitle(finalizedChat);
                  if (activeRunId) {
                    chatRunManager.finalizePersisted(activeRunId, "completed");
                  }
                } catch (error) {
                  if (activeRunId) {
                    chatRunManager.finish(
                      activeRunId,
                      "failed",
                      error instanceof Error ? error.message : "最终会话持久化失败"
                    );
                  }
                  message.error("Failed to update chat");
                  console.error(error);
                } finally {
                  resolveStreamAttempt?.();
                }
                setChatError(null);
                setChatRetryStatus(null);
              },

              onUpdate: (full: string, _inc: string, _reasoningText?: string, turnId?: string) => {
                setChatRetryStatus(null);
                if (turnId) {
                  activeLocalAssistantTurnId = turnId;
                }
                // 基于当前实际聊天对象进行更新
                const updatedChat = produce(actualCurrentChat, draft => {
                  // 找到最后一条助手消息并更新其内容
                  const lastMessageIndex = draft.messages.length - 1;
                  if (
                    lastMessageIndex >= 0 &&
                    draft.messages[lastMessageIndex].role === Role.Assistant
                  ) {
                    const lastMessage = draft.messages[lastMessageIndex] as ResponseMessage;
                    applyAssistantTextSnapshot(
                      lastMessage,
                      turnId || `${streamId}:fallback-text`,
                      full
                    );
                  }
                });

                actualCurrentChat = publishStreamingChatSnapshot(updatedChat);
                if (activeRunId)
                  chatRunManager.update(activeRunId, {
                    assistantSnapshot: full,
                  });
              },

              onReasoning: (full: string, _inc: string, turnId?: string) => {
                setChatRetryStatus(null);
                if (turnId) {
                  activeLocalAssistantTurnId = turnId;
                }
                // 基于当前实际聊天对象进行更新
                const updatedChat = produce(actualCurrentChat, draft => {
                  // 找到最后一条助手消息并更新其推理内容
                  const lastMessageIndex = draft.messages.length - 1;
                  if (
                    lastMessageIndex >= 0 &&
                    draft.messages[lastMessageIndex].role === Role.Assistant
                  ) {
                    const lastMessage = draft.messages[lastMessageIndex] as ResponseMessage;
                    applyAssistantReasoningSnapshot(
                      lastMessage,
                      turnId || `${streamId}:fallback-reasoning`,
                      full
                    );
                  }
                });

                actualCurrentChat = publishStreamingChatSnapshot(updatedChat);
                if (activeRunId)
                  chatRunManager.update(activeRunId, {
                    reasoningSnapshot: full,
                  });
              },

              onUsage: usage => {
                const updatedChat = produce(actualCurrentChat, draft => {
                  const lastMessage = draft.messages[draft.messages.length - 1];
                  if (lastMessage?.role === Role.Assistant) {
                    (lastMessage as ResponseMessage).usage = {
                      ...usage,
                      providerId: chatProviderConfig.id,
                      modelName: chatModelConfig.name,
                    };
                  }
                });
                actualCurrentChat = publishStreamingChatSnapshot(updatedChat);
              },

              onToolCallsUpdate: (
                executions: ToolCallExecutionState[],
                turnId?: string,
                toolCalls?: ToolCallPayload[]
              ) => {
                setChatRetryStatus(null);
                if (turnId) {
                  activeLocalAssistantTurnId = turnId;
                }
                // 基于当前实际聊天对象进行更新
                const updatedChat = produce(actualCurrentChat, draft => {
                  // 找到最后一条助手消息并更新其工具执行状态
                  const lastMessageIndex = draft.messages.length - 1;
                  if (
                    lastMessageIndex >= 0 &&
                    draft.messages[lastMessageIndex].role === Role.Assistant
                  ) {
                    const lastMessage = draft.messages[lastMessageIndex] as ResponseMessage;
                    applyAssistantToolCallsSnapshot(
                      lastMessage,
                      turnId || `${streamId}:fallback-tool`,
                      executions,
                      toolCalls
                    );
                  }
                });

                const publishedChat = publishStreamingChatSnapshot(updatedChat);
                actualCurrentChat = publishedChat;

                // ask-question 进入等待态时，立即持久化快照，确保应用重启后可恢复
                const pendingAskQuestionExecutions = executions.filter(
                  execution =>
                    execution.toolName === ASK_QUESTION_TOOL_NAME &&
                    (execution.status === "pending" ||
                      execution.status === "executing" ||
                      execution.status === "retrying")
                );
                if (activeRunId) {
                  const currentRun = chatRunManager.getSnapshot(conversationKey as ChatSessionKey);
                  const nextStatus =
                    pendingAskQuestionExecutions.length > 0
                      ? "waiting_input"
                      : currentRun?.status === "waiting_input"
                        ? "running"
                        : undefined;
                  chatRunManager.update(
                    activeRunId,
                    {
                      toolSnapshot: executions,
                      ...(nextStatus ? { status: nextStatus } : {}),
                    },
                    Boolean(nextStatus)
                  );
                }
                const shouldPersistSnapshot = pendingAskQuestionExecutions.some(
                  execution =>
                    !persistedAskQuestionSnapshotsRef.current.has(
                      buildAskQuestionExecutionSnapshotKey(execution)
                    )
                );
                if (shouldPersistSnapshot) {
                  pendingAskQuestionExecutions.forEach(execution => {
                    persistedAskQuestionSnapshotsRef.current.add(
                      buildAskQuestionExecutionSnapshotKey(execution)
                    );
                  });
                  void updateChatMessage(publishedChat).catch(error => {
                    console.error("持久化 ask-question 快照失败:", error);
                  });
                }
              },

              onError: error => {
                const finalizedChat = finalizeLocalAssistantTurn();
                if (finalizedChat) {
                  actualCurrentChat = finalizedChat;
                }
                updateCurrentChat(actualCurrentChat);
                abortControllerRef.current = null;
                rejectStreamAttempt?.(error);
                if (activeRunId)
                  chatRunManager.update(activeRunId, {
                    status: "retrying",
                    errorMessage: error instanceof Error ? error.message : "聊天请求失败",
                  });
              },

              onController: (controller: AbortController) => {
                abortControllerRef.current = controller;
                if (activeRunId) chatRunManager.attachController(activeRunId, controller);
              },
            });
          });
        };

        let lastError: unknown = null;
        for (let retryCount = 0; retryCount <= DEFAULT_CHAT_MAX_RETRIES; retryCount += 1) {
          try {
            await runStreamAttempt();
            clearPending();
            abortControllerRef.current = null;
            setChatError(null);
            setChatRetryStatus(null);
            perf.end();
            if (shouldClearInput) {
              setTimeout(() => editTextRef.current?.focusEnd(), 100);
            }
            return true;
          } catch (error) {
            lastError = error;
            const isAbortError = error instanceof Error && error.name === "AbortError";
            const shouldStopRetrying =
              isAbortError || isContextLengthError(error) || retryCount >= DEFAULT_CHAT_MAX_RETRIES;

            if (shouldStopRetrying) {
              const errorMessage = getErrorMessage(error);
              const shouldRestoreInput = shouldRestoreInputAfterSendError(error);
              const failedQueueConversationKey = getQueueConversationKey(actualCurrentChat.id);
              const shouldRestoreFailedInput =
                shouldClearInput &&
                shouldRestoreInput &&
                queueConversationKeyRef.current === failedQueueConversationKey &&
                messageQueueRef.current.size(failedQueueConversationKey) === 0;
              setChatRetryStatus(null);
              setChatError(isAbortError ? null : errorMessage);
              clearPending();
              abortControllerRef.current = null;
              let finalizedChatPersisted = false;
              try {
                actualCurrentChat = await updateChatMessage(actualCurrentChat);
                finalizedChatPersisted = true;
              } catch (persistError) {
                console.error("聊天终止后持久化对话失败:", persistError);
              }
              if (activeRunId) {
                if (isAbortError && finalizedChatPersisted) {
                  chatRunManager.finalizePersisted(activeRunId, "cancelled");
                } else {
                  chatRunManager.finish(
                    activeRunId,
                    isAbortError ? "cancelled" : "failed",
                    isAbortError ? null : errorMessage
                  );
                }
              }
              perf.end();
              if (shouldRestoreFailedInput) {
                setTimeout(() => {
                  const currentInput = editTextRef.current?.getValue() || [];
                  const hasCurrentDraft = currentInput.some(item =>
                    item.type === "text" ? item.text.trim().length > 0 : true
                  );
                  const textContent = Array.isArray(requestMessage.content)
                    ? requestMessage.content
                        .filter(item => item.type === "text")
                        .map(item => item.text)
                        .join("\n")
                    : typeof requestMessage.content === "string"
                      ? requestMessage.content
                      : "";
                  if (!hasCurrentDraft) {
                    editTextRef.current?.setValue(textContent);
                  }
                  editTextRef.current?.focusEnd();
                }, 100);
              }
              if (!isAbortError) {
                console.error("聊天请求失败:", errorMessage);
              }
              return true;
            }

            const nextRetry = retryCount + 1;
            if (activeRunId) {
              chatRunManager.update(activeRunId, {
                status: "retrying",
                attempt: nextRetry,
              });
            }
            setChatRetryStatus({
              attempt: nextRetry,
              maxRetries: DEFAULT_CHAT_MAX_RETRIES,
            });
            resetAssistantForRetry();
            const retryDelayController = new AbortController();
            abortControllerRef.current = retryDelayController;
            if (activeRunId) {
              chatRunManager.attachController(activeRunId, retryDelayController);
            }
            const shouldContinue = await new Promise<boolean>(resolve => {
              const timer = setTimeout(() => {
                retryDelayController.signal.removeEventListener("abort", handleAbort);
                resolve(true);
              }, 1000 * nextRetry);
              const handleAbort = () => {
                clearTimeout(timer);
                resolve(false);
              };
              retryDelayController.signal.addEventListener("abort", handleAbort, { once: true });
            });
            if (!shouldContinue) {
              setChatRetryStatus(null);
              setChatError(null);
              abortControllerRef.current = null;
              perf.end();
              return true;
            }
          }
        }

        setChatError(getErrorMessage(lastError));
        clearPending();
        return true;
      }
    );

    useEffect(() => {
      if (
        !sessionRun ||
        sessionRun.status !== "interrupted" ||
        currentChat.id === 0 ||
        pendingSessionKeys.has(sessionKey) ||
        resumedRunIdsRef.current.has(sessionRun.runId)
      ) {
        return;
      }

      const requestMessage = [...sessionRun.requestPayload]
        .reverse()
        .find(item => item.role === Role.User) as RequestMessage | undefined;
      if (!requestMessage) {
        chatRunManager.finish(sessionRun.runId, "failed", "缺少可恢复的用户请求");
        return;
      }

      resumedRunIdsRef.current.add(sessionRun.runId);
      void (async () => {
        const resumedRun = await chatRunManager.resume(sessionRun.runId);
        if (!resumedRun) return;
        const baseChat = produce(currentChat, draft => {
          const assistantIndex = draft.messages.findIndex(
            item => item.clientId === resumedRun.assistantMessageClientId
          );
          if (assistantIndex >= 0) {
            draft.messages[assistantIndex] = createAssistantMessage({
              clientId: resumedRun.assistantMessageClientId,
            });
          }
        });
        await processMessageSending(requestMessage, {
          shouldClearInput: false,
          shouldCreateNewChat: false,
          persistRequestMessage: false,
          baseChatOverride: baseChat,
          runId: resumedRun.runId,
          attempt: resumedRun.attempt,
          assistantMessageClientId: resumedRun.assistantMessageClientId,
        });
      })();
    }, [currentChat, pendingSessionKeys, processMessageSending, sessionKey, sessionRun]);

    const submittedAskQuestionSessions = useMemo(() => {
      const activeChat = actualChatRef.current;
      const conversationKey = getConversationKey(activeChat.id);
      return Object.values(askQuestionRecords)
        .filter(
          record =>
            record.conversationKey === conversationKey &&
            record.status === "submitted" &&
            Boolean(record.submittedAnswers)
        )
        .sort((a, b) => a.updatedAt - b.updatedAt);
    }, [askQuestionRecords, getConversationKey, updateCounter]);

    useEffect(() => {
      const shouldResumePersistedWaitingRun = Boolean(
        sessionRun?.status === "waiting_input" && !chatRunManager.hasController(sessionRun.runId)
      );
      if (hideInput || (sendLoading && !shouldResumePersistedWaitingRun)) {
        return;
      }

      const pendingSession = submittedAskQuestionSessions.find(
        session => !resumingAskQuestionRef.current.has(session.sessionId)
      );
      if (!pendingSession || !pendingSession.submittedAnswers) {
        return;
      }
      if (!chatProviderConfig || !chatModelConfig) {
        return;
      }

      resumingAskQuestionRef.current.add(pendingSession.sessionId);

      const askQuestionResult = buildAskQuestionToolResult(
        pendingSession.payload,
        pendingSession.submittedAnswers
      );
      const answerJson = JSON.stringify(askQuestionResult, null, 2);

      const currentChatSnapshot = actualChatRef.current;
      const resolvedChat = markAskQuestionExecutionResolved(
        currentChatSnapshot,
        pendingSession.toolCallId,
        pendingSession.rawInput,
        answerJson
      );
      actualChatRef.current = resolvedChat;
      setUpdateCounter(prev => prev + 1);
      updateCurrentChat(resolvedChat);
      void updateChatMessage(resolvedChat).catch(error => {
        console.error("恢复 ask-question 快照持久化失败:", error);
      });

      completeAskQuestionSession(pendingSession.sessionId);

      const resumeToolResultMessage: RequestMessage = {
        role: Role.Tool,
        content: [
          {
            type: "text",
            text: answerJson,
          },
        ],
        tool_call_id: pendingSession.toolCallId,
        name: ASK_QUESTION_TOOL_NAME,
      };

      const historyMessages = buildHistoryMessages(actualChatRef.current);
      const hasAssistantToolCallMessage = historyMessages.some(
        message =>
          message.role === Role.Assistant &&
          Boolean(
            message.tool_calls?.some(
              call =>
                call.id === pendingSession.toolCallId &&
                call.function.name === ASK_QUESTION_TOOL_NAME
            )
          )
      );
      const bridgeAssistantToolCallMessage: RequestMessage = {
        role: Role.Assistant,
        content: "",
        reasoning_content: "",
        tool_calls: [
          {
            id: pendingSession.toolCallId,
            type: "function",
            function: {
              name: ASK_QUESTION_TOOL_NAME,
              arguments: pendingSession.rawInput,
            },
          },
        ],
      };

      void processMessageSending(resumeToolResultMessage, {
        shouldClearInput: false,
        shouldCreateNewChat: false,
        persistRequestMessage: false,
        runId: shouldResumePersistedWaitingRun ? sessionRun?.runId : undefined,
        attempt: shouldResumePersistedWaitingRun ? sessionRun?.attempt : undefined,
        extraHistoryMessages: hasAssistantToolCallMessage ? [] : [bridgeAssistantToolCallMessage],
      });
    }, [
      hideInput,
      sendLoading,
      submittedAskQuestionSessions,
      processMessageSending,
      buildHistoryMessages,
      updateCurrentChat,
      updateChatMessage,
      completeAskQuestionSession,
      chatProviderConfig,
      chatModelConfig,
      sessionRun,
    ]);

    useImperativeHandle(ref, () => ({
      scrollToTop: () => {
        if (messagesRef.current) {
          if ("scrollTo" in messagesRef.current) {
            messagesRef.current.scrollTo({ top: 0, behavior: "smooth" });
          }
        }
      },
      focusInput: () => {
        editTextRef.current?.focusEnd();
      },
      setInputValue: (value: string) => {
        editTextRef.current?.setValue(value);
      },
      sendUserMessage: async (content: MessageContentItem[]) => {
        return await submitMessageContent(content);
      },
    }));

    const onSelectModel = useMemoizedFn((providerId: string, modelName: string) => {
      useSettingStore.setState(
        produce(draft => {
          draft.setting.llmUsageSettings.chat.providerId = providerId;
          draft.setting.llmUsageSettings.chat.modelName = modelName;
        })
      );
    });

    // 模型选择菜单
    const modelSelectItems = useMemo(() => {
      return llmConfigs.map(provider => ({
        key: provider.id,
        label: provider.name,
        children: provider.models?.map(model => ({
          key: `${provider.id}::${model.name}`,
          label: (
            <div>
              <div>{model.name}</div>
              <div style={{ fontSize: "12px", color: "#999" }}>{model.description}</div>
            </div>
          ),
        })),
      }));
    }, [llmConfigs]);

    // 处理模型选择
    const handleModelSelect = useMemoizedFn(({ key }: { key: string }) => {
      const [providerId, modelName] = key.split("::");

      onSelectModel(providerId, modelName);

      // 更新全局配置
      useSettingStore.setState(
        produce(draft => {
          if (!draft.setting.llmUsageSettings.chat) {
            draft.setting.llmUsageSettings.chat = {
              providerId: "",
              modelName: "",
            };
          }
          draft.setting.llmUsageSettings.chat.providerId = providerId;
          draft.setting.llmUsageSettings.chat.modelName = modelName;
        })
      );
    });

    const visibleMessages = useMemo(() => {
      return actualChatRef.current.messages.filter(message => message.role !== Role.System);
    }, [updateCounter]);

    const contextUsage = useMemo(() => {
      for (let index = actualChatRef.current.messages.length - 1; index >= 0; index -= 1) {
        const chatMessage = actualChatRef.current.messages[index];
        if (chatMessage.role !== Role.Assistant) {
          continue;
        }
        const usage = (chatMessage as ResponseMessage).usage;
        if (!usage) {
          continue;
        }
        const matchesCurrentModel =
          (!usage.providerId || usage.providerId === chatProviderConfig?.id) &&
          (!usage.modelName || usage.modelName === chatModelConfig?.name);
        return matchesCurrentModel ? usage : null;
      }
      return null;
    }, [chatModelConfig?.name, chatProviderConfig?.id, updateCounter]);

    const handleAgentTypeChange = useMemoizedFn(async (agentType: ChatAgentType) => {
      if (visibleMessages.length > 0 || sendLoading) {
        return;
      }

      const updatedChat = {
        ...actualChatRef.current,
        agentType,
        agentSessionId:
          agentType === actualChatRef.current.agentType
            ? (actualChatRef.current.agentSessionId ?? null)
            : null,
      };
      actualChatRef.current = updatedChat;
      setRememberedAgentType(agentType);
      setUpdateCounter(prev => prev + 1);
      updateCurrentChat(updatedChat);
    });
    const handleSelectCodexWorkingDirectory = useMemoizedFn(async () => {
      if (sendLoading) {
        return;
      }

      try {
        const selectedDirectory = await selectDirectoryWithDialog();
        if (selectedDirectory) {
          setCodexWorkingDirectory(selectedDirectory);
        }
      } catch (error) {
        console.warn("选择 Codex 工作目录失败:", error);
      }
    });
    const handleClearCodexWorkingDirectory = useMemoizedFn(() => {
      if (sendLoading) {
        return;
      }

      setCodexWorkingDirectory(null);
    });

    const lastUserMessageIndex = useMemo(
      () => getLastUserMessageIndex(visibleMessages),
      [visibleMessages]
    );
    const lastVisibleMessageRole =
      visibleMessages.length > 0 ? visibleMessages[visibleMessages.length - 1]?.role : undefined;

    useEffect(() => {
      if (!editingDraft) {
        return;
      }

      const targetMessage = visibleMessages[editingDraft.messageIndex];
      const isEditingTargetStillValid =
        editingDraft.messageIndex === lastUserMessageIndex && targetMessage?.role === Role.User;

      if (!isEditingTargetStillValid) {
        setEditingDraft(null);
      }
    }, [editingDraft, lastUserMessageIndex, visibleMessages]);

    // 停止流式请求
    const stopStreaming = useMemoizedFn(() => {
      const activeSessionKey = getConversationKey(actualChatRef.current.id) as ChatSessionKey;
      const activeRun = chatRunManager.getSnapshot(activeSessionKey);
      if (
        !activeRun ||
        !["queued", "running", "retrying", "waiting_input"].includes(activeRun.status)
      ) {
        return;
      }
      chatRunManager.cancel(activeSessionKey);
      setSessionPending(activeSessionKey, false);
    });

    useEffect(() => {
      const container = messagesRef.current;
      if (!preserveScrollPosition || !container) {
        return;
      }

      container.addEventListener("scroll", saveScrollPosition);
      return () => {
        saveScrollPosition();
        container.removeEventListener("scroll", saveScrollPosition);
      };
    }, [currentChat.id, preserveScrollPosition, saveScrollPosition]);

    // 初始加载时恢复滚动位置；没有历史位置时才滚动到底部
    useEffect(() => {
      const key = getScrollPositionKey(currentChat.id);
      const savedAnchor = key !== null ? CHAT_SCROLL_POSITION_CACHE.get(key) : undefined;

      if (savedAnchor && !hasRestoredScrollPositionRef.current) {
        const savedAnchorIndex = savedAnchor.messageId
          ? visibleMessages.findIndex(
              (message, index) => getVisibleMessageId(message, index) === savedAnchor.messageId
            )
          : savedAnchor.index;

        if (savedAnchorIndex < 0 || savedAnchorIndex >= visibleMessages.length) {
          if (key) {
            CHAT_SCROLL_POSITION_CACHE.delete(key);
          }
        } else if (savedAnchor.wasAtBottom) {
          hasRestoredScrollPositionRef.current = true;
          const timer = setTimeout(forceScrollToBottomSoon, 100);
          return () => clearTimeout(timer);
        } else {
          setAutoScrollEnabled(false);
          isRestoringScrollPositionRef.current = true;
          hasRestoredScrollPositionRef.current = true;
          const timer = setTimeout(() => {
            restoreScrollAnchor(savedAnchor);
            requestAnimationFrame(() => {
              if (isScrolledToBottom()) {
                enableAutoScroll();
                return;
              }
              setAutoScrollEnabled(false);
            });
          }, 100);
          return () => {
            isRestoringScrollPositionRef.current = false;
            clearTimeout(timer);
          };
        }
      }

      if (!hasRestoredScrollPositionRef.current) {
        hasRestoredScrollPositionRef.current = true;
        const timer = setTimeout(forceScrollToBottomSoon, 100);
        return () => clearTimeout(timer);
      }
    }, [
      currentChat.id,
      enableAutoScroll,
      forceScrollToBottom,
      getScrollPositionKey,
      isScrolledToBottom,
      restoreScrollAnchor,
      setAutoScrollEnabled,
      visibleMessages.length,
    ]);

    // 在消息列表变化时滚动到底部（仅在自动滚动启用时）
    useEffect(() => {
      if (visibleMessages.length > 0) {
        setTimeout(() => {
          if (sendLoading || lastVisibleMessageRole === Role.User) {
            forceScrollToBottomSoon();
            return;
          }
          scrollToBottom();
        }, 0);
      }
    }, [
      forceScrollToBottomSoon,
      lastVisibleMessageRole,
      scrollToBottom,
      sendLoading,
      visibleMessages.length,
    ]);

    // 监听消息内容变化（仅在自动滚动启用时）
    useEffect(() => {
      if (visibleMessages.length > 0) {
        const lastMessage = visibleMessages[visibleMessages.length - 1];
        if (lastMessage && lastMessage.role === Role.Assistant) {
          scrollToBottom();
        }
      }
    }, [visibleMessages, scrollToBottom]);

    const sendMessageContent = useMemoizedFn(
      async (
        userContent: MessageContentItem[],
        expectedConversationKey = queueConversationKeyRef.current
      ) => {
        if (
          expectedConversationKey !== queueConversationKeyRef.current ||
          expectedConversationKey !== getQueueConversationKey(actualChatRef.current.id)
        ) {
          return false;
        }

        if (!userContent || userContent.length === 0) {
          message.warning("请输入内容");
          return false;
        }

        const hasMeaningfulContent = userContent.some(item => {
          if (item.type === "text") {
            return item.text.trim().length > 0;
          }
          return true;
        });
        if (!hasMeaningfulContent) {
          message.warning("请输入内容");
          return false;
        }

        if (isCodexAgent && userContent.some(item => item.type === "file")) {
          message.warning("Codex 当前暂不支持 PDF/文件输入");
          return false;
        }

        if (isCodexAgent && editingDraft) {
          message.warning("Codex 会话暂不支持编辑后重新发送");
          return false;
        }

        if (beforeSendUserMessage) {
          const shouldContinue = await beforeSendUserMessage(userContent);
          if (shouldContinue === false) {
            return false;
          }
          if (
            expectedConversationKey !== queueConversationKeyRef.current ||
            expectedConversationKey !== getQueueConversationKey(actualChatRef.current.id)
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

        const resetBaseChat = editingDraft
          ? buildResetBaseChat(actualChatRef.current, editingDraft.messageIndex)
          : null;

        if (editingDraft && !resetBaseChat) {
          setEditingDraft(null);
          message.warning("只能编辑最后一条用户消息");
          return false;
        }

        setEditingDraft(null);
        const sent = await processMessageSending(requestMessageForModel, {
          shouldClearInput: true,
          shouldCreateNewChat: true,
          persistedRequestMessage: newMessage,
          baseChatOverride: resetBaseChat || undefined,
        });

        if (sent) {
          setHiddenPromptContext(null);
        }
        return sent;
      }
    );

    const submitMessageContent = useMemoizedFn(
      async (content: MessageContentItem[]): Promise<boolean> => {
        const conversationKey = queueConversationKeyRef.current;
        if (sendLoading) {
          setQueuedMessageCount(messageQueueRef.current.enqueue(conversationKey, content));
          return true;
        }

        if (conversationKey !== getQueueConversationKey(actualChatRef.current.id)) {
          setQueuedMessageCount(messageQueueRef.current.enqueue(conversationKey, content));
          return true;
        }

        const sent = await sendMessageContent(content, conversationKey);
        const isConversationInactive =
          conversationKey !== queueConversationKeyRef.current ||
          conversationKey !== getQueueConversationKey(actualChatRef.current.id);
        if (!sent && isConversationInactive) {
          const queueSize = messageQueueRef.current.enqueue(conversationKey, content);
          if (queueConversationKeyRef.current === conversationKey) {
            setQueuedMessageCount(queueSize);
          }
          return true;
        }
        return sent;
      }
    );

    useEffect(() => {
      if (
        sendLoading ||
        queuedMessageCount === 0 ||
        queueDrainInProgressRef.current ||
        queueConversationKey !== getQueueConversationKey(actualChatRef.current.id)
      ) {
        return;
      }

      const conversationKey = queueConversationKey;
      queueDrainInProgressRef.current = true;
      void (async () => {
        while (
          queueConversationKeyRef.current === conversationKey &&
          messageQueueRef.current.size(conversationKey) > 0
        ) {
          const nextMessage = messageQueueRef.current.dequeue(conversationKey);
          setQueuedMessageCount(messageQueueRef.current.size(conversationKey));
          if (!nextMessage) {
            return;
          }

          const sent = await sendMessageContent(nextMessage, conversationKey);
          const isConversationInactive =
            queueConversationKeyRef.current !== conversationKey ||
            getQueueConversationKey(actualChatRef.current.id) !== conversationKey;
          if (!sent && isConversationInactive) {
            const queueSize = messageQueueRef.current.prepend(conversationKey, nextMessage);
            if (queueConversationKeyRef.current === conversationKey) {
              setQueuedMessageCount(queueSize);
            }
            return;
          }
          if (sent) {
            return;
          }
        }
      })().finally(() => {
        queueDrainInProgressRef.current = false;
        if (queueConversationKeyRef.current !== conversationKey) {
          setQueueDrainRevision(revision => revision + 1);
        }
      });
    }, [
      queueConversationKey,
      queueDrainRevision,
      queuedMessageCount,
      sendLoading,
      sendMessageContent,
      updateCounter,
    ]);

    // 删除消息
    const handleDeleteMessage = useMemoizedFn(async (messageIndex: number) => {
      try {
        const updatedChat = produce(actualChatRef.current, draft => {
          // 过滤掉要删除的消息（需要加上系统消息的偏移）
          const actualIndex = messageIndex + 1; // +1 因为跳过了系统消息
          draft.messages = draft.messages.filter((_, index) => index !== actualIndex);
        });

        const saved = await updateChatMessage(updatedChat);
        actualChatRef.current = saved;
        setUpdateCounter(prev => prev + 1);
        updateCurrentChat(saved);
        message.success("消息已删除");
      } catch (error) {
        message.error("删除消息失败");
        console.error("Delete message error:", error);
      }
    });

    // 重新生成消息
    const handleRegenerateMessage = useMemoizedFn(async (messageIndex: number) => {
      if (isCodexAgent) {
        message.warning("Codex 会话暂不支持重新生成");
        return;
      }

      const actualIndex = messageIndex + 1; // +1 因为跳过了系统消息
      const targetMessage = actualChatRef.current.messages[actualIndex];
      if (!targetMessage || targetMessage.role !== Role.User) {
        message.warning("只能重新生成用户消息");
        return;
      }

      // 删除目标消息之后的所有消息（包括目标消息本身）
      const updatedChat = produce(actualChatRef.current, draft => {
        draft.messages = draft.messages.slice(0, actualIndex);
      });

      actualChatRef.current = updatedChat;
      setUpdateCounter(prev => prev + 1);
      updateCurrentChat(updatedChat);

      // 直接调用公共方法发送消息
      const userMessage = targetMessage as RequestMessage;
      await processMessageSending(userMessage, {
        shouldClearInput: false,
        shouldCreateNewChat: false,
      });
    });

    const handleEditMessage = useMemoizedFn((messageIndex: number, content: string) => {
      if (isCodexAgent) {
        message.warning("Codex 会话暂不支持编辑消息");
        return;
      }

      if (hideInput || sendLoading) {
        return;
      }

      if (messageIndex !== lastUserMessageIndex) {
        message.warning("只能编辑最后一条用户消息");
        return;
      }

      const targetMessage = visibleMessages[messageIndex];
      if (!targetMessage || targetMessage.role !== Role.User) {
        message.warning("只能编辑用户消息");
        return;
      }

      setEditingDraft({
        messageIndex,
      });
      editTextRef.current?.setValue(content);
      setTimeout(() => {
        editTextRef.current?.focusEnd();
      }, 0);
    });

    // 创建分支
    const handleCreateBranch = useMemoizedFn(async (messageIndex: number) => {
      try {
        const currentChat = actualChatRef.current;
        if ((currentChat.agentType ?? "local") === "codex") {
          message.warning("Codex 会话暂不支持创建分支");
          return;
        }

        if (currentChat.id === 0) {
          message.warning("请先保存当前对话");
          return;
        }

        // 复制从开头到指定消息的所有消息（包括系统消息）
        const actualIndex = messageIndex + 1; // +1 因为跳过了系统消息
        const branchMessages = currentChat.messages.slice(0, actualIndex + 1);

        // 使用外部传入的创建分支回调
        await onCreateBranch(currentChat.id, branchMessages);
        message.success("分支已创建");
      } catch (error) {
        message.error("创建分支失败");
        console.error("Create branch error:", error);
      }
    });

    if (!currentChat) {
      return null;
    }

    const coreMessages: CoreChatMessageType[] = visibleMessages.map((message, index) => {
      let content = "";
      if (message.role === Role.User || message.role === Role.Tool) {
        const requestMessage = message as RequestMessage;
        if (typeof requestMessage.content === "string") {
          content = requestMessage.content;
        } else {
          content = requestMessage.content
            .filter(item => item.type === "text")
            .map(item => item.text)
            .join("\n");
        }
      } else {
        content = (message as ResponseMessage).content || "";
      }

      return {
        id: getVisibleMessageId(message, index),
        role: message.role as CoreChatMessageType["role"],
        content,
        timestamp: actualChatRef.current.updateTime + index,
      };
    });

    return (
      <ToolRendererInteractionProvider
        value={{
          setInputValue: text => {
            editTextRef.current?.setValue(text);
            editTextRef.current?.focusEnd();
          },
          setHiddenPromptContext: payload => {
            setHiddenPromptContext(payload);
          },
        }}
      >
        <div
          ref={node => {
            dropChatContent(node);
          }}
          className={classNames(
            "flex h-full min-h-0 flex-col rounded-xl transition-colors motion-reduce:transition-none",
            isChatContentDragOver && canDropChatContent
              ? "bg-[var(--th-accent-soft)] ring-2 ring-[var(--th-active-text)]"
              : undefined
          )}
        >
          <ChatContainerCore
            ref={coreRef}
            isDark={isDark}
            isConnected={true}
            messages={coreMessages}
            isLoading={sendLoading}
            allowSendWhileLoading
            queuedMessageCount={queuedMessageCount}
            error={chatError}
            retryStatus={chatRetryStatus}
            forceScrollToBottomKey={
              sendLoading ? `${actualChatRef.current.id}:${coreMessages.length}` : undefined
            }
            hideInput={hideInput}
            reasoningEffort={
              !isCodexAgent && chatModelConfig?.features?.thinking
                ? normalizedReasoningEffort
                : undefined
            }
            reasoningEffortOptions={reasoningEffortOptions}
            onReasoningEffortChange={
              !isCodexAgent && chatModelConfig?.features?.thinking
                ? value => setReasoningEffort(value)
                : undefined
            }
            reasoningEffortDisabled={isCodexAgent || !chatModelConfig?.features?.thinking}
            currentModelName={isCodexAgent ? "Codex" : chatModelConfig?.name}
            contextWindowK={isCodexAgent ? undefined : chatModelConfig?.contextWindowK}
            contextUsage={isCodexAgent ? null : contextUsage}
            modelSelectItems={isCodexAgent ? [] : modelSelectItems}
            onModelSelect={isCodexAgent ? undefined : handleModelSelect}
            isSupportImage={supportImage}
            isSupportFile={supportFile}
            onSendMessageContent={async content => {
              await submitMessageContent(content);
            }}
            onStopGeneration={stopStreaming}
            createMessageLoading={createMessageLoading}
            onCreateNewMessage={onCreateNewMessage}
            resourceSource={{
              type: "chat",
              id: actualChatRef.current.id,
            }}
            inputRef={editTextRef}
            messagesContainerRef={setMessagesContainerRef}
            messagesContainerClassName="px-6 flex-1 min-h-0 box-border overflow-y-auto relative will-change-transform [-webkit-overflow-scrolling:touch]"
            renderEmptyState={() => null}
            renderInputWrapper={inputNode => (
              <div
                className={classNames(
                  "m-1 mt-3 box-border flex-none rounded-3xl px-3 py-3 shadow-sm",
                  inputBgClass
                )}
              >
                {editingDraft ? (
                  <div className="bg-amber-500/8 mb-3 flex items-center justify-between gap-3 rounded-2xl border border-amber-500/20 px-4 py-3 text-sm text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">
                    <div className="min-w-0">
                      <div className="font-medium">正在编辑最后一条用户消息</div>
                      <div className="truncate text-xs opacity-80">
                        发送后将替换这条消息及其后的回复
                      </div>
                    </div>
                    <button
                      type="button"
                      className="shrink-0 rounded-lg px-2.5 py-1 text-xs text-amber-700 transition-colors hover:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-400/10"
                      onClick={() => {
                        setEditingDraft(null);
                      }}
                    >
                      取消编辑
                    </button>
                  </div>
                ) : null}
                {!editingDraft && hiddenPromptContext ? (
                  <div className="bg-[var(--th-accent)]/8 border-[var(--th-border-focus)]/20 dark:border-[var(--th-border-focus)]/20 dark:bg-[var(--th-accent)]/10 mb-3 flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm text-[var(--th-active-text)]">
                    <div className="min-w-0">
                      <div className="font-medium">正在编辑生成图片</div>
                      <div className="truncate text-xs opacity-80">
                        输入本次图片调整要求，发送后会基于选中的图片调用编辑工具
                      </div>
                    </div>
                    <button
                      type="button"
                      className="hover:bg-[var(--th-btn-hover)]/10 dark:hover:bg-[var(--th-accent)]/10 shrink-0 rounded-lg px-2.5 py-1 text-xs text-[var(--th-active-text)] transition-colors"
                      onClick={() => {
                        setHiddenPromptContext(null);
                      }}
                    >
                      退出编辑
                    </button>
                  </div>
                ) : null}
                {inputNode}
              </div>
            )}
            renderChatInputArea={({ chatInputRef, inputProps }) => {
              const {
                services: _services,
                onMcpManagerClick: _onMcpManagerClick,
                ...desktopInputProps
              } = inputProps;

              return (
                <div className="flex items-end gap-2">
                  <div className="min-w-0 flex-1">
                    <ChatInputArea
                      ref={chatInputRef}
                      className="min-w-0 flex-1"
                      {...desktopInputProps}
                      agentType={selectedAgentType}
                      onAgentTypeChange={handleAgentTypeChange}
                      agentTypeDisabled={visibleMessages.length > 0 || sendLoading}
                      codexWorkingDirectory={codexWorkingDirectory ?? null}
                      onSelectCodexWorkingDirectory={handleSelectCodexWorkingDirectory}
                      onClearCodexWorkingDirectory={handleClearCodexWorkingDirectory}
                      placeholder={hiddenPromptContext?.label || desktopInputProps.placeholder}
                    />
                  </div>
                </div>
              );
            }}
            onDeleteMessage={handleDeleteMessage}
            onRegenerateMessage={isCodexAgent ? undefined : handleRegenerateMessage}
            onCreateBranch={isCodexAgent ? undefined : handleCreateBranch}
            renderMessage={({ messageIndex }) => {
              const item = visibleMessages[messageIndex];
              if (!item) return null;

              const streamingIndex = sendLoading ? visibleMessages.length - 1 : -1;
              const isStreaming =
                sendLoading && messageIndex === streamingIndex && item.role === Role.Assistant;

              return (
                <div key={`${item.role}-${messageIndex}`} className="py-3">
                  <MessageItem
                    message={item}
                    isDark={isDark}
                    markdownComponents={markdownComponents}
                    isVisible={isVisible}
                    messageIndex={messageIndex}
                    onDeleteMessage={handleDeleteMessage}
                    onRegenerateMessage={handleRegenerateMessage}
                    onEditMessage={
                      !isCodexAgent &&
                      !hideInput &&
                      !sendLoading &&
                      item.role === Role.User &&
                      messageIndex === lastUserMessageIndex &&
                      getRequestMessageText(item as RequestMessage).trim().length > 0
                        ? handleEditMessage
                        : undefined
                    }
                    onCreateBranch={isCodexAgent ? undefined : handleCreateBranch}
                    messageMeta={{
                      chatId: actualChatRef.current.id,
                      messageIndex,
                      isStreaming,
                    }}
                  />
                </div>
              );
            }}
          />
        </div>
      </ToolRendererInteractionProvider>
    );
  }
);

ChatContainer.displayName = "ChatContainer";

export default memo(ChatContainer);
