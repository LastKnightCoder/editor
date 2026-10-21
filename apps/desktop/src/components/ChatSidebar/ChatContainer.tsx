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
import { CornerDownRight, GitBranch, Pencil, RotateCw, Trash2, TriangleAlert } from "lucide-react";

import ChatInputArea from "@/components/ChatInputArea";
import type { ChatInputAreaHandle } from "@/components/ChatInputArea";

import { measurePerformance } from "./hooks/usePerformanceMonitor";
import MessageItem from "./MessageItem";

import { ChatMessage, ChatSessionMessage, RequestMessage, ResponseMessage } from "@/types";
import type { PiPromptDisplay } from "@/types/pi-session";
import {
  clampThinkingLevel,
  normalizeStoredThinkingLevel,
  resolveThinkingLevelOptions,
  useThinkingLevels,
} from "@/services/llmCatalog";
import {
  Role,
  SUMMARY_TITLE_PROMPT,
  DEFAULT_SYSTEM_PROMPT,
  buildSessionAwareSystemPrompt,
} from "@/constants";
import { piCompleteChat } from "@/services/piLLM";
import { remoteResourceToLocal } from "@/utils/resouce";
import { buildPiPromptPayload } from "@/services/piPromptPayload";
import {
  buildPiChatSystemPrompt,
  withForcedSkillReadmes,
  chatSessionKey,
  piChatSessionManager,
} from "@/services/piChatSession";
import { adoptTranscript, piChatRuntime, type PiChatRuntimeDeps } from "@/services/piChatRuntime";
import {
  onPiSessionEvent,
  piSessionAbort,
  piSessionPrompt,
  piSessionSteer,
  type PiSessionEdit,
} from "@/commands/piSession";
import useChatSessionStore, {
  bucketOfChatScope,
  isDraftChat,
  resolveChatCwd,
} from "@/stores/useChatSessionStore";
import useLLMConfig from "@/hooks/useLLMConfig";
import useSettingStore from "@/stores/useSettingStore";
import useSkillStore from "@/stores/useSkillStore";
import type { EditTextHandle } from "@tau/ui";
import { FADE_SCROLL_CLASS, Popover, cn, toast, useEdgeFade } from "@tau/ui";
import { useConversationTree } from "@/features/chat/useConversationTree";
import { ConversationTreePanel } from "@/features/chat/components/ConversationTreePanel";
import { conversationEntryTail, type ConversationTreeRow } from "@/features/chat/conversationTree";
import { piSessionTree } from "@/commands/piSession";
import { useChatEntryLocation } from "./useChatEntryLocation";
import {
  COMPOSER_ANCHOR_ATTR,
  type ChatMessageType as CoreChatMessageType,
  type MentionRef,
  type MessageContentItem,
  useChatAutoScroll,
} from "@tau/shared";
import { ChatContainerCore, type ChatContainerCoreHandle } from "@tau/chat-ui";
import { ToolRendererInteractionProvider } from "@/tool-call-renderers/ToolRendererInteractionContext";
import { createAssistantMessage } from "@/services/assistantMessageBlocks";
import { createChatMessageClientId } from "@/services/chatMessageSchema";
import { latestContextUsage } from "@/services/chatContextUsage";
import { canRetryChatMessage } from "@/services/chatRetry";
import { requestQuestionCapture } from "@/services/question-capture";
import {
  buildTitleSummaryMessages,
  formatGeneratedChatTitle,
  getRequestMessageText,
  shouldRestoreInputAfterSendError,
  shouldGenerateChatTitle,
} from "./editingUtils";
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

/**
 * 每个对话的基础 system prompt（含会话时间上下文）在本次运行内固定：时间精确到分钟，
 * 每轮重算会让 system 段每轮都变、整条提示缓存作废。重载后重新生成一次（只丢一次缓存）。
 */
const SESSION_SYSTEM_PROMPTS = new Map<string, { base: string; prompt: string }>();
const sessionSystemPromptOf = (chatId: string, base: string): string => {
  const cached = SESSION_SYSTEM_PROMPTS.get(chatId);
  if (cached && cached.base === base) return cached.prompt;
  const prompt = buildSessionAwareSystemPrompt(base);
  SESSION_SYSTEM_PROMPTS.set(chatId, { base, prompt });
  return prompt;
};

/** 界面上的消息序列（投影不含 system；旧快照可能还带着，一并滤掉） */
const visibleMessagesOf = (chat: ChatMessage) =>
  chat.messages.filter(message => message.role !== Role.System);

