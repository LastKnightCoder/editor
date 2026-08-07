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
  ModelConfig,
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
import {
  ASK_QUESTION_TOOL_NAME,
  buildAskQuestionToolResult,
} from "@/tools/askQuestionTypes";
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
  shouldGenerateChatTitle,
} from "./editingUtils";
import { withStreamingUpdateTime } from "./streamingUtils";
import { streamCodexChat } from "@/services/codex/codexChatStream";
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

const ENABLE_TITLE_SUMMARY = true;
const DEFAULT_REASONING_EFFORT_OPTIONS: ReasoningEffort[] = [
  "none",
  "low",
  "medium",
  "high",
];

const getReasoningEffortOptions = (
  modelConfig?: ModelConfig | null,
): ReasoningEffort[] => {
  if (modelConfig?.messageFormat !== "claude") {
    return DEFAULT_REASONING_EFFORT_OPTIONS;
  }

  const modelName = modelConfig.name.toLowerCase();
  const thinkingAlwaysOn =
    /claude[-_.]?(?:fable|mythos)[-_.]?[5-9](?:[-_.]|$)/.test(modelName) ||
    /claude[-_.]?mythos[-_.]?preview/.test(modelName);
  const baseOptions = thinkingAlwaysOn
    ? DEFAULT_REASONING_EFFORT_OPTIONS.filter((option) => option !== "none")
    : DEFAULT_REASONING_EFFORT_OPTIONS;
  const supportsMax =
    /claude.*4[-_.]?[6-9](?:[-_.]|$)/.test(modelName) ||
    /claude[-_.]?(?:opus|sonnet|fable|mythos)[-_.]?[5-9](?:[-_.]|$)/.test(
      modelName,
    );
  const supportsXHigh =
    /opus[-_.]?4[-_.]?[78](?:[-_.]|$)/.test(modelName) ||
    /(?:opus|sonnet|fable|mythos)[-_.]?[5-9](?:[-_.]|$)/.test(modelName);

  return [
    ...baseOptions,
    ...(supportsXHigh ? (["xhigh"] as const) : []),
    ...(supportsMax ? (["max"] as const) : []),
  ];
};

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
    agentSessionId?: string | null,
  ) => Promise<ChatMessage>;
  onCreateBranch: (
    parentChatId: number,
    messages: ChatMessage["messages"],
  ) => Promise<ChatMessage>;
  beforeSendUserMessage?: (
    content: MessageContentItem[],
  ) => Promise<boolean | void>;
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
  output: string,
) => {
  const normalizedExpectedInput =
    normalizeAskQuestionExecutionInput(expectedInput);

  return produce(chat, (draft) => {
    const isMatchedExecution = (execution: ToolCallExecutionState) =>
      execution.toolCallId === toolCallId &&
      execution.toolName === ASK_QUESTION_TOOL_NAME &&
      normalizeAskQuestionExecutionInput(execution.input) ===
        normalizedExpectedInput;

    draft.messages.forEach((message) => {
      if (message.role !== Role.Assistant) {
        return;
      }

      const assistant = ensureAssistantMessage(message as ResponseMessage);
      assistant.assistant_blocks = assistant.assistant_blocks?.map((block) => {
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
                duration:
                  block.execution.duration ||
                  Date.now() - block.execution.timestamp,
              }
            : block.execution,
        };
      });
      syncAssistantDerivedFields(assistant);
    });
  });
};

const buildAskQuestionExecutionSnapshotKey = (
  execution: ToolCallExecutionState,
) => `${execution.toolCallId}::${execution.input}`;

