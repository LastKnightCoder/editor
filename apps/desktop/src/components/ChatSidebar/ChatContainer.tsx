import { useSidebarI18n } from "@/components/ChatSidebar/sidebar.i18n";
import { sidebarNumber } from "@/components/ChatSidebar/sidebar.binding";
import React, {
  useRef,
  useMemo,
  memo,
  useEffect,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import type { ElementType } from "react";
import { useMemoizedFn } from "ahooks";
import { useDrop } from "react-dnd";
import { CornerDownRight, GitBranch, Pencil, RotateCw, Trash2, TriangleAlert } from "lucide-react";

import ChatInputArea from "@/components/ChatInputArea";
import type { ChatInputAreaHandle } from "@/components/ChatInputArea";

import MessageItem from "./MessageItem";

import { ChatMessage, RequestMessage, ResponseMessage } from "@/types";
import type { ChatSessionScope } from "@/types/chat-session";
import { Role } from "@/constants";
import { remoteResourceToLocal } from "@/utils/resouce";
import { buildPiPromptPayload } from "@/services/piPromptPayload";
import { piSessionTree } from "@/commands/piSession";
import { useChatEntryLocation } from "./useChatEntryLocation";
import {
  COMPOSER_ANCHOR_ATTR,
  type ChatMessageType as CoreChatMessageType,
  type MentionRef,
  type MessageContentItem,
} from "@tau/shared";
import { ChatContainerCore, type ChatContainerCoreHandle } from "@tau/chat-ui";
import { ToolRendererInteractionProvider } from "@/tool-call-renderers/ToolRendererInteractionContext";
import {
  SubagentDetailLayer,
  SubagentHub,
} from "@/features/chat/components/subagents/SubagentPanel";
import { dispatchedAgentId } from "@/features/chat/components/subagents/dispatch";
import { useSubagentItems } from "@/features/chat/components/subagents/useSubagentItems";
import { SubagentParentContext } from "@/features/chat/components/subagents/parentContext";
import type { SubagentParentRef } from "@/types/subagent";
import { getChatDatabase } from "@/services/chatDatabase";
import { getAssistantContentBlocks } from "@/services/assistantMessageBlocks";
import { latestContextUsage } from "@/services/chatContextUsage";
import { canRetryChatMessage } from "@/services/chatRetry";
import { getRequestMessageText } from "./editingUtils";
import {
  CHAT_CONTENT_DND_TYPE,
  SIDEBAR_ITEM_DND_TYPE,
  getChatContentDragReference,
} from "@/utils/chat-content-dnd";
import { SidebarError, sidebarErrorText } from "./sidebar-errors";
import { useConversationTree } from "@/features/chat/useConversationTree";
import { ConversationTreePanel } from "@/features/chat/components/ConversationTreePanel";
import { conversationEntryTail } from "@/features/chat/conversationTree";
import { FADE_SCROLL_CLASS, Popover, cn, toast } from "@tau/ui";
import type { EditTextHandle } from "@tau/ui";
import { useChatModelConfig } from "./hooks/useChatModelConfig";
import { useChatRuntime } from "./hooks/useChatRuntime";
import { useChatEditingState } from "./hooks/useChatEditingState";
import { useChatScrolling } from "./hooks/useChatScrolling";
import { useChatHistoryEditing } from "./hooks/useChatHistoryEditing";
import { useChatSending } from "./hooks/useChatSending";
import { useChatQueue } from "./hooks/useChatQueue";
import { useChatSteering } from "./hooks/useChatSteering";
import { useChatMessageActions } from "./hooks/useChatMessageActions";
import { visibleMessagesOf } from "./chatContainerUtils";

/** 插件能看到的对话场景（与主进程 plugin-data-readonly 的 CHAT_SCENES 一致），消息上列插件对象动作 */
const PLUGIN_CHAT_SCOPES: ReadonlySet<string> = new Set<ChatSessionScope>([
  "main-chat",
  "pdf-chat",
  "video-note-chat",
  "vibe-learning-chat",
]);

interface ChatContainerProps {
  entry?: string;
  entryRequestId?: number;
  transcriptReady?: boolean;
  onEntryLocated?: () => void;
  /** 当前对话（统一会话 store 里已打开的对话；新对话是草稿：真 id、尚无 sessionFile） */
  currentChat: ChatMessage;
  isDark: boolean;
  /** 标签名 → 组件的映射（含插件注入的条目），最终展开进 ReactMarkdown components */
  markdownComponents: Record<string, ElementType>;
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
      entryRequestId,
      transcriptReady = true,
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
    const { t } = useSidebarI18n();
    const message = toast;

    const {
      chatProviderConfig,
      chatModelConfig,
      skills,
      supportImage,
      thinkingLevel,
      thinkingLevelOptions,
      setStoredThinkingLevel,
      modelGroups,
      currentModelKey,
      handleModelSelect,
    } = useChatModelConfig();

    const {
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
    } = useChatRuntime({
      chatScope,
      currentChat,
      chatProviderConfig,
      chatModelConfig,
      titleRef,
      setExternalSendLoading,
      isVisible,
    });

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

    const visibleMessages = useMemo(
      () => visibleMessagesOf(actualChatRef.current),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [actualChatRef, updateCounter]
    );

    const [treeOpen, setTreeOpen] = useState(false);

    const lastVisibleMessageRole =
      visibleMessages.length > 0 ? visibleMessages[visibleMessages.length - 1]?.role : undefined;

    const { editingDraft, setEditingDraft, hiddenPromptContext, setHiddenPromptContext } =
      useChatEditingState({ hideInput, visibleMessages });

    const {
      setMessagesContainer,
      scrollToBottom,
      enableAutoScroll,
      setAutoScrollEnabled,
      forceScrollToBottomSoon,
      getVisibleMessageId,
    } = useChatScrolling({
      messagesRef,
      coreRef,
      entry,
      chatScope,
      currentChat,
      preserveScrollPosition,
      scrollPositionScope,
      actualChatRef,
      visibleMessages,
      sendLoading,
      lastVisibleMessageRole,
      hasRestoredScrollPositionRef,
      isRestoringScrollPositionRef,
    });

    const { editSessionHistory } = useChatHistoryEditing({ actualChatRef, setUpdateCounter });

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
     * pi 会话事件归约与收尾已下沉到模块级 services/piChatRuntime（后台运行）：
     * 组件只负责发送编排（ensure 会话 + prompt）与 UI 展示，事件 → 聊天行的写入
     * 经 runtime 的常驻 reducer（单一事实源容器 + store 发布），卸载/切页不中断。
     */
    const { processMessageSending, sendMessageContent, submitMessageContent, stopStreaming } =
      useChatSending({
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
      });

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

    const {
      queuedMessages,
      pendingSteers,
      queuePaused,
      canSteerNow,
      queuedMessageText,
      editQueuedMessage,
      removeQueuedMessage,
    } = useChatQueue({
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
    });

    const { steerFromInput, steerQueuedMessage } = useChatSteering({
      chatScope,
      actualChatRef,
      conversationKeyRef,
      editingDraft,
      hiddenPromptContext,
      buildPromptPayload,
      editTextRef,
    });

    const {
      handleDeleteMessage,
      handleRegenerateMessage,
      handleEditMessage,
      getChatRefAt,
      handleCreateBranch,
      handleSwitchVersion,
      handleTreeSelect,
    } = useChatMessageActions({
      sendLoading,
      hideInput,
      actualChatRef,
      visibleMessages,
      editSessionHistory,
      processMessageSending,
      setEditingDraft,
      editTextRef,
      setTreeOpen,
      coreRef,
    });

    // 树谱：分叉点在对话流里标出来，全貌在「N 条分支」浮层里
    const conversationTree = useConversationTree({
      id: actualChatRef.current.id,
      sessionFile: actualChatRef.current.sessionFile,
      messages: visibleMessages,
    });
    // 按 entry 定位到的那条消息短暂铺底，读者能看出落在哪一轮
    const [locatedIndex, setLocatedIndex] = useState<number | null>(null);
    useEffect(() => {
      if (locatedIndex === null) return;
      const timer = window.setTimeout(() => setLocatedIndex(null), 1400);
      return () => window.clearTimeout(timer);
    }, [locatedIndex]);

    const compaction = actualChatRef.current.compaction;
    const modelCompaction =
      compaction &&
      (!compaction.providerId || compaction.providerId === chatProviderConfig?.id) &&
      (!compaction.modelId || compaction.modelId === chatModelConfig?.id)
        ? compaction
        : undefined;
    const contextUsage = useMemo(() => {
      return latestContextUsage(
        actualChatRef.current.messages,
        chatProviderConfig?.id,
        chatModelConfig ?? undefined
      );
    }, [actualChatRef, chatModelConfig, chatProviderConfig?.id, updateCounter]);

    const subagentParent = useMemo<SubagentParentRef>(
      () => ({
        scope: sessionKey,
        databaseName: currentChat.databaseName ?? getChatDatabase(),
        chatId: currentChat.id,
      }),
      [sessionKey, currentChat.databaseName, currentChat.id]
    );
    const hasSubagents = useSubagentItems(subagentParent).items.length > 0;
    const locateSubagentDispatch = useMemoizedFn((agentId: string) => {
      const index = visibleMessages.findIndex(
        message =>
          message.role === Role.Assistant &&
          getAssistantContentBlocks(message as ResponseMessage).some(
            block =>
              block.type === "tool_calls" &&
              block.executions.some(execution => dispatchedAgentId(execution) === agentId)
          )
      );
      if (index >= 0) coreRef.current?.scrollToIndex(index, { align: "start" });
    });

    useChatEntryLocation({
      sessionKey,
      entry,
      requestId: entryRequestId,
      ready: transcriptReady && actualChatRef.current === currentChat,
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
        if (!result.ok)
          throw result.error
            ? new Error(result.error)
            : new SidebarError("error.tree", "读取对话分支失败");
        return conversationEntryTail(result.nodes ?? [], target);
      },
      scrollTo: index => {
        setAutoScrollEnabled(false);
        coreRef.current?.scrollToIndex(index, { align: "start" });
        setLocatedIndex(index);
      },
      onElsewhere: reason =>
        reason === "other-branch"
          ? message.info(t("branch.elsewhere"))
          : message.warning(t("branch.missing")),
      onLocated: onEntryLocated,
      onError: error => message.error(sidebarErrorText(error)),
    });

    if (!currentChat) {
      return null;
    }

    const supportFile = true;

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
      <SubagentParentContext.Provider value={subagentParent}>
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
              "ease-tau-out rounded-tau-lg relative flex h-full min-h-0 flex-col transition-[background,box-shadow] duration-[160ms] motion-reduce:transition-none",
              // 拖入卡片 / 文章：accent 轻染整块，提示可放下
              isChatContentDragOver &&
                canDropChatContent &&
                "bg-accent-soft shadow-[inset_0_0_0_2px_var(--tau-accent)]"
            )}
          >
            {(conversationTree.branchCount > 1 || hasSubagents) && (
              <div
                className={cn("flex flex-none items-center justify-end gap-1.5 pt-1.5", chatGutter)}
              >
                <SubagentHub
                  parent={subagentParent}
                  compact={compact}
                  onLocate={locateSubagentDispatch}
                />
                {conversationTree.branchCount > 1 && (
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
                        title={t("branch.view")}
                        className="hover:bg-hover aria-expanded:bg-hover text-tau-sm text-ink-2 ease-tau-out flex h-7 items-center gap-1.5 rounded-[8px] px-2 transition-colors duration-[160ms]"
                      >
                        <GitBranch size={13} strokeWidth={1.75} />
                        <span className="tabular-nums">
                          {t("branch.count", {
                            count: conversationTree.branchCount,
                            number: sidebarNumber(conversationTree.branchCount),
                          })}
                        </span>
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
                )}
              </div>
            )}
            <ChatContainerCore
              ref={coreRef}
              isConnected={true}
              messages={coreMessages}
              isLoading={sendLoading}
              allowSendWhileLoading
              queuedMessageCount={queuedMessages.length}
              error={chatError instanceof SidebarError ? sidebarErrorText(chatError) : chatError}
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
                              {t("status.retry", {
                                attempt: sidebarNumber(retryStatus.attempt),
                                max: sidebarNumber(retryStatus.maxRetries),
                              })}
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
                        <div className="mb-2 space-y-1.5" aria-label={t("steer.label")}>
                          <div className="text-tau-meta text-ink-3 px-1">{t("steer.status")}</div>
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
                              <div className="text-tau-sm text-ink-1 min-w-0 flex-1 break-words whitespace-pre-wrap">
                                {queuedMessageText(steer.content) || t("queue.attachment")}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {queuedMessages.length > 0 ? (
                        <div className="mb-2 space-y-1.5" aria-label={t("queue.label")}>
                          <div className="text-tau-meta text-ink-3 px-1">
                            {t("queue.status", { count: sidebarNumber(queuedMessages.length) })}
                            {queuePaused ? t("queue.paused") : ""}
                          </div>
                          {queuedMessages.map((content, index) => (
                            <div
                              key={`queued-${index}`}
                              className="bg-accent-soft border-line-1 rounded-tau-md flex items-start gap-2 border px-3 py-2"
                            >
                              <div className="text-tau-sm text-ink-1 min-w-0 flex-1 break-words whitespace-pre-wrap">
                                {queuedMessageText(content) || t("queue.attachment")}
                              </div>
                              <div className="flex shrink-0 items-center gap-0.5">
                                {canSteerNow ? (
                                  <button
                                    type="button"
                                    aria-label={t("steer.action")}
                                    title={t("steer.hint")}
                                    className="text-ink-3 hover:bg-hover rounded p-1"
                                    onClick={() => void steerQueuedMessage(index)}
                                  >
                                    <CornerDownRight size={13} strokeWidth={1.75} />
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  aria-label={t("queue.edit")}
                                  className="text-ink-3 hover:bg-hover rounded p-1"
                                  onClick={() => editQueuedMessage(index)}
                                >
                                  <Pencil size={13} strokeWidth={1.75} />
                                </button>
                                <button
                                  type="button"
                                  aria-label={t("queue.delete")}
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
                        <div className="bg-accent-soft text-tau-sm -mb-2 flex items-center justify-between gap-3 rounded-t-[16px] px-3.5 pt-2 pb-4">
                          <div className="text-accent-text min-w-0">
                            <span className="font-semibold">
                              {editingDraft ? t("edit.message") : t("edit.image")}
                            </span>
                            <span className="text-ink-2 ml-2">
                              {editingDraft ? t("edit.messageHint") : t("edit.imageHint")}
                            </span>
                          </div>
                          <button
                            type="button"
                            className="text-accent-text hover:bg-accent/15 shrink-0 rounded-[7px] px-2 py-0.5"
                            onClick={() =>
                              editingDraft ? setEditingDraft(null) : setHiddenPromptContext(null)
                            }
                          >
                            {editingDraft ? t("edit.cancel") : t("edit.exit")}
                          </button>
                        </div>
                      ) : null}
                      {/* 输入框外框：＋ / @ 面板按它的矩形定位（同宽、贴上沿） */}
                      <div
                        {...{ [COMPOSER_ANCHOR_ATTR]: "" }}
                        className="border-line-1 bg-surface ease-tau-out focus-within:border-accent relative rounded-[16px] border pt-3 pr-2.5 pb-2.5 pl-3.5 transition-[border-color,box-shadow] duration-[160ms] focus-within:shadow-[var(--tau-focus-ring)]"
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
                    compaction={modelCompaction}
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
                    className={cn(
                      "rounded-tau-md ease-tau-out -mx-2 px-2 pb-2 transition-colors duration-700",
                      messageIndex === 0 ? (compact ? "pt-3" : "pt-6") : "pt-2",
                      (locatedIndex === messageIndex || locatedIndex === messageIndex - 1) &&
                        "bg-accent-soft"
                    )}
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
                        canRetryChatMessage(visibleMessages, messageIndex)
                          ? t("action.retry")
                          : t("action.regenerate")
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
                      {...(PLUGIN_CHAT_SCOPES.has(chatScope)
                        ? { pluginSessionId: actualChatRef.current.id }
                        : {})}
                      {...(chatScope === "main-chat" && actualChatRef.current.sessionFile
                        ? { getChatRef: getChatRefAt }
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
                        <span>{t("branch.forkHint")}</span>
                        <span aria-hidden className="bg-line-1 h-px flex-1" />
                      </button>
                    )}
                  </div>
                );
              }}
            />
            <SubagentDetailLayer parent={subagentParent} compact={compact} isDark={isDark} />
          </div>
        </ToolRendererInteractionProvider>
      </SubagentParentContext.Provider>
    );
  }
);

ChatContainer.displayName = "ChatContainer";

export default memo(ChatContainer);