/** 第 index 条可见消息（须为用户消息）对应的 pi entry id */
const userEntryIdAt = (messages: ChatMessage["messages"], index: number): string | undefined => {
  const target = messages[index];
  return target?.role === Role.User ? target.piEntryIds?.[0] : undefined;
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

interface EditingDraftState {
  messageIndex: number;
}

interface HiddenPromptContextState {
  text: string;
  label?: string;
}

interface ChatContainerProps {
  entry?: string;
  onEntryLocated?: () => void;
  /** 当前对话（统一会话 store 里已打开的对话；新对话是草稿：真 id、尚无 sessionFile） */
  currentChat: ChatMessage;
  isDark: boolean;
  markdownComponents: any;
  isVisible: boolean; // 控制是否应该渲染内容
  sendLoading: boolean;
  setSendLoading: (loading: boolean) => void;
  titleRef: React.RefObject<EditTextHandle | null>;
  onCreateNewMessage: () => void;
  createMessageLoading: boolean;
  hideInput?: boolean; // 控制是否隐藏输入框
  /** 对话作用域（`main-chat` / `pdf-chat:<pdfId>` …）：会话键前缀 + 统一 store 的分桶 */
  chatScope?: string;
  /** 工具作用域：只有本对话能用该作用域注册的页面专属工具，输入框 MCP 面板也只列它们 */
  toolScope?: string;
  preserveScrollPosition?: boolean; // 侧边栏收起后重新打开时恢复滚动位置
  scrollPositionScope?: string; // 滚动位置缓存作用域，不影响模型会话键
  /** 草稿首轮发送后登记为正式对话（id 不变），宿主据此把它设为当前 */
  onChatCreated?: (chatId: string) => void;
  customSystemPrompt?: string; // 自定义系统提示（覆盖默认）
  beforeSendUserMessage?: (content: MessageContentItem[]) => Promise<boolean | void>;
  /** 阅读列最大宽度（对话页 760 居中；停靠栏缺省 = 撑满） */
  contentMaxWidth?: number;
  /** 紧凑档（停靠栏）：输入区工具行精简 */
  compact?: boolean;
  /** 无消息时消息区的占位内容 */
  emptyState?: React.ReactNode;
  /** 输入框正上方的附件区（如 PDF 阅读页的引用 chip） */
  composerAccessory?: React.ReactNode;
  /** 用户消息发送（或排队）前改写内容，每条消息调用一次（如把引用并进消息） */
  prepareUserContent?: (content: MessageContentItem[]) => MessageContentItem[];
}

export type ChatContainerHandle = {
  scrollToTop: () => void;
  focusInput: () => void;
  setInputValue: (value: string) => void;
  /** 在输入框末尾插入引用（与拖入内容相同） */
  appendMentions: (mentions: MentionRef[]) => void;
  sendUserMessage: (content: MessageContentItem[]) => Promise<boolean>;
};

const ChatContainer = forwardRef<ChatContainerHandle, ChatContainerProps>(
  (
    {
      currentChat,
      entry,
      onEntryLocated,
      isDark,
      markdownComponents,
      isVisible,
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
      beforeSendUserMessage,
      contentMaxWidth,
      compact = false,
      emptyState,
      composerAccessory,
      prepareUserContent,
    },
    ref
  ) => {
    const message = toast;
    const { provider: chatProviderConfig, model: chatModelConfig } = useLLMConfig("chat");
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
      setExternalSendLoading(sendLoading);
    }, [sendLoading, setExternalSendLoading]);

    const llmConfigs = useSettingStore(state => state.setting.llmProviders);
    const skills = useSkillStore(state => state.skills);
    const loadSkills = useSkillStore(state => state.loadSkills);

    // 加载 Skills 数据（用于注入系统 Prompt）
    useEffect(() => {
      loadSkills();
    }, [loadSkills]);

    // 档位取值即运行时档位（旧键存过 "none"，读出时归一为 "off"）
    const [storedThinkingLevel, setStoredThinkingLevel] = useLocalStorageState<string>(
      "reasoningEffort",
      { defaultValue: "off" }
    );
    // 档位按模型真实能力给（经主进程查预设目录）：目录未收录的模型退回通用档
    const { levels: catalogLevels } = useThinkingLevels(
      chatProviderConfig ?? undefined,
      chatModelConfig?.id ?? ""
    );
    const thinkingLevelOptions = useMemo(
      () =>
        resolveThinkingLevelOptions({
          reasoning: chatModelConfig?.reasoning,
          catalogLevels,
        }),
      [chatModelConfig?.reasoning, catalogLevels]
    );
    const thinkingLevel = clampThinkingLevel(
      normalizeStoredThinkingLevel(storedThinkingLevel),
      thinkingLevelOptions
    );

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

    // 跟踪实际使用的聊天对象：模块级 runtime 容器（单一事实源）——组件卸载/切页后
    // 事件归约与持久化仍在 runtime 中继续（后台运行），重挂载时拿回同一容器无缝接续。
    // deps 每次渲染刷新（均为无组件生命周期的引用：store action / IPC command / 安全闭包）
    const runtimeDeps: PiChatRuntimeDeps = {
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
            titleRef.current?.setValue(title);
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
    // 挂载引用：挂着的条目不回收（M4-e）；卸载后条目常驻（后台运行），空闲时才可能被 LRU 回收
    useEffect(() => piChatRuntime.retain(sessionKey), [sessionKey]);
    useEffect(() => {
      void piChatRuntime
        .restoreSession(sessionKey, chatScope, currentChat.id)
        .catch(error => console.error("恢复对话运行状态失败:", error));
    }, [sessionKey, chatScope, currentChat.id]);

    // 强制更新计数器，用于触发visibleMessages重新计算
    const [updateCounter, setUpdateCounter] = useState(0);

    // 聊天上传以 pi 为准：文本、图片与文件；文件由模型用 read 工具读取
    const supportImage = chatModelConfig?.input.includes("image") ?? false;
    const supportFile = true;

    const displayedChatIdRef = useRef(currentChat.id);
    /** 当前对话键（与 runtime/会话键同一套取值）：发送期间对话可能切换，异步流程据此对账 */
    const conversationKeyRef = useRef(sessionKey);
    const queueDrainInProgressRef = useRef(false);
    const activeAssistantTurnIdRef = useRef<string | null>(null);
    const hasRestoredScrollPositionRef = useRef(false);
    const isRestoringScrollPositionRef = useRef(false);

    const getConversationKey = useMemoizedFn((chatId: string) =>
      chatSessionKey(chatScope, chatId, currentChat.databaseName)
    );

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
              ? `[文件：${item.fileName ?? item.file}]`
              : "[图片]"
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

    const getScrollPositionKey = useMemoizedFn((chatId: string) => {
      // 草稿没有历史位置可恢复
      if (!preserveScrollPosition || isDraftChat(actualChatRef.current)) {
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

    useEffect(() => {
      if (hideInput) {
        setEditingDraft(null);
      }
    }, [hideInput]);

    /**
     * pi 会话事件归约与收尾已下沉到模块级 services/piChatRuntime（后台运行）：
     * 组件只负责发送编排（ensure 会话 + prompt）与 UI 展示，事件 → 聊天行的写入
     * 经 runtime 的常驻 reducer（单一事实源容器 + store 发布），卸载/切页不中断。
     */

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
        source: { feature: "titleSummary" },
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

    /**
     * 用户输入内容 → pi prompt 载荷（发送与插话共用）：
     * 文件转成本地路径提示交模型自己 read；图片只传定位信息（image 是 protocol URL，
     * path 才是真实路径），主进程读文件转 base64。
     */
    const buildPromptPayload = useMemoizedFn((contentItems: MessageContentItem[]) =>
      buildPiPromptPayload(contentItems, {
        includeImages: supportImage,
        resolveRemoteFile: remoteResourceToLocal,
      })
    );

    /**
     * 改会话树（M4-d）：回退/分叉/切版本/删除都在同一文件的树上。宿主会话开着且空闲时主进程
     * 直接改它（不重建，本会话的工具授权保留），把改后的投影写回容器。
     */
    const editSessionHistory = useMemoizedFn(
      async (edit: PiSessionEdit): Promise<ChatMessage | null> => {
        const chat = actualChatRef.current;
        if (!chat.sessionFile) {
          message.warning("对话还没有保存下来，暂时不能修改历史");
          return null;
        }
        let messages: ChatSessionMessage[];
        try {
          messages = await useChatSessionStore.getState().editChat(chat.id, edit);
        } catch (error) {
          message.error(getErrorMessage(error) || "修改对话历史失败");
          return null;
        }
        const next = adoptTranscript(chat, messages);
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
          message.error("请先在设置中配置对话功能的大模型");
          return false;
        }
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
            : [
                ...actualChatRef.current.messages,
                persistedRequestMessage,
                createAssistantMessage(),
              ],
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
          const baseSystem = sessionSystemPromptOf(
            actualCurrentChat.id,
            customSystemPrompt || DEFAULT_SYSTEM_PROMPT
          );
          const forcedSkills = extractForcedSkills(requestMessage);
          const systemPrompt = buildPiChatSystemPrompt(
            baseSystem,
            await withForcedSkillReadmes(skills, forcedSkills),
            forcedSkills
          );
          // 不传历史：pi 从会话文件恢复上下文（草稿首轮以对话 id 新建会话）
          const ensured = await piChatSessionManager.ensureChatSession({
            databaseName: actualCurrentChat.databaseName,
            chatScope,
            chatId: actualCurrentChat.id,
            ...(actualCurrentChat.sessionFile
              ? { sessionFile: actualCurrentChat.sessionFile }
              : {}),
            provider: chatProviderConfig,
            model: chatModelConfig,
            systemPrompt,
            // 只有主对话可选工作目录；学习项目由主进程按场景固定，PDF / 视频笔记在应用数据目录
            cwd: chatScope === "main-chat" ? resolveChatCwd(actualCurrentChat.id) : "",
            ...(chatModelConfig.reasoning ? { thinkingLevel } : {}),
            ...(toolScope ? { toolScope } : {}),
            ...(options?.toolContext
              ? { toolContext: options.toolContext as Record<string, unknown> }
              : {}),
          });
          const sessionId = ensured.sessionId;

          // 草稿首轮：宿主回传了会话文件名，登记目录行（id 不变，只是从草稿变成正式对话）。
          // 必须在 prompt 之前——会话空闲时 prompt 要等整轮跑完才返回
          if (!actualCurrentChat.sessionFile && ensured.sessionFile) {
            const bucket = bucketOfChatScope(chatScope);
            const row = await useChatSessionStore
              .getState()
              .registerChat(
                { ...actualChatRef.current, scope: bucket.scope, domainRef: bucket.domainRef },
                ensured.sessionFile
              );
            actualCurrentChat = { ...actualChatRef.current, sessionFile: row.sessionFile };
            actualChatRef.current = actualCurrentChat;
            useChatSessionStore.getState().publishChat(actualCurrentChat);
            onChatCreated?.(actualCurrentChat.id);
          }

          // runtime 常驻绑定：同一会话多轮发送共享归约器（重建换了 sessionId 自动重建）
          piChatRuntime.bindSession(conversationKey, sessionId);

          const contentItems = Array.isArray(requestMessage.content)
            ? requestMessage.content
            : [{ type: "text" as const, text: requestMessage.content as string }];
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
                resolve({ ok: false, error: "会话仍在处理中，请稍后重试" });
              }, 15000);
            });
          }
          if (!promptOutcome.ok) {
            setChatError(promptOutcome.error ?? "发送失败");
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
          const errorMessage = getErrorMessage(error);
          setChatError(errorMessage);
          clearPending();
          perf.end();
          return true;
        }
      }
    );

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
      appendMentions: (mentions: MentionRef[]) => {
        for (const mention of mentions) editTextRef.current?.appendMention?.(mention);
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

    const visibleMessages = useMemo(
      () => visibleMessagesOf(actualChatRef.current),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [actualChatRef, updateCounter]
    );

    // 树谱（M4-d）：分叉点在对话流里标出来，全貌在「N 条分支」浮层里
    const conversationTree = useConversationTree({
      id: actualChatRef.current.id,
      sessionFile: actualChatRef.current.sessionFile,
      messages: visibleMessages,
    });
    const [treeOpen, setTreeOpen] = useState(false);

    const contextUsage = useMemo(() => {
      return latestContextUsage(
        actualChatRef.current.messages,
        chatProviderConfig?.id,
        chatModelConfig ?? undefined
      );
    }, [actualChatRef, chatModelConfig, chatProviderConfig?.id, updateCounter]);

    const lastVisibleMessageRole =
      visibleMessages.length > 0 ? visibleMessages[visibleMessages.length - 1]?.role : undefined;

    useEffect(() => {
      if (!editingDraft) {
        return;
      }

      // 任意一条用户消息都能编辑（M4-d：原内容作为一个版本留在树上）
      const targetMessage = visibleMessages[editingDraft.messageIndex];
      const isEditingTargetStillValid = targetMessage?.role === Role.User;

      if (!isEditingTargetStillValid) {
        setEditingDraft(null);
      }
    }, [editingDraft, visibleMessages]);

    // 停止流式请求：pi 会话 abort（半成品由 agent_settled 流程持久化）。
    // 乐观清 pending 让输入区立即恢复；settled 后的清理是幂等的
    const stopStreaming = useMemoizedFn(() => {
      const activeChat = actualChatRef.current;
      const conversationKey = getConversationKey(activeChat.id);
      // 立即反馈：清 pending + runtime streaming 位；后台 pi 自行收尾（settled 落库幂等）
      setSessionPending(conversationKey, false);
      piChatRuntime.forceStopStreaming(conversationKey);
      const sessionId = piChatSessionManager.resolveSessionId(chatScope, activeChat.id);
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
        expectedConversationKey = conversationKeyRef.current
      ) => {
        if (
          expectedConversationKey !== conversationKeyRef.current ||
          expectedConversationKey !== getConversationKey(actualChatRef.current.id)
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
          message.warning("这条消息还没有保存下来，暂时不能编辑");
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

    const submitMessageContent = useMemoizedFn(
      async (rawContent: MessageContentItem[]): Promise<boolean> => {
        const content = prepareUserContent ? prepareUserContent(rawContent) : rawContent;
        const conversationKey = conversationKeyRef.current;
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

    /**
     * 运行中插话（pi 原生 steer）：消息在当前步骤跑完后、下一次请求模型前送达本轮，
     * 不新起一轮。送达时由 runtime 把用户消息写进聊天行（见 onUserMessageDelivered）。
     * 返回 requeued 表示这轮已结束、已退回待发送队列；rejected 表示调用方自己处置内容。
     */
    const steerMessageContent = useMemoizedFn(
      async (content: MessageContentItem[]): Promise<"steered" | "requeued" | "rejected"> => {
        const conversationKey = conversationKeyRef.current;
        // 编辑重发/图片编辑上下文都要重建会话，插进当前这轮语义就错了
        if (editingDraft || hiddenPromptContext) {
          message.warning("正在编辑消息，插话请先取消编辑");
          return "rejected";
        }
        if (!piChatRuntime.canSteer(conversationKey)) return "rejected";
        const sessionId = piChatSessionManager.resolveSessionId(
          chatScope,
          actualChatRef.current.id
        );
        if (!sessionId) return "rejected";
        const { promptText, images } = await buildPromptPayload(content);
        if (!promptText.trim() && images.length === 0) {
          message.warning("请输入内容");
          return "rejected";
        }
        // 先登记再发 IPC：送达事件可能先于 IPC 返回到达
        const steerId = piChatRuntime.addPendingSteer(conversationKey, {
          text: promptText,
          content,
        });
        if (!steerId) return "rejected";
        const outcome = await piSessionSteer(sessionId, promptText, images, { content });
        if (outcome.ok) return "steered";
        // 失败退回待发送（settled 兜底可能已经退过，returnPendingSteerToQueue 幂等）
        const returned = piChatRuntime.returnPendingSteerToQueue(conversationKey, steerId);
        if (outcome.reason !== "not-streaming") {
          message.error(outcome.error ?? "插话失败，已退回待发送");
        }
        return returned ? "requeued" : "rejected";
      }
    );

    /** 输入框直接插话（⌘/Ctrl + Shift + Enter 或插话按钮）：只有成功交出去才清输入框 */
    const steerFromInput = useMemoizedFn(async () => {
      const content = editTextRef.current?.getValue() ?? [];
      if (content.length === 0) return;
      const result = await steerMessageContent(content);
      if (result === "rejected") return;
      editTextRef.current?.clear();
      if (result === "requeued") {
        message.info("这轮回答已结束，已加入待发送");
      }
    });

    /** 待发送消息改为插话：先移出队列（UI 立即从「待发送」转到「插话」），失败再退回 */
    const steerQueuedMessage = useMemoizedFn(async (index: number) => {
      const conversationKey = conversationKeyRef.current;
      const content = piChatRuntime.takeQueuedMessage(conversationKey, index);
      if (!content) return;
      const result = await steerMessageContent(content);
      if (result === "rejected") {
        piChatRuntime.requeueMessage(conversationKey, content);
      }
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

    // 用户消息转为问题：只在主对话（其余场景的对话不能经对话页打开）；问题记下这条消息的 entry id
    const handleToQuestion = useMemoizedFn((messageIndex: number) => {
      const chat = actualChatRef.current;
      const target = visibleMessagesOf(chat)[messageIndex];
      const entryIds = target?.piEntryIds ?? [];
      if (!target || target.role !== Role.User) return;
      if (entryIds.length === 0) {
        message.warning("这条消息还没有保存下来，暂时不能转为问题");
        return;
      }
      const text = getRequestMessageText(target as RequestMessage).trim();
      requestQuestionCapture({
        source: { kind: "chat", sessionId: chat.id, messageIds: entryIds },
        sourceLabel: `对话：${chat.title || "未命名对话"}`,
        defaultTitle: text.replace(/\s+/g, " ").slice(0, 200),
      });
    });

    // 删除消息：pi 原生 context_edit 省略（只删那一条；一条回答要把它全部 entry 一起省略）
    const handleDeleteMessage = useMemoizedFn(async (messageIndex: number) => {
      if (sendLoading) {
        message.warning("回答进行中，请先停止再删除消息");
        return;
      }
      const target = visibleMessagesOf(actualChatRef.current)[messageIndex];
      const entryIds = target?.piEntryIds ?? [];
      if (entryIds.length === 0) {
        message.warning("这条消息还没有保存下来，暂时不能删除");
        return;
      }
      const edited = await editSessionHistory({ kind: "omit", entryIds });
      if (edited) message.success("消息已删除");
    });

    // 未产出有效结果的末尾问题原位重试，其余重新生成保留旧版本。
    const handleRegenerateMessage = useMemoizedFn(async (messageIndex: number) => {
      if (sendLoading) return;
      const targetMessage = visibleMessagesOf(actualChatRef.current)[messageIndex];
      if (!targetMessage || targetMessage.role !== Role.User) {
        message.warning("只能重新生成用户消息");
        return;
      }
      const entryId = targetMessage.piEntryIds?.[0];
      if (canRetryChatMessage(visibleMessagesOf(actualChatRef.current), messageIndex)) {
        await processMessageSending(targetMessage as RequestMessage, {
          shouldClearInput: false,
          retryMessage: targetMessage as RequestMessage,
        });
        return;
      }
      if (!entryId) {
        message.warning("这条消息还没有保存下来，暂时不能重新生成");
        return;
      }
      await processMessageSending(targetMessage as RequestMessage, {
        shouldClearInput: false,
        rewindBeforeEntryId: entryId,
      });
    });

    const handleEditMessage = useMemoizedFn((messageIndex: number, content: string) => {
      if (hideInput || sendLoading) {
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

    /**
     * 从这里建分支（M4-d）：回到这条回答之后，之后的对话留在树上成为另一个版本；
     * 接下来发送的消息就是新分支，可以在那条用户消息上 ‹ i/n › 切回去。
     */
    const handleCreateBranch = useMemoizedFn(async (messageIndex: number) => {
      const currentChat = actualChatRef.current;
      if (isDraftChat(currentChat)) {
        message.warning("请先发送一条消息再建分支");
        return;
      }
      if (sendLoading) {
        message.warning("回答进行中，请先停止再建分支");
        return;
      }
      const target = visibleMessagesOf(currentChat)[messageIndex];
      const entryId = target?.piEntryIds?.at(-1);
      if (!entryId) {
        message.warning("这条消息还没有保存下来，暂时不能建分支");
        return;
      }
      if (messageIndex === visibleMessagesOf(currentChat).length - 1) {
        message.info("已经是最新的回答，直接发送消息即可继续");
        return;
      }
      const edited = await editSessionHistory({ kind: "fork", entryId });
      if (edited) {
        message.success("已从这里分叉，发送的消息会成为新分支");
        editTextRef.current?.focusEnd();
      }
    });

    /** 切到这条用户消息的另一个版本：后面的整段对话一起换成那个版本的 */
    const handleSwitchVersion = useMemoizedFn(
      async (messageIndex: number, versionIndex: number) => {
        if (sendLoading) {
          message.warning("回答进行中，请先停止再切换版本");
          return;
        }
        const target = visibleMessagesOf(actualChatRef.current)[messageIndex] as
          RequestMessage | undefined;
        const entryId = target?.piVersions?.ids[versionIndex];
        if (!entryId) return;
        setEditingDraft(null);
        await editSessionHistory({ kind: "switch", entryId });
      }
    );

    /** 树谱里点一条分支：切过去，并在对话流里定位到这条分支的起点 */
    const handleTreeSelect = useMemoizedFn(async (row: ConversationTreeRow) => {
      setTreeOpen(false);
      if (sendLoading) return;
      const onPathAlready = row.onPath && row.isLeaf;
      const next = onPathAlready
        ? actualChatRef.current
        : await editSessionHistory({ kind: "switch", entryId: row.tail.id });
      if (!next) return;
      setEditingDraft(null);
      const index = visibleMessagesOf(next).findIndex(
        message => message.piEntryIds?.[0] === row.node.id
      );
      if (index >= 0) {
        setTimeout(() => coreRef.current?.scrollToIndex(index, { align: "start" }), 0);
      }
    });

    useChatEntryLocation({
      sessionKey,
      entry,
      visible: isVisible,
      busy: sendLoading,
      messages: visibleMessages,
      findBranch: async target => {
        const chat = actualChatRef.current;
        if (!chat.sessionFile) return null;
        const result = await piSessionTree({
          sessionFile: chat.sessionFile,
          databaseName: chat.databaseName,
        });
        return result.ok ? conversationEntryTail(result.nodes ?? [], target) : null;
      },
      scrollTo: index => coreRef.current?.scrollToIndex(index, { align: "start" }),
      onElsewhere: reason =>
        reason === "other-branch"
          ? message.info("这条消息在对话的另一个分支，可在对话树里切换过去")
          : message.warning("原消息已不在这次对话里"),
      onLocated: onEntryLocated,
      onError: error => message.error(getErrorMessage(error)),
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
          {conversationTree.branchCount > 1 && (
            <div className={cn("flex flex-none justify-end pt-1.5", chatGutter)}>
              <Popover
                open={treeOpen}
                onOpenChange={setTreeOpen}
                placement="bottom-end"
                arrow={false}
                // 覆盖卡片默认的 max-w-[340px]：窄停靠栏里不超出视口
                className="w-[min(360px,calc(100vw-32px))] max-w-none p-1.5"
                trigger={
                  <button
                    type="button"
                    title="查看对话分支"
                    className="hover:bg-hover aria-expanded:bg-hover text-tau-sm text-ink-2 ease-tau-out flex h-7 items-center gap-1.5 rounded-[8px] px-2 transition-colors duration-[160ms]"
                  >
                    <GitBranch size={13} strokeWidth={1.75} />
                    <span className="tabular-nums">{conversationTree.branchCount} 条分支</span>
                  </button>
                }
              >
                <ConversationTreePanel
                  rows={conversationTree.rows}
                  branchCount={conversationTree.branchCount}
                  disabled={sendLoading}
                  onSelect={row => void handleTreeSelect(row)}
                />
              </Popover>
            </div>
          )}
          <ChatContainerCore
            ref={coreRef}
            isConnected={true}
            messages={coreMessages}
            isLoading={sendLoading}
            allowSendWhileLoading
            queuedMessageCount={queuedMessages.length}
            error={chatError}
            retryStatus={chatRetryStatus}
            forceScrollToBottomKey={
              sendLoading ? `${actualChatRef.current.id}:${coreMessages.length}` : undefined
            }
            hideInput={hideInput}
            thinkingLevel={chatModelConfig?.reasoning ? thinkingLevel : undefined}
            thinkingLevelOptions={thinkingLevelOptions}
            onThinkingLevelChange={
              chatModelConfig?.reasoning ? value => setStoredThinkingLevel(value) : undefined
            }
            thinkingLevelDisabled={!chatModelConfig?.reasoning}
            currentModelName={chatModelConfig?.name ?? chatModelConfig?.id}
            contextWindowK={
              chatModelConfig?.contextWindow ? chatModelConfig.contextWindow / 1000 : undefined
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
                    {pendingSteers.length > 0 ? (
                      <div className="mb-2 space-y-1.5" aria-label="插话消息">
                        <div className="text-tau-meta text-ink-3 px-1">
                          插话 · 当前步骤结束后送达
                        </div>
                        {pendingSteers.map(steer => (
                          <div
                            key={steer.id}
                            className="bg-warn-soft border-line-1 rounded-tau-md flex items-start gap-2 border px-3 py-2"
                          >
                            <CornerDownRight
                              size={13}
                              strokeWidth={1.75}
                              className="text-ink-3 mt-0.5 shrink-0"
                            />
                            <div className="text-tau-sm text-ink-1 min-w-0 flex-1 whitespace-pre-wrap break-words">
                              {queuedMessageText(steer.content) || "（附件消息）"}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {queuedMessages.length > 0 ? (
                      <div className="mb-2 space-y-1.5" aria-label="待发送消息">
                        <div className="text-tau-meta text-ink-3 px-1">
                          待发送 · {queuedMessages.length}
                          {queuePaused ? "（已暂停，发送或删除）" : ""}
                        </div>
                        {queuedMessages.map((content, index) => (
                          <div
                            key={`queued-${index}`}
                            className="bg-accent-soft border-line-1 rounded-tau-md flex items-start gap-2 border px-3 py-2"
                          >
                            <div className="text-tau-sm text-ink-1 min-w-0 flex-1 whitespace-pre-wrap break-words">
                              {queuedMessageText(content) || "（附件消息）"}
                            </div>
                            <div className="flex shrink-0 items-center gap-0.5">
                              {canSteerNow ? (
                                <button
                                  type="button"
                                  aria-label="插话：当前步骤结束后送达"
                                  title="插话：当前步骤结束后送达本轮"
                                  className="text-ink-3 hover:bg-hover rounded p-1"
                                  onClick={() => void steerQueuedMessage(index)}
                                >
                                  <CornerDownRight size={13} strokeWidth={1.75} />
                                </button>
                              ) : null}
                              <button
                                type="button"
                                aria-label="编辑待发送消息"
                                className="text-ink-3 hover:bg-hover rounded p-1"
                                onClick={() => editQueuedMessage(index)}
                              >
                                <Pencil size={13} strokeWidth={1.75} />
                              </button>
                              <button
                                type="button"
                                aria-label="删除待发送消息"
                                className="text-ink-3 hover:bg-hover rounded p-1"
                                onClick={() => removeQueuedMessage(index)}
                              >
                                <Trash2 size={13} strokeWidth={1.75} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {/* 附件区排在编辑横幅之前：横幅靠 -mb-2 贴住输入框，中间不能插别的 */}
                    {composerAccessory}
                    {editingDraft || hiddenPromptContext ? (
                      <div className="bg-accent-soft text-tau-sm -mb-2 flex items-center justify-between gap-3 rounded-t-[16px] px-3.5 pb-4 pt-2">
                        <div className="text-accent-text min-w-0">
                          <span className="font-semibold">
                            {editingDraft ? "正在编辑消息" : "正在编辑生成的图片"}
                          </span>
                          <span className="text-ink-2 ml-2">
                            {editingDraft
                              ? "发送后生成这条消息的新版本，原来的内容可以切回去"
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
                  {...(canSteerNow ? { onSteer: () => void steerFromInput() } : {})}
                />
              );
            }}
            renderMessage={({ messageIndex }) => {
              const item = visibleMessages[messageIndex];
              if (!item) return null;

              const streamingIndex = sendLoading ? visibleMessages.length - 1 : -1;
              const isStreaming =
                sendLoading && messageIndex === streamingIndex && item.role === Role.Assistant;
              // 分叉标记：这条回答之后分出了多条下一问（它前面那条用户消息是分叉点）
              const forkHere =
                item.role === Role.Assistant &&
                (() => {
                  for (let index = messageIndex - 1; index >= 0; index -= 1) {
                    const previous = visibleMessages[index];
                    if (previous.role === Role.User) {
                      const entryId = previous.piEntryIds?.[0];
                      return Boolean(entryId && conversationTree.forkPoints.has(entryId));
                    }
                  }
                  return false;
                })();

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
                    regenerateLabel={
                      canRetryChatMessage(visibleMessages, messageIndex) ? "重试" : "重新生成"
                    }
                    onEditMessage={
                      !hideInput &&
                      !sendLoading &&
                      item.role === Role.User &&
                      getRequestMessageText(item as RequestMessage).trim().length > 0
                        ? handleEditMessage
                        : undefined
                    }
                    onCreateBranch={handleCreateBranch}
                    {...(chatScope === "main-chat" && item.role === Role.User
                      ? { onToQuestion: handleToQuestion }
                      : {})}
                    {...(!sendLoading ? { onSwitchVersion: handleSwitchVersion } : {})}
                    messageMeta={{
                      chatId: actualChatRef.current.id,
                      messageIndex,
                      isStreaming,
                    }}
                  />
                  {forkHere && (
                    <button
                      type="button"
                      onClick={() => setTreeOpen(true)}
                      className="text-tau-tiny text-ink-3 hover:text-ink-1 ease-tau-out mt-2 flex w-full items-center gap-2 transition-colors duration-[160ms]"
                    >
                      <span aria-hidden className="bg-line-1 h-px flex-1" />
                      <GitBranch size={12} strokeWidth={1.75} aria-hidden />
                      <span>从这里分出了多条分支 · 查看</span>
                      <span aria-hidden className="bg-line-1 h-px flex-1" />
                    </button>
                  )}
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
