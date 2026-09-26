import React, {
  useRef,
  useMemo,
  memo,
  useEffect,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import { produce } from "immer";
import { useLocalStorageState, useMemoizedFn } from "ahooks";
import { useDrop } from "react-dnd";
import { RotateCw, TriangleAlert } from "lucide-react";

import ChatInputArea from "@/components/ChatInputArea";
import type { ChatInputAreaHandle } from "@/components/ChatInputArea";
import { COMPOSER_ANCHOR_ATTR } from "@/components/ChatInputArea/ComposerPanel";

import { measurePerformance } from "./hooks/usePerformanceMonitor";
import MessageItem from "./MessageItem";

import {
  ChatMessage,
  RequestMessage,
  ResponseMessage,
  ReasoningEffort,
  ToolCallExecutionState,
} from "@/types";
import {
  Role,
  SUMMARY_TITLE_PROMPT,
  DEFAULT_SYSTEM_PROMPT,
  buildSessionAwareSystemPrompt,
} from "@/constants";
import { piCompleteChat, toPiThinking } from "@/services/piLLM";
import { buildPiChatSystemPrompt, piChatSessionManager } from "@/services/piChatSession";
import { PiChatEventReducer } from "@/services/piChatEvents";
import {
  onPiSessionEvent,
  piSessionAbort,
  piSessionPrompt,
  piSessionToolResult,
} from "@/commands/piSession";
import useLLMConfig from "@/hooks/useLLMConfig";
import useSettingStore from "@/stores/useSettingStore";
import useSkillStore from "@/stores/useSkillStore";
import type { EditTextHandle } from "@/components/EditText";
import { FADE_SCROLL_CLASS, cn, toast, useEdgeFade } from "@tau/ui";
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
import {
  CHAT_CONTENT_DND_TYPE,
  SIDEBAR_ITEM_DND_TYPE,
  getChatContentDragReference,
} from "@/utils/chat-content-dnd";
import { getErrorMessage } from "@/utils/chat-retry";

/** 本条用户消息里 `$` 点名的 Skill（folderName，去重） */
const extractForcedSkills = (requestMessage: RequestMessage): string[] => {
  const content = requestMessage.content;
  if (!Array.isArray(content)) return [];
  return Array.from(
    new Set(content.flatMap(item => (item.type === "text" && item.skills ? item.skills : [])))
  );
};

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
  /** 工具作用域：只有本对话能用该作用域注册的页面专属工具，输入框 MCP 面板也只列它们 */
  toolScope?: string;
  preserveScrollPosition?: boolean; // 侧边栏收起后重新打开时恢复滚动位置
  scrollPositionScope?: string; // 滚动位置缓存作用域，不影响模型会话键
  onChatCreated?: (chatId: number) => void; // 新对话创建后的回调
  customSystemPrompt?: string; // 自定义系统提示（覆盖默认）
  onCreateChat: (messages: ChatMessage["messages"], title?: string) => Promise<ChatMessage>;
  onCreateBranch: (parentChatId: number, messages: ChatMessage["messages"]) => Promise<ChatMessage>;
  beforeSendUserMessage?: (content: MessageContentItem[]) => Promise<boolean | void>;
  /** 阅读列最大宽度（对话页 760 居中；停靠栏缺省 = 撑满） */
  contentMaxWidth?: number;
  /** 紧凑档（停靠栏）：输入区工具行精简 */
  compact?: boolean;
  /** 无消息时消息区的占位内容 */
  emptyState?: React.ReactNode;
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
      toolScope,
      preserveScrollPosition = false,
      scrollPositionScope,
      onChatCreated,
      customSystemPrompt,
      onCreateChat,
      onCreateBranch,
      beforeSendUserMessage,
      contentMaxWidth,
      compact = false,
      emptyState,
    },
    ref
  ) => {
    const message = toast;
    const { provider: chatProviderConfig, model: chatModelConfig } = useLLMConfig("chat");
    const { provider: titleProviderConfig, model: titleModelConfig } = useLLMConfig("titleSummary");

    const sessionKey = `${chatScope.split(":")[0]}:${currentChat.id}`;
    const [pendingSessionKeys, setPendingSessionKeys] = useState<Set<string>>(() => new Set());
    const setSessionPending = useMemoizedFn((key: string, pending: boolean) => {
      setPendingSessionKeys(current => {
        const next = new Set(current);
        if (pending) next.add(key);
        else next.delete(key);
        return next;
      });
    });
    // pi 会话驱动：运行态由本组件本地 pending 跟踪（pi 会话流式期间 = pending），
    // 中断恢复由 pi 会话 JSONL 事实源承接（M4 会话管理产品化）
    const sendLoading = pendingSessionKeys.has(sessionKey);

    useEffect(() => {
      setExternalSendLoading(sendLoading);
    }, [sendLoading, setExternalSendLoading]);

    const llmConfigs = useSettingStore(state => state.setting.llmProviders);
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
    // pi ThinkingLevel 通用档（模型特有档位目录 M3 设置页产品化时接入）
    const reasoningEffortOptions = useMemo<ReasoningEffort[]>(
      () => (chatModelConfig?.reasoning ? ["none", "low", "medium", "high"] : ["none"]),
      [chatModelConfig?.reasoning]
    );
    const normalizedReasoningEffort = reasoningEffortOptions.includes(effectiveReasoningEffort)
      ? effectiveReasoningEffort
      : (reasoningEffortOptions[0] ?? "none");

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
    // 消息滚动区接 FadeScroll 协议（上下渐隐 + 内缩滚动条）：容器由 ChatContainerCore 渲染，
    // 经 ref 拿到元素后挂 edge fade
    const [messagesEl, setMessagesEl] = useState<HTMLDivElement | null>(null);
    useEdgeFade(messagesEl);
    const setMessagesContainer = useMemoizedFn((node: HTMLDivElement | null) => {
      setMessagesContainerRef(node);
      setMessagesEl(node);
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

    // 聊天上传以 pi 为准：仅文本与图片；文件由模型用 read 工具读取
    const supportImage = chatModelConfig?.input.includes("image") ?? false;
    const supportFile = false;

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
    const hasRestoredScrollPositionRef = useRef(false);
    const isRestoringScrollPositionRef = useRef(false);
    /** pi 会话事件订阅（按 sessionId 绑定到常驻 reducer；切换会话时重建） */
    const piEventUnsubscribeRef = useRef<(() => void) | null>(null);
    const piEventReducerRef = useRef<PiChatEventReducer | null>(null);
    const activePiSessionRef = useRef<string | null>(null);

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

    /**
     * pi 会话事件归约器（每会话常驻一份）：事件写入全部以 actualChatRef（单一事实源）
     * 为基准——不持有闭包快照，避免"停止收尾期间新发消息"等多轮并发时旧快照整行覆盖吞消息。
     */
    const createChatEventReducer = useMemoizedFn(() => {
      const latestChat = (): ChatMessage | null => {
        const chat = actualChatRef.current;
        // displayedChatId 不匹配 = 事件属于已切走的会话，丢弃
        return displayedChatIdRef.current === chat.id ? chat : null;
      };
      return new PiChatEventReducer({
        applyText: (turnId, text) => {
          const base = latestChat();
          if (!base) return;
          const updatedChat = produce(base, draft => {
            const lastMessage = draft.messages.at(-1);
            if (lastMessage?.role === Role.Assistant) {
              applyAssistantTextSnapshot(lastMessage as ResponseMessage, turnId, text);
            }
          });
          publishStreamingChatSnapshot(updatedChat);
        },
        applyReasoning: (turnId, text) => {
          const base = latestChat();
          if (!base) return;
          const updatedChat = produce(base, draft => {
            const lastMessage = draft.messages.at(-1);
            if (lastMessage?.role === Role.Assistant) {
              applyAssistantReasoningSnapshot(lastMessage as ResponseMessage, turnId, text);
            }
          });
          publishStreamingChatSnapshot(updatedChat);
        },
        applyToolCalls: (turnId, executions, toolCalls) => {
          const base = latestChat();
          if (!base) return;
          const updatedChat = produce(base, draft => {
            const lastMessage = draft.messages.at(-1);
            if (lastMessage?.role === Role.Assistant) {
              applyAssistantToolCallsSnapshot(
                lastMessage as ResponseMessage,
                turnId,
                executions,
                toolCalls
              );
            }
          });
          const publishedChat = publishStreamingChatSnapshot(updatedChat);

          // ask-question 进入等待态时，立即持久化快照，确保渲染层重载后可恢复
          const pendingAskQuestionExecutions = executions.filter(
            execution =>
              execution.toolName === ASK_QUESTION_TOOL_NAME &&
              (execution.status === "pending" ||
                execution.status === "executing" ||
                execution.status === "retrying")
          );
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
        finalizeTurn: turnId => {
          const base = latestChat();
          if (!base) return;
          const updatedChat = produce(base, draft => {
            const lastMessage = draft.messages.at(-1);
            if (lastMessage?.role === Role.Assistant) {
              finalizeAssistantTurn(lastMessage as ResponseMessage, turnId);
            }
          });
          publishStreamingChatSnapshot(updatedChat);
        },
        applyUsage: usage => {
          const base = latestChat();
          if (!base) return;
          const updatedChat = produce(base, draft => {
            const lastMessage = draft.messages[draft.messages.length - 1];
            if (lastMessage?.role === Role.Assistant && chatProviderConfig && chatModelConfig) {
              (lastMessage as ResponseMessage).usage = {
                ...usage,
                providerId: chatProviderConfig.id,
                modelName: chatModelConfig.name,
              };
            }
          });
          publishStreamingChatSnapshot(updatedChat);
        },
        onAssistantTurnEnd: () => {},
        onAgentStart: () => {
          const base = latestChat();
          if (base) setSessionPending(getConversationKey(base.id), true);
        },
        onRetryStatus: status => {
          setChatRetryStatus(
            status ? { attempt: status.attempt, maxRetries: status.maxAttempts } : null
          );
          if (status) {
            // 重试轮重置助手占位（幂等快照会追加新 turn，先清上一轮半成品）
            const base = latestChat();
            if (!base) return;
            const resetChat = produce(base, draft => {
              const lastMessageIndex = draft.messages.length - 1;
              const lastMessage = draft.messages[lastMessageIndex];
              if (lastMessage?.role === Role.Assistant) {
                draft.messages[lastMessageIndex] = createAssistantMessage({
                  clientId: (lastMessage as ResponseMessage).clientId,
                });
              }
            });
            updateCurrentChat(resetChat);
            if (displayedChatIdRef.current === resetChat.id) {
              actualChatRef.current = resetChat;
              setUpdateCounter(prev => prev + 1);
            }
          }
        },
        onStreamError: errorMessage => {
          setChatError(errorMessage);
          console.error("聊天请求失败:", errorMessage);
        },
        onSettled: () => {
          void (async () => {
            setChatRetryStatus(null);
            const base = latestChat();
            if (!base) return;
            try {
              const finished = await persistFinishedChatAndGenerateTitle(base);
              if (displayedChatIdRef.current === finished.id) {
                actualChatRef.current = finished;
              }
            } catch (error) {
              message.error("Failed to update chat");
              console.error(error);
            } finally {
              setSessionPending(getConversationKey(base.id), false);
              setChatError(null);
            }
          })();
        },
        onQueueUpdate: () => {},
      });
    });

    /**
     * 会话事件绑定（常驻）：同一会话的多轮发送/恢复共享一个 reducer——pi 事件串行到达，
     * 不存在多份归约状态竞争；切换到新会话时才重建并重绑订阅。
     */
    const ensureSessionBinding = useMemoizedFn((sessionId: string) => {
      if (activePiSessionRef.current === sessionId) return;
      piEventUnsubscribeRef.current?.();
      piEventUnsubscribeRef.current = null;
      const reducer = createChatEventReducer();
      piEventReducerRef.current = reducer;
      piEventUnsubscribeRef.current = onPiSessionEvent(sessionId, event => reducer.handle(event));
      activePiSessionRef.current = sessionId;
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

          const titleResult = await piCompleteChat({
            provider: titleProviderConfig,
            model: titleModelConfig,
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
          if (titleResult.ok && !titleResult.aborted) {
            const nextTitle = titleResult.text ? formatGeneratedChatTitle(titleResult.text) : "";
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
          }
        }
      } catch (e) {
        console.error("Failed to generate title:", e);
      }

      return updatedChatMessage;
    });

    // 抽离的公共方法：处理消息发送逻辑（pi 会话驱动）
    const processMessageSending = useMemoizedFn(
      async (
        requestMessage: RequestMessage,
        options?: {
          shouldClearInput?: boolean;
          shouldCreateNewChat?: boolean;
          persistRequestMessage?: boolean;
          persistedRequestMessage?: RequestMessage;
          baseChatOverride?: ChatMessage;
          toolContext?: {
            flags?: {
              forceReview?: boolean;
              feedbackProposalId?: string;
            };
          };
        }
      ) => {
        if (!chatProviderConfig || !chatModelConfig) {
          message.error("请先在设置中配置对话功能的大模型");
          return false;
        }
        const shouldClearInput = options?.shouldClearInput ?? true;
        const shouldCreateNewChat = options?.shouldCreateNewChat ?? true;
        const persistRequestMessage = options?.persistRequestMessage ?? true;
        const persistedRequestMessage = options?.persistedRequestMessage ?? requestMessage;
        const perf = measurePerformance("sendMessage");
        let actualCurrentChat = options?.baseChatOverride || actualChatRef.current;
        let pendingSessionKey = getConversationKey(actualCurrentChat.id);
        const clearPending = () => setSessionPending(pendingSessionKey, false);
        setChatError(null);
        setChatRetryStatus(null);
        setSessionPending(pendingSessionKey, true);

        scrollToBottom();

        const responseMessage = createAssistantMessage();

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
              content: buildSessionAwareSystemPrompt(systemContent || defaultSystemPrompt),
            };

            const newChatMessages = [systemMessage];

            // 使用外部传入的创建对话回调
            actualCurrentChat = await onCreateChat(
              newChatMessages,
              actualCurrentChat.title || "新对话"
            );
            const createdSessionKey = getConversationKey(actualCurrentChat.id);
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

        // 本次请求之前的对话历史（乐观写入前取，作为 pi 会话的灌入/对账基准）
        const historyBeforeThisTurn: RequestMessage[] = buildHistoryMessages(actualCurrentChat);

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
        setUpdateCounter(prev => prev + 1);
        updateCurrentChat(chatWithNewMessages);
        // 先写入用户消息和助手占位符，后台任务即使在组件卸载后也能恢复。
        actualCurrentChat = await updateChatMessage(chatWithNewMessages);
        actualChatRef.current = actualCurrentChat;

        // 添加新消息后立即强制贴底，避免虚拟列表测量期间被 scroll 监听误判为用户离开底部。
        enableAutoScroll();
        setTimeout(forceScrollToBottomSoon, 0);

        if (shouldClearInput) {
          editTextRef.current?.clear();
        }

        try {
          const baseSystem = buildSystemMessageWithRequest(actualCurrentChat);
          const forcedSkills = extractForcedSkills(requestMessage);
          const systemPrompt = buildPiChatSystemPrompt(
            typeof baseSystem.content === "string"
              ? baseSystem.content
              : baseSystem.content.map(block => (block.type === "text" ? block.text : "")).join(""),
            skills,
            forcedSkills
          );
          const ensureOptions = {
            chatScope,
            chatId: actualCurrentChat.id,
            provider: chatProviderConfig,
            model: chatModelConfig,
            systemPrompt,
            history: historyBeforeThisTurn,
            ...(chatModelConfig.reasoning
              ? { thinkingLevel: toPiThinking(normalizedReasoningEffort) }
              : {}),
            ...(toolScope ? { toolScope } : {}),
            ...(options?.toolContext
              ? { toolContext: options.toolContext as Record<string, unknown> }
              : {}),
          };
          // 编辑重发/重新生成传入截断历史（baseChatOverride）：pi 会话必须重建对齐
          const sessionId = options?.baseChatOverride
            ? await piChatSessionManager.recreateChatSession(ensureOptions)
            : await piChatSessionManager.ensureChatSession(ensureOptions);

          // 常驻绑定：同一会话多轮发送共享 reducer（recreate 换了 sessionId 会自动重建）
          ensureSessionBinding(sessionId);

          const contentItems = Array.isArray(requestMessage.content)
            ? requestMessage.content
            : [{ type: "text" as const, text: requestMessage.content as string }];
          const promptText = contentItems
            .filter(item => item.type === "text")
            .map(item => item.text)
            .join("\n");
          // 图片只传定位信息（image 字段是 protocol URL，path 才是真实路径），主进程读文件转 base64
          const images = supportImage
            ? contentItems
                .filter(item => item.type === "image")
                .map(item =>
                  item.image.startsWith("data:")
                    ? { dataUrl: item.image }
                    : { path: item.path ?? item.image }
                )
            : [];

          let promptOutcome = await piSessionPrompt(sessionId, promptText, images);
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
                void piSessionPrompt(sessionId, promptText, images).then(outcome => {
                  cleanup();
                  resolve(outcome);
                });
              });
              const giveUpTimer = setTimeout(() => {
                cleanup();
                resolve({ ok: false, error: "会话仍在处理中，请稍后重试" });
              }, 15000);
            });
          }
          if (!promptOutcome.ok) {
            setChatError(promptOutcome.error ?? "发送失败");
            setSessionPending(getConversationKey(actualCurrentChat.id), false);
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
          const errorMessage = getErrorMessage(error);
          setChatError(errorMessage);
          clearPending();
          perf.end();
          return true;
        }
      }
    );

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
      if (hideInput || sendLoading) {
        return;
      }

      const pendingSession = submittedAskQuestionSessions.find(
        session => !resumingAskQuestionRef.current.has(session.sessionId)
      );
      if (!pendingSession || !pendingSession.submittedAnswers) {
        return;
      }

      resumingAskQuestionRef.current.add(pendingSession.sessionId);

      void (async () => {
        const askQuestionResult = buildAskQuestionToolResult(
          pendingSession.payload,
          pendingSession.submittedAnswers!
        );
        const answerJson = JSON.stringify(askQuestionResult, null, 2);
        completeAskQuestionSession(pendingSession.sessionId);

        // pi 会话恢复：主进程的工具 execute 仍挂起——直接回传答案让它续流
        // （渲染层重载后本地会话表丢失，经 find-by-scope 收养主进程仍持有的会话）
        const activeChat = actualChatRef.current;
        const sessionId = await piChatSessionManager.adoptOrResolveSession(
          chatScope,
          activeChat.id
        );
        if (sessionId) {
          // 收养后续流：常驻绑定后回传答案，事件流写回最后一条 assistant 消息
          ensureSessionBinding(sessionId);
          setSessionPending(getConversationKey(activeChat.id), true);
          await piSessionToolResult(sessionId, pendingSession.toolCallId, {
            content: answerJson,
          });
          return;
        }

        // 兜底（主进程也已重启，pi 会话丢失）：把答案写进 chat 行终态，续流由 M4 会话恢复承接
        const resolvedChat = markAskQuestionExecutionResolved(
          activeChat,
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
      })();
    }, [
      hideInput,
      sendLoading,
      submittedAskQuestionSessions,
      completeAskQuestionSession,
      updateCurrentChat,
      updateChatMessage,
      chatScope,
      ensureSessionBinding,
      getConversationKey,
      setSessionPending,
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

    const onSelectModel = useMemoizedFn((providerId: string, modelId: string) => {
      useSettingStore.setState(
        produce(draft => {
          draft.setting.llmUsageSettings.chat.providerId = providerId;
          draft.setting.llmUsageSettings.chat.modelId = modelId;
        })
      );
    });

    // 模型选择菜单：按服务商分组（D-048：纯数据，由输入区用 @tau/ui Menu 渲染）
    const modelGroups = useMemo(
      () =>
        llmConfigs.map(provider => ({
          key: provider.id,
          label: provider.name,
          children: (provider.models ?? []).map(model => ({
            key: `${provider.id}::${model.id}`,
            label: model.name ?? model.id,
            description: model.name && model.name !== model.id ? model.name : undefined,
          })),
        })),
      [llmConfigs]
    );
    const currentModelKey =
      chatProviderConfig && chatModelConfig
        ? `${chatProviderConfig.id}::${chatModelConfig.id}`
        : undefined;

    // 处理模型选择
    const handleModelSelect = useMemoizedFn(({ key }: { key: string }) => {
      const [providerId, modelId] = key.split("::");
      onSelectModel(providerId, modelId);
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

    // 停止流式请求：pi 会话 abort（半成品由 agent_settled 流程持久化）。
    // 乐观清 pending 让输入区立即恢复；settled 后的清理是幂等的
    const stopStreaming = useMemoizedFn(() => {
      const activeChat = actualChatRef.current;
      const conversationKey = getConversationKey(activeChat.id);
      const sessionId = piChatSessionManager.resolveSessionId(chatScope, activeChat.id);
      setSessionPending(conversationKey, false);
      if (!sessionId) {
        return;
      }
      void piSessionAbort(sessionId);
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

    // 阅读列：对话页限宽居中，停靠栏撑满（消息、提示条、输入区同一列宽）
    // 输入区 / 状态条与消息列同一条左右边线，且左右留白对称：左 = 消息容器 padding，
    // 右 = padding + 6px 透明边 + 4px 滚动条槽位，两侧合计相等
    const chatGutter = compact ? "px-5" : "px-8";
    const column = (node: React.ReactNode) =>
      contentMaxWidth ? (
        <div className="mx-auto w-full" style={{ maxWidth: contentMaxWidth }}>
          {node}
        </div>
      ) : (
        node
      );

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
          className={cn(
            "ease-tau-out rounded-tau-lg flex h-full min-h-0 flex-col transition-[background,box-shadow] duration-[160ms] motion-reduce:transition-none",
            // 拖入卡片 / 文章：accent 轻染整块，提示可放下
            isChatContentDragOver &&
              canDropChatContent &&
              "bg-accent-soft shadow-[inset_0_0_0_2px_var(--tau-accent)]"
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
            reasoningEffort={chatModelConfig?.reasoning ? normalizedReasoningEffort : undefined}
            reasoningEffortOptions={reasoningEffortOptions}
            onReasoningEffortChange={
              chatModelConfig?.reasoning ? value => setReasoningEffort(value) : undefined
            }
            reasoningEffortDisabled={!chatModelConfig?.reasoning}
            currentModelName={chatModelConfig?.name ?? chatModelConfig?.id}
            contextWindowK={
              chatModelConfig?.contextWindow
                ? Math.round(chatModelConfig.contextWindow / 1024)
                : undefined
            }
            contextUsage={contextUsage}
            isSupportImage={supportImage}
            isSupportFile={supportFile}
            onSendMessageContent={async content => {
              await submitMessageContent(content);
            }}
            onStopGeneration={stopStreaming}
            createMessageLoading={createMessageLoading}
            onCreateNewMessage={onCreateNewMessage}
            inputRef={editTextRef}
            messagesContainerRef={setMessagesContainer}
            messagesContainerClassName={cn(
              FADE_SCROLL_CLASS,
              "flex-1 min-h-0 box-border relative will-change-transform [-webkit-overflow-scrolling:touch]",
              // 常驻滚动条槽位：消息列宽度不随「内容是否溢出」变化，输入区按 chatGutter 同宽对齐
              "[scrollbar-gutter:stable]",
              compact ? "pl-5 pr-2.5" : "pl-8 pr-[22px]"
            )}
            renderEmptyState={() => emptyState ?? null}
            renderStatusBanner={({ retryStatus, error }) =>
              retryStatus || error ? (
                <div className={cn("pt-2", chatGutter)}>
                  {column(
                    <div
                      role="status"
                      className={cn(
                        "text-tau-sm rounded-tau-sm flex items-center gap-2 px-3 py-2",
                        retryStatus ? "bg-warn-soft text-warn" : "bg-danger-soft text-danger"
                      )}
                    >
                      {retryStatus ? (
                        <>
                          <RotateCw
                            size={13}
                            strokeWidth={1.75}
                            className="shrink-0 animate-spin"
                          />
                          <span>
                            请求失败，正在重试（第 {retryStatus.attempt}/{retryStatus.maxRetries}{" "}
                            次）…
                          </span>
                        </>
                      ) : (
                        <>
                          <TriangleAlert size={13} strokeWidth={1.75} className="shrink-0" />
                          <span className="min-w-0 break-words">{error}</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ) : null
            }
            renderInputWrapper={inputNode => (
              <div
                className={cn("box-border flex-none pt-2", chatGutter, compact ? "pb-3" : "pb-5")}
              >
                {column(
                  <>
                    {editingDraft || hiddenPromptContext ? (
                      <div className="bg-accent-soft text-tau-sm -mb-2 flex items-center justify-between gap-3 rounded-t-[16px] px-3.5 pb-4 pt-2">
                        <div className="text-accent-text min-w-0">
                          <span className="font-semibold">
                            {editingDraft ? "正在编辑最后一条消息" : "正在编辑生成的图片"}
                          </span>
                          <span className="text-ink-2 ml-2">
                            {editingDraft
                              ? "发送后将替换这条消息及其后的回复"
                              : "输入调整要求，发送后基于选中的图片调用编辑工具"}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="text-accent-text hover:bg-accent/15 shrink-0 rounded-[7px] px-2 py-0.5"
                          onClick={() =>
                            editingDraft ? setEditingDraft(null) : setHiddenPromptContext(null)
                          }
                        >
                          {editingDraft ? "取消编辑" : "退出编辑"}
                        </button>
                      </div>
                    ) : null}
                    {/* 输入框外框：＋ / @ 面板按它的矩形定位（同宽、贴上沿） */}
                    <div
                      {...{ [COMPOSER_ANCHOR_ATTR]: "" }}
                      className="border-line-1 bg-surface ease-tau-out focus-within:border-accent relative rounded-[16px] border pb-2.5 pl-3.5 pr-2.5 pt-3 transition-[border-color,box-shadow] duration-[160ms] focus-within:shadow-[var(--tau-focus-ring)]"
                    >
                      {inputNode}
                    </div>
                  </>
                )}
              </div>
            )}
            renderChatInputArea={({ chatInputRef, inputProps }) => {
              const {
                services: _services,
                onMcpManagerClick: _onMcpManagerClick,
                modelSelectItems: _modelSelectItems,
                onModelSelect: _onModelSelect,
                extraToolbarButtons: _extraToolbarButtons,
                className: _className,
                ...desktopInputProps
              } = inputProps;

              return (
                <ChatInputArea
                  ref={chatInputRef}
                  {...desktopInputProps}
                  compact={compact}
                  toolScope={toolScope}
                  modelGroups={modelGroups}
                  currentModelKey={currentModelKey}
                  onModelSelect={handleModelSelect}
                  placeholder={hiddenPromptContext?.label || desktopInputProps.placeholder}
                />
              );
            }}
            onDeleteMessage={handleDeleteMessage}
            onRegenerateMessage={handleRegenerateMessage}
            onCreateBranch={handleCreateBranch}
            renderMessage={({ messageIndex }) => {
              const item = visibleMessages[messageIndex];
              if (!item) return null;

              const streamingIndex = sendLoading ? visibleMessages.length - 1 : -1;
              const isStreaming =
                sendLoading && messageIndex === streamingIndex && item.role === Role.Assistant;

              return column(
                <div
                  key={`${item.role}-${messageIndex}`}
                  className={cn("pb-2", messageIndex === 0 ? (compact ? "pt-3" : "pt-6") : "pt-2")}
                >
                  <MessageItem
                    message={item}
                    isDark={isDark}
                    markdownComponents={markdownComponents}
                    isVisible={isVisible}
                    messageIndex={messageIndex}
                    onDeleteMessage={handleDeleteMessage}
                    onRegenerateMessage={handleRegenerateMessage}
                    onEditMessage={
                      !hideInput &&
                      !sendLoading &&
                      item.role === Role.User &&
                      messageIndex === lastUserMessageIndex &&
                      getRequestMessageText(item as RequestMessage).trim().length > 0
                        ? handleEditMessage
                        : undefined
                    }
                    onCreateBranch={handleCreateBranch}
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