const ChatContainer = forwardRef<ChatContainerHandle, ChatContainerProps>(
  (
    {
      currentChat,
      isDark,
      markdownComponents,
      isVisible,
      updateChatMessage,
      updateCurrentChat,
      sendLoading,
      setSendLoading,
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
    ref,
  ) => {
    const { message } = App.useApp();
    const { chatLLMStream } = useChatLLM();
    const { providerConfig: chatProviderConfig, modelConfig: chatModelConfig } =
      useLLMConfig("chat");
    const {
      providerConfig: titleProviderConfig,
      modelConfig: titleModelConfig,
    } = useLLMConfig("titleSummary");

    const { chatInputBg } = useThemeColors();

    const llmConfigs = useSettingStore((state) => state.setting.llmConfigs);
    const skills = useSkillStore((state) => state.skills);
    const loadSkills = useSkillStore((state) => state.loadSkills);
    const askQuestionRecords = useAskQuestionSessionStore(
      (state) => state.records,
    );
    const completeAskQuestionSession = useAskQuestionSessionStore(
      (state) => state.completeSession,
    );

    // 加载 Skills 数据（用于注入系统 Prompt）
    useEffect(() => {
      loadSkills();
    }, [loadSkills]);

    const [reasoningEffort, setReasoningEffort] =
      useLocalStorageState<ReasoningEffort>("reasoningEffort", {
        defaultValue: "none",
      });
    const reasoningEffortOptions = useMemo(
      () => getReasoningEffortOptions(chatModelConfig),
      [chatModelConfig],
    );
    const effectiveReasoningEffort = reasoningEffortOptions.includes(
      reasoningEffort ?? "none",
    )
      ? (reasoningEffort ?? "none")
      : (reasoningEffortOptions[0] ?? "none");
    const [rememberedAgentType, setRememberedAgentType] =
      useLocalStorageState<ChatAgentType>(CHAT_AGENT_TYPE_STORAGE_KEY, {
        defaultValue: "local",
      });
    const [codexWorkingDirectory, setCodexWorkingDirectory] =
      useLocalStorageState<string | null>(
        CHAT_AGENT_WORKING_DIRECTORY_STORAGE_KEY,
        {
          defaultValue: null,
        },
      );
    const effectiveRememberedAgentType =
      normalizeChatAgentType(rememberedAgentType);

    const editTextRef = useRef<ChatInputAreaHandle>(null);
    const messagesRef = useRef<HTMLDivElement>(null);
    const coreRef = useRef<ChatContainerCoreHandle>(null);
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
    const [editingDraft, setEditingDraft] = useState<EditingDraftState | null>(
      null,
    );
    const [hiddenPromptContext, setHiddenPromptContext] =
      useState<HiddenPromptContextState | null>(null);

    // 跟踪实际使用的聊天对象，解决新建对话时的状态同步问题
    const actualChatRef = useRef<ChatMessage>(currentChat);

    // 强制更新计数器，用于触发visibleMessages重新计算
    const [updateCounter, setUpdateCounter] = useState(0);

    const selectedAgentType =
      actualChatRef.current.agentType ?? effectiveRememberedAgentType;
    const isCodexAgent = selectedAgentType === "codex";
    const modelFeatureSupport = chatModelConfig?.features;
    const supportImage =
      isCodexAgent ||
      (modelFeatureSupport?.image ?? modelFeatureSupport?.multimodal ?? false);
    const supportFile = !isCodexAgent && (modelFeatureSupport?.file ?? false);

    const abortControllerRef = useRef<AbortController | null>(null);
    const activeAssistantTurnIdRef = useRef<string | null>(null);
    const persistedAskQuestionSnapshotsRef = useRef<Set<string>>(new Set());
    const resumingAskQuestionRef = useRef<Set<string>>(new Set());
    const streamCounterRef = useRef(0);
    const hasRestoredScrollPositionRef = useRef(false);
    const isRestoringScrollPositionRef = useRef(false);

    const getScrollPositionKey = useMemoizedFn((chatId: number) => {
      if (!preserveScrollPosition || chatId === 0) {
        return null;
      }
      return `${scrollPositionScope || chatScope}:${chatId}`;
    });

    const getVisibleMessageId = useMemoizedFn(
      (message: ChatMessage["messages"][number], index: number) =>
        message.clientId ||
        `${actualChatRef.current.id}-${index}-${message.role}`,
    );

    const saveScrollPosition = useMemoizedFn(() => {
      const key = getScrollPositionKey(actualChatRef.current.id);
      const container = messagesRef.current;
      if (!key || !container || isRestoringScrollPositionRef.current) {
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const itemElements = Array.from(
        container.querySelectorAll<HTMLElement>("[data-virtual-message-item]"),
      );
      const firstVisibleItem = itemElements.find((element) => {
        const rect = element.getBoundingClientRect();
        return (
          rect.bottom > containerRect.top && rect.top < containerRect.bottom
        );
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
          (visibleMessages[index]
            ? getVisibleMessageId(visibleMessages[index], index)
            : undefined),
        offset:
          containerRect.top - firstVisibleItem.getBoundingClientRect().top,
        wasAtBottom: isScrolledToBottom(),
      });
    });

    const restoreScrollAnchor = useMemoizedFn(
      (anchor: ChatScrollAnchor, attempt = 0) => {
        const container = messagesRef.current;
        if (!container) {
          isRestoringScrollPositionRef.current = false;
          return;
        }

        const targetIndex = anchor.messageId
          ? visibleMessages.findIndex(
              (message, index) =>
                getVisibleMessageId(message, index) === anchor.messageId,
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
            `[data-virtual-message-item][data-index="${targetIndex}"]`,
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
      },
    );

    // 当切换聊天或收到同一聊天的外部最新快照时同步 ref
    useEffect(() => {
      const actualChat = actualChatRef.current;
      const isDifferentChat = currentChat.id !== actualChat.id;
      const hasExternalSnapshot = currentChat !== actualChat;

      if (isDifferentChat || hasExternalSnapshot) {
        actualChatRef.current = currentChat;
        if (isDifferentChat) {
          activeAssistantTurnIdRef.current = null;
          persistedAskQuestionSnapshotsRef.current.clear();
          resumingAskQuestionRef.current.clear();
          hasRestoredScrollPositionRef.current = false;
        }
        setUpdateCounter((prev) => prev + 1);
      }
    }, [currentChat]);

    useEffect(() => {
      if (hideInput) {
        setEditingDraft(null);
      }
    }, [hideInput]);

    const getConversationKey = useMemoizedFn((chatId: number) => {
      return `${chatScope}:${chatId}`;
    });

    const publishStreamingChatSnapshot = useMemoizedFn((chat: ChatMessage) => {
      const nextChat = withStreamingUpdateTime(chat);
      actualChatRef.current = nextChat;
      setUpdateCounter((prev) => prev + 1);
      updateCurrentChat(nextChat);
      setTimeout(() => {
        scrollToBottom();
      }, 0);
      return nextChat;
    });

    const buildSystemMessageWithRequest = useMemoizedFn((chat: ChatMessage) => {
      const defaultSystemPromptForSend =
        customSystemPrompt || DEFAULT_SYSTEM_PROMPT;
      const baseSystemContent =
        (chat.messages[0] as ResponseMessage | undefined)?.content ||
        defaultSystemPromptForSend;
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
        },
      ) => buildFullHistoryMessages(chat, options),
    );

    const persistFinishedChatAndGenerateTitle = useMemoizedFn(
      async (finishedChat: ChatMessage) => {
        const updatedChatMessage = await updateChatMessage(finishedChat);
        actualChatRef.current = updatedChatMessage;
        setUpdateCounter((prev) => prev + 1);
        updateCurrentChat(updatedChatMessage);
        scrollToBottom();

        try {
          if (
            ENABLE_TITLE_SUMMARY &&
            shouldGenerateChatTitle(
              updatedChatMessage,
              Boolean(titleProviderConfig && titleModelConfig),
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
                onFinish: async (content) => {
                  const nextTitle = content
                    ? formatGeneratedChatTitle(content)
                    : "";
                  if (nextTitle) {
                    const updateChat = produce(updatedChatMessage, (draft) => {
                      draft.title = nextTitle;
                      draft.titleDirty = true;
                    });
                    const saved = await updateChatMessage(updateChat);
                    actualChatRef.current = saved;
                    setUpdateCounter((prev) => prev + 1);
                    updateCurrentChat(saved);
                    titleRef.current?.setValue(nextTitle);
                  }
                },
              },
            );
          }
        } catch (e) {
          console.error("Failed to generate title:", e);
        }

        return updatedChatMessage;
      },
    );

    const getPersistedSystemContent = useMemoizedFn((chat: ChatMessage) => {
      const systemMessage = chat.messages.find(
        (message) => message.role === Role.System,
      ) as ResponseMessage | undefined;
      return (
        systemMessage?.content || customSystemPrompt || DEFAULT_SYSTEM_PROMPT
      );
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
          toolContext?: {
            flags?: {
              forceReview?: boolean;
              feedbackProposalId?: string;
            };
          };
        },
      ) => {
        const shouldClearInput = options?.shouldClearInput ?? true;
        const shouldCreateNewChat = options?.shouldCreateNewChat ?? true;
        const persistRequestMessage = options?.persistRequestMessage ?? true;
        const persistedRequestMessage =
          options?.persistedRequestMessage ?? requestMessage;
        const extraHistoryMessages = options?.extraHistoryMessages || [];
        const perf = measurePerformance("sendMessage");
        setSendLoading(true);

        scrollToBottom();

        const responseMessage = createAssistantMessage();

        // 如果当前没有真实的对话（id为0），则先创建一个新对话
        let actualCurrentChat =
          options?.baseChatOverride || actualChatRef.current;
        if (shouldCreateNewChat && actualCurrentChat.id === 0) {
          try {
            const defaultSystemPrompt =
              customSystemPrompt || DEFAULT_SYSTEM_PROMPT;
            const systemContent =
              (actualCurrentChat.messages[0] as ResponseMessage | undefined)
                ?.content || defaultSystemPrompt;
            const systemMessage: ResponseMessage = {
              role: Role.System,
              content:
                (actualCurrentChat.agentType ?? selectedAgentType) === "codex"
                  ? buildCodexSystemPrompt(
                      buildSessionAwareSystemPrompt(
                        systemContent || defaultSystemPrompt,
                      ),
                    )
                  : buildSessionAwareSystemPrompt(
                      systemContent || defaultSystemPrompt,
                    ),
            };

            const newChatMessages = [systemMessage];

            // 使用外部传入的创建对话回调
            actualCurrentChat = await onCreateChat(
              newChatMessages,
              actualCurrentChat.title || "新对话",
              actualCurrentChat.agentType ?? selectedAgentType,
              actualCurrentChat.agentSessionId ?? null,
            );

            // 立即更新ref，确保UI使用新创建的对话
            actualChatRef.current = actualCurrentChat;
            setUpdateCounter((prev) => prev + 1);

            // 通知父组件新对话已创建
            onChatCreated?.(actualCurrentChat.id);
          } catch (error) {
            message.error("创建新对话失败");
            setSendLoading(false);
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
        const chatWithNewMessages = {
          ...actualCurrentChat,
          messages: [
            ...actualCurrentChat.messages,
            ...(persistRequestMessage ? [persistedRequestMessage] : []),
            responseMessage,
          ],
        };

        // 更新当前聊天状态
        actualCurrentChat = chatWithNewMessages;
        actualChatRef.current = chatWithNewMessages;
        setUpdateCounter((prev) => prev + 1);
        updateCurrentChat(chatWithNewMessages);

        // 添加新消息后立即强制贴底，避免虚拟列表测量期间被 scroll 监听误判为用户离开底部。
        enableAutoScroll();
        setTimeout(forceScrollToBottomSoon, 0);

        if (shouldClearInput) {
          editTextRef.current?.clear();
        }

        if (actualCurrentChat.agentType === "codex") {
          const rawCodexInput = await buildCodexInputFromMessageContent(
            requestMessage.content,
          );
          const codexInput = actualCurrentChat.agentSessionId
            ? rawCodexInput
            : prependCodexSystemPromptToInput(
                rawCodexInput,
                buildCodexSystemPrompt(
                  getPersistedSystemContent(actualCurrentChat),
                ),
              );
          if (codexInput.length === 0) {
            message.warning("请输入内容");
            setSendLoading(false);
            return false;
          }

          const codexTurnId = `${streamId}:codex`;
          const codexTurnIds = new Set<string>();
          const resolveCodexTurnId = (turnId?: string) => {
            const resolvedTurnId = turnId
              ? `${codexTurnId}:${turnId}`
              : codexTurnId;
            codexTurnIds.add(resolvedTurnId);
            return resolvedTurnId;
          };
          const finalizeCodexTurns = (message: ResponseMessage) => {
            const turnIds =
              codexTurnIds.size > 0 ? Array.from(codexTurnIds) : [codexTurnId];
            turnIds.forEach((turnId) => {
              finalizeAssistantTurn(message, turnId);
            });
          };
          activeAssistantTurnIdRef.current = codexTurnId;
          const controller = new AbortController();
          abortControllerRef.current = controller;

          const applyCodexMappedEvent = (event: CodexMappedEvent) => {
            if (event.type === "thread-started") {
              const updatedChat = {
                ...actualCurrentChat,
                agentSessionId: event.threadId,
              };
              actualCurrentChat = publishStreamingChatSnapshot(updatedChat);
              return;
            }

            if (event.type === "text-delta") {
              const eventTurnId = resolveCodexTurnId(event.turnId);
              const updatedChat = produce(actualCurrentChat, (draft) => {
                const lastMessageIndex = draft.messages.length - 1;
                if (
                  lastMessageIndex >= 0 &&
                  draft.messages[lastMessageIndex].role === Role.Assistant
                ) {
                  applyAssistantTextSnapshot(
                    draft.messages[lastMessageIndex] as ResponseMessage,
                    eventTurnId,
                    event.responseText,
                  );
                }
              });
              actualCurrentChat = publishStreamingChatSnapshot(updatedChat);
              return;
            }

            if (event.type === "reasoning-delta") {
              const eventTurnId = resolveCodexTurnId(event.turnId);
              const updatedChat = produce(actualCurrentChat, (draft) => {
                const lastMessageIndex = draft.messages.length - 1;
                if (
                  lastMessageIndex >= 0 &&
                  draft.messages[lastMessageIndex].role === Role.Assistant
                ) {
                  applyAssistantReasoningSnapshot(
                    draft.messages[lastMessageIndex] as ResponseMessage,
                    eventTurnId,
                    event.reasoningText,
                  );
                }
              });
              actualCurrentChat = publishStreamingChatSnapshot(updatedChat);
              return;
            }

            if (event.type === "tool-calls-update") {
              const eventTurnId = resolveCodexTurnId(event.turnId);
              const updatedChat = produce(actualCurrentChat, (draft) => {
                const lastMessageIndex = draft.messages.length - 1;
                if (
                  lastMessageIndex >= 0 &&
                  draft.messages[lastMessageIndex].role === Role.Assistant
                ) {
                  applyAssistantToolCallsSnapshot(
                    draft.messages[lastMessageIndex] as ResponseMessage,
                    eventTurnId,
                    event.executions,
                    event.toolCalls,
                  );
                }
              });
              actualCurrentChat = publishStreamingChatSnapshot(updatedChat);
              return;
            }

            if (event.type === "error") {
              console.error("Codex stream error:", event.error);
            }
          };

          try {
            await streamCodexChat({
              input: codexInput,
              agentSessionId: actualCurrentChat.agentSessionId ?? null,
              workingDirectory: codexWorkingDirectory ?? null,
              signal: controller.signal,
              onEvent: applyCodexMappedEvent,
            });

            const finalizedChat = produce(actualCurrentChat, (draft) => {
              const lastMessageIndex = draft.messages.length - 1;
              if (
                lastMessageIndex >= 0 &&
                draft.messages[lastMessageIndex].role === Role.Assistant
              ) {
                finalizeCodexTurns(
                  draft.messages[lastMessageIndex] as ResponseMessage,
                );
              }
            });

            activeAssistantTurnIdRef.current = null;
            actualCurrentChat =
              await persistFinishedChatAndGenerateTitle(finalizedChat);
          } catch (error) {
            const isAbortError =
              error instanceof Error && error.name === "AbortError";
            const finalizedChat = produce(actualCurrentChat, (draft) => {
              const lastMessageIndex = draft.messages.length - 1;
              if (
                lastMessageIndex >= 0 &&
                draft.messages[lastMessageIndex].role === Role.Assistant
              ) {
                finalizeCodexTurns(
                  draft.messages[lastMessageIndex] as ResponseMessage,
                );
              }
            });
            actualCurrentChat = finalizedChat;
            actualChatRef.current = finalizedChat;
            setUpdateCounter((prev) => prev + 1);
            updateCurrentChat(finalizedChat);
            void updateChatMessage(finalizedChat).catch((persistError) => {
              console.error("Codex 失败后持久化对话失败:", persistError);
            });
            if (activeAssistantTurnIdRef.current === codexTurnId) {
              activeAssistantTurnIdRef.current = null;
            }
            if (!isAbortError) {
              message.error(
                error instanceof Error ? error.message : "Codex 请求失败",
              );
            }
          } finally {
            setSendLoading(false);
            abortControllerRef.current = null;
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
          setSendLoading(false);
          return false;
        }

        chatLLMStream(chatProviderConfig, chatModelConfig, sendMessages, {
          enableTools: true,
          conversationKey,
          toolContext: options?.toolContext,
          skills,
          reasoningEffort: chatModelConfig?.features?.thinking
            ? effectiveReasoningEffort
            : undefined,
          onFinish: () => {},

          onAssistantTurnEnd: async ({
            turnId,
            resultType,
            providerMetadata,
          }) => {
            activeAssistantTurnIdRef.current = null;
            const finalizedChat = produce(actualCurrentChat, (draft) => {
              const lastMessageIndex = draft.messages.length - 1;
              if (
                lastMessageIndex >= 0 &&
                draft.messages[lastMessageIndex].role === Role.Assistant
              ) {
                const lastMessage = draft.messages[
                  lastMessageIndex
                ] as ResponseMessage;
                applyAssistantProviderMetadataSnapshot(
                  lastMessage,
                  turnId,
                  providerMetadata,
                );
                finalizeAssistantTurn(lastMessage, turnId);
              }
            });

            actualCurrentChat = finalizedChat;
            actualChatRef.current = finalizedChat;
            setUpdateCounter((prev) => prev + 1);
            updateCurrentChat(finalizedChat);

            if (resultType !== "response") {
              return;
            }

            try {
              actualCurrentChat =
                await persistFinishedChatAndGenerateTitle(finalizedChat);
            } catch (error) {
              message.error("Failed to update chat");
              console.error(error);
            } finally {
              setSendLoading(false);
              abortControllerRef.current = null;
              if (shouldClearInput) {
                setTimeout(() => {
                  editTextRef.current?.focusEnd();
                }, 100);
              }
            }
            perf.end();
          },

          onUpdate: (
            full: string,
            _inc: string,
            _reasoningText?: string,
            turnId?: string,
          ) => {
            if (turnId) {
              activeAssistantTurnIdRef.current = turnId;
            }
            // 基于当前实际聊天对象进行更新
            const updatedChat = produce(actualCurrentChat, (draft) => {
              // 找到最后一条助手消息并更新其内容
              const lastMessageIndex = draft.messages.length - 1;
              if (
                lastMessageIndex >= 0 &&
                draft.messages[lastMessageIndex].role === Role.Assistant
              ) {
                const lastMessage = draft.messages[
                  lastMessageIndex
                ] as ResponseMessage;
                applyAssistantTextSnapshot(
                  lastMessage,
                  turnId || `${streamId}:fallback-text`,
                  full,
                );
              }
            });

            actualCurrentChat = publishStreamingChatSnapshot(updatedChat);
          },

          onReasoning: (full: string, _inc: string, turnId?: string) => {
            if (turnId) {
              activeAssistantTurnIdRef.current = turnId;
            }
            // 基于当前实际聊天对象进行更新
            const updatedChat = produce(actualCurrentChat, (draft) => {
              // 找到最后一条助手消息并更新其推理内容
              const lastMessageIndex = draft.messages.length - 1;
              if (
                lastMessageIndex >= 0 &&
                draft.messages[lastMessageIndex].role === Role.Assistant
              ) {
                const lastMessage = draft.messages[
                  lastMessageIndex
                ] as ResponseMessage;
                applyAssistantReasoningSnapshot(
                  lastMessage,
                  turnId || `${streamId}:fallback-reasoning`,
                  full,
                );
              }
            });

            actualCurrentChat = publishStreamingChatSnapshot(updatedChat);
          },

          onToolCallsUpdate: (
            executions: ToolCallExecutionState[],
            turnId?: string,
            toolCalls?: ToolCallPayload[],
          ) => {
            if (turnId) {
              activeAssistantTurnIdRef.current = turnId;
            }
            // 基于当前实际聊天对象进行更新
            const updatedChat = produce(actualCurrentChat, (draft) => {
              // 找到最后一条助手消息并更新其工具执行状态
              const lastMessageIndex = draft.messages.length - 1;
              if (
                lastMessageIndex >= 0 &&
                draft.messages[lastMessageIndex].role === Role.Assistant
              ) {
                const lastMessage = draft.messages[
                  lastMessageIndex
                ] as ResponseMessage;
                applyAssistantToolCallsSnapshot(
                  lastMessage,
                  turnId || `${streamId}:fallback-tool`,
                  executions,
                  toolCalls,
                );
              }
            });

            const publishedChat = publishStreamingChatSnapshot(updatedChat);
            actualCurrentChat = publishedChat;

            // ask-question 进入等待态时，立即持久化快照，确保应用重启后可恢复
            const pendingAskQuestionExecutions = executions.filter(
              (execution) =>
                execution.toolName === ASK_QUESTION_TOOL_NAME &&
                (execution.status === "pending" ||
                  execution.status === "executing" ||
                  execution.status === "retrying"),
            );
            const shouldPersistSnapshot = pendingAskQuestionExecutions.some(
              (execution) =>
                !persistedAskQuestionSnapshotsRef.current.has(
                  buildAskQuestionExecutionSnapshotKey(execution),
                ),
            );
            if (shouldPersistSnapshot) {
              pendingAskQuestionExecutions.forEach((execution) => {
                persistedAskQuestionSnapshotsRef.current.add(
                  buildAskQuestionExecutionSnapshotKey(execution),
                );
              });
              void updateChatMessage(publishedChat).catch((error) => {
                console.error("持久化 ask-question 快照失败:", error);
              });
            }
          },

          onError: (error) => {
            const isAbortError = error.name === "AbortError";
            const finalizedChat = finalizeActiveAssistantTurn();
            if (finalizedChat) {
              actualCurrentChat = finalizedChat;
            }
            updateCurrentChat(actualCurrentChat);
            setSendLoading(false);
            abortControllerRef.current = null;

            if (!isAbortError) {
              message.error("请求失败");
            }
            perf.end();
            if (shouldClearInput) {
              setTimeout(() => {
                // 从消息内容中提取文本用于恢复
                const textContent = Array.isArray(requestMessage.content)
                  ? requestMessage.content
                      .filter((item) => item.type === "text")
                      .map((item) => item.text)
                      .join("\n")
                  : typeof requestMessage.content === "string"
                    ? requestMessage.content
                    : "";
                editTextRef.current?.setValue(textContent);
                editTextRef.current?.focusEnd();
              }, 100);
            }
          },

          onController: (controller: AbortController) => {
            abortControllerRef.current = controller;
          },
        });
        return true;
      },
    );

    const submittedAskQuestionSessions = useMemo(() => {
      const activeChat = actualChatRef.current;
      const conversationKey = getConversationKey(activeChat.id);
      return Object.values(askQuestionRecords)
        .filter(
          (record) =>
            record.conversationKey === conversationKey &&
            record.status === "submitted" &&
            Boolean(record.submittedAnswers),
        )
        .sort((a, b) => a.updatedAt - b.updatedAt);
    }, [askQuestionRecords, getConversationKey, updateCounter]);

    useEffect(() => {
      if (hideInput || sendLoading) {
        return;
      }

      const pendingSession = submittedAskQuestionSessions.find(
        (session) => !resumingAskQuestionRef.current.has(session.sessionId),
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
        pendingSession.submittedAnswers,
      );
      const answerJson = JSON.stringify(askQuestionResult, null, 2);

      const currentChatSnapshot = actualChatRef.current;
      const resolvedChat = markAskQuestionExecutionResolved(
        currentChatSnapshot,
        pendingSession.toolCallId,
        pendingSession.rawInput,
        answerJson,
      );
      actualChatRef.current = resolvedChat;
      setUpdateCounter((prev) => prev + 1);
      updateCurrentChat(resolvedChat);
      void updateChatMessage(resolvedChat).catch((error) => {
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
        (message) =>
          message.role === Role.Assistant &&
          Boolean(
            message.tool_calls?.some(
              (call) =>
                call.id === pendingSession.toolCallId &&
                call.function.name === ASK_QUESTION_TOOL_NAME,
            ),
          ),
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
        extraHistoryMessages: hasAssistantToolCallMessage
          ? []
          : [bridgeAssistantToolCallMessage],
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
        if (sendLoading) {
          message.warning("当前已有生成任务，请稍后再试");
          return false;
        }
        await sendMessageContent(content);
        return true;
      },
    }));

    const onSelectModel = useMemoizedFn(
      (providerId: string, modelName: string) => {
        useSettingStore.setState(
          produce((draft) => {
            draft.setting.llmUsageSettings.chat.providerId = providerId;
            draft.setting.llmUsageSettings.chat.modelName = modelName;
          }),
        );
      },
    );

    // 模型选择菜单
    const modelSelectItems = useMemo(() => {
      return llmConfigs.map((provider) => ({
        key: provider.id,
        label: provider.name,
        children: provider.models?.map((model) => ({
          key: `${provider.id}::${model.name}`,
          label: (
            <div>
              <div>{model.name}</div>
              <div style={{ fontSize: "12px", color: "#999" }}>
                {model.description}
              </div>
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
        produce((draft) => {
          if (!draft.setting.llmUsageSettings.chat) {
            draft.setting.llmUsageSettings.chat = {
              providerId: "",
              modelName: "",
            };
          }
          draft.setting.llmUsageSettings.chat.providerId = providerId;
          draft.setting.llmUsageSettings.chat.modelName = modelName;
        }),
      );
    });

    const visibleMessages = useMemo(() => {
      return actualChatRef.current.messages.filter(
        (message) => message.role !== Role.System,
      );
    }, [updateCounter]);

    const handleAgentTypeChange = useMemoizedFn(
      async (agentType: ChatAgentType) => {
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
        setUpdateCounter((prev) => prev + 1);
        updateCurrentChat(updatedChat);
      },
    );
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
      [visibleMessages],
    );
    const lastVisibleMessageRole =
      visibleMessages.length > 0
        ? visibleMessages[visibleMessages.length - 1]?.role
        : undefined;

    useEffect(() => {
      if (!editingDraft) {
        return;
      }

      const targetMessage = visibleMessages[editingDraft.messageIndex];
      const isEditingTargetStillValid =
        editingDraft.messageIndex === lastUserMessageIndex &&
        targetMessage?.role === Role.User;

      if (!isEditingTargetStillValid) {
        setEditingDraft(null);
      }
    }, [editingDraft, lastUserMessageIndex, visibleMessages]);

    const finalizeActiveAssistantTurn = useMemoizedFn(() => {
      const turnId = activeAssistantTurnIdRef.current;
      if (!turnId) {
        return null;
      }

      const finalizedChat = produce(actualChatRef.current, (draft) => {
        const lastMessageIndex = draft.messages.length - 1;
        if (
          lastMessageIndex >= 0 &&
          draft.messages[lastMessageIndex].role === Role.Assistant
        ) {
          finalizeAssistantTurn(
            draft.messages[lastMessageIndex] as ResponseMessage,
            turnId,
          );
        }
      });

      activeAssistantTurnIdRef.current = null;
      actualChatRef.current = finalizedChat;
      setUpdateCounter((prev) => prev + 1);
      updateCurrentChat(finalizedChat);
      return finalizedChat;
    });

    // 停止流式请求
    const stopStreaming = useMemoizedFn(() => {
      if (abortControllerRef.current) {
        const finalizedChat = finalizeActiveAssistantTurn();
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
        // 立即清除 loading 状态，避免 UI 无响应
        setSendLoading(false);
        if (finalizedChat) {
          void updateChatMessage(finalizedChat).catch((error) => {
            console.error("停止生成后持久化对话失败:", error);
          });
        }
      }
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
      const savedAnchor =
        key !== null ? CHAT_SCROLL_POSITION_CACHE.get(key) : undefined;

      if (savedAnchor && !hasRestoredScrollPositionRef.current) {
        const savedAnchorIndex = savedAnchor.messageId
          ? visibleMessages.findIndex(
              (message, index) =>
                getVisibleMessageId(message, index) === savedAnchor.messageId,
            )
          : savedAnchor.index;

        if (
          savedAnchorIndex < 0 ||
          savedAnchorIndex >= visibleMessages.length
        ) {
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
      async (userContent: MessageContentItem[]) => {
        if (!userContent || userContent.length === 0) {
          message.warning("请输入内容");
          return;
        }

        const hasMeaningfulContent = userContent.some((item) => {
          if (item.type === "text") {
            return item.text.trim().length > 0;
          }
          return true;
        });
        if (!hasMeaningfulContent) {
          message.warning("请输入内容");
          return;
        }

        if (isCodexAgent && userContent.some((item) => item.type === "file")) {
          message.warning("Codex 当前暂不支持 PDF/文件输入");
          return;
        }

        if (isCodexAgent && editingDraft) {
          message.warning("Codex 会话暂不支持编辑后重新发送");
          return;
        }

        if (beforeSendUserMessage) {
          const shouldContinue = await beforeSendUserMessage(userContent);
          if (shouldContinue === false) {
            return;
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
                    ...newMessage.content.map((item) =>
                      item.type === "text"
                        ? {
                            ...item,
                            text: `${hiddenPromptContext.text}\n\n用户编辑要求：${item.text}`,
                          }
                        : item,
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
          return;
        }

        const sent = await processMessageSending(requestMessageForModel, {
          shouldClearInput: true,
          shouldCreateNewChat: true,
          persistedRequestMessage: newMessage,
          baseChatOverride: resetBaseChat || undefined,
        });

        if (sent) {
          setEditingDraft(null);
          setHiddenPromptContext(null);
        }
      },
    );

    // 删除消息
    const handleDeleteMessage = useMemoizedFn(async (messageIndex: number) => {
      try {
        const updatedChat = produce(actualChatRef.current, (draft) => {
          // 过滤掉要删除的消息（需要加上系统消息的偏移）
          const actualIndex = messageIndex + 1; // +1 因为跳过了系统消息
          draft.messages = draft.messages.filter(
            (_, index) => index !== actualIndex,
          );
        });

        const saved = await updateChatMessage(updatedChat);
        actualChatRef.current = saved;
        setUpdateCounter((prev) => prev + 1);
        updateCurrentChat(saved);
        message.success("消息已删除");
      } catch (error) {
        message.error("删除消息失败");
        console.error("Delete message error:", error);
      }
    });

    // 重新生成消息
    const handleRegenerateMessage = useMemoizedFn(
      async (messageIndex: number) => {
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
        const updatedChat = produce(actualChatRef.current, (draft) => {
          draft.messages = draft.messages.slice(0, actualIndex);
        });

        actualChatRef.current = updatedChat;
        setUpdateCounter((prev) => prev + 1);
        updateCurrentChat(updatedChat);

        // 直接调用公共方法发送消息
        const userMessage = targetMessage as RequestMessage;
        await processMessageSending(userMessage, {
          shouldClearInput: false,
          shouldCreateNewChat: false,
        });
      },
    );

    const handleEditMessage = useMemoizedFn(
      (messageIndex: number, content: string) => {
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
      },
    );

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

    const coreMessages: CoreChatMessageType[] = visibleMessages.map(
      (message, index) => {
        let content = "";
        if (message.role === Role.User || message.role === Role.Tool) {
          const requestMessage = message as RequestMessage;
          if (typeof requestMessage.content === "string") {
            content = requestMessage.content;
          } else {
            content = requestMessage.content
              .filter((item) => item.type === "text")
              .map((item) => item.text)
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
      },
    );

    return (
      <ToolRendererInteractionProvider
        value={{
          setInputValue: (text) => {
            editTextRef.current?.setValue(text);
            editTextRef.current?.focusEnd();
          },
          setHiddenPromptContext: (payload) => {
            setHiddenPromptContext(payload);
          },
        }}
      >
        <ChatContainerCore
          ref={coreRef}
          isDark={isDark}
          isConnected={true}
          messages={coreMessages}
          isLoading={sendLoading}
          error={null}
          forceScrollToBottomKey={
            sendLoading
              ? `${actualChatRef.current.id}:${coreMessages.length}`
              : undefined
          }
          hideInput={hideInput}
          reasoningEffort={
            !isCodexAgent && chatModelConfig?.features?.thinking
              ? effectiveReasoningEffort
              : undefined
          }
          reasoningEffortOptions={reasoningEffortOptions}
          onReasoningEffortChange={
            !isCodexAgent && chatModelConfig?.features?.thinking
              ? (value) => setReasoningEffort(value)
              : undefined
          }
          reasoningEffortDisabled={
            isCodexAgent || !chatModelConfig?.features?.thinking
          }
          currentModelName={isCodexAgent ? "Codex" : chatModelConfig?.name}
          modelSelectItems={isCodexAgent ? [] : modelSelectItems}
          onModelSelect={isCodexAgent ? undefined : handleModelSelect}
          isSupportImage={supportImage}
          isSupportFile={supportFile}
          onSendMessageContent={sendMessageContent}
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
          renderInputWrapper={(inputNode) => (
            <div
              className={classNames(
                "m-1 mt-3 flex-none px-3 py-3 box-border shadow-sm rounded-3xl",
                chatInputBg,
              )}
            >
              {editingDraft ? (
                <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/8 px-4 py-3 text-sm text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">
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
                <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-blue-500/20 bg-blue-500/8 px-4 py-3 text-sm text-blue-700 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-200">
                  <div className="min-w-0">
                    <div className="font-medium">正在编辑生成图片</div>
                    <div className="truncate text-xs opacity-80">
                      输入本次图片调整要求，发送后会基于选中的图片调用编辑工具
                    </div>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 rounded-lg px-2.5 py-1 text-xs text-blue-700 transition-colors hover:bg-blue-500/10 dark:text-blue-200 dark:hover:bg-blue-400/10"
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
                <div className="flex-1 min-w-0">
                  <ChatInputArea
                    ref={chatInputRef}
                    className="flex-1 min-w-0"
                    {...desktopInputProps}
                    agentType={selectedAgentType}
                    onAgentTypeChange={handleAgentTypeChange}
                    agentTypeDisabled={
                      visibleMessages.length > 0 || sendLoading
                    }
                    codexWorkingDirectory={codexWorkingDirectory ?? null}
                    onSelectCodexWorkingDirectory={
                      handleSelectCodexWorkingDirectory
                    }
                    onClearCodexWorkingDirectory={
                      handleClearCodexWorkingDirectory
                    }
                    placeholder={
                      hiddenPromptContext?.label ||
                      desktopInputProps.placeholder
                    }
                  />
                </div>
              </div>
            );
          }}
          onDeleteMessage={handleDeleteMessage}
          onRegenerateMessage={
            isCodexAgent ? undefined : handleRegenerateMessage
          }
          onCreateBranch={isCodexAgent ? undefined : handleCreateBranch}
          renderMessage={({ messageIndex }) => {
            const item = visibleMessages[messageIndex];
            if (!item) return null;

            const streamingIndex = sendLoading
              ? visibleMessages.length - 1
              : -1;
            const isStreaming =
              sendLoading &&
              messageIndex === streamingIndex &&
              item.role === Role.Assistant;

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
                    getRequestMessageText(item as RequestMessage).trim()
                      .length > 0
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
      </ToolRendererInteractionProvider>
    );
  },
);

ChatContainer.displayName = "ChatContainer";

export default memo(ChatContainer);
