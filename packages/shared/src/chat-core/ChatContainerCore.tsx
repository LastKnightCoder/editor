import {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
  useImperativeHandle,
  memo,
  forwardRef,
  type ReactNode,
  type MutableRefObject,
  type Ref,
  type RefObject,
} from "react";
import { Tooltip } from "antd";
import type { MenuProps } from "antd";
import { Trash2, AlertTriangle, LoaderCircle, Unplug } from "lucide-react";
import classNames from "classnames";
import { useVirtualizer, type VirtualItem, type Virtualizer } from "@tanstack/react-virtual";
import ChatInputArea, {
  type ChatInputAreaProps,
  type ChatInputAreaHandle,
  type ChatInputAreaServices,
  type MessageContentItem,
  type ThinkingLevel,
  type ChatContextUsage,
} from "../components/ChatInputArea";
import { ChatMessage, type ChatMessageType } from "../components/ChatComponents";
import {
  DEFAULT_CHAT_INPUT_PLACEHOLDER,
  resolveChatInputPlaceholder,
} from "../utils/chat-input-placeholder";

const ITEM_GAP = 16;

interface VirtualMessageItemProps {
  virtualItem: VirtualItem;
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  messageId: string | number;
  isLast: boolean;
  onResize?: () => void;
  children: ReactNode;
}

/**
 * 虚拟消息项包装器。
 * 负责绝对定位、ResizeObserver 监听内容高度变化，并同步给 virtualizer。
 */
const VirtualMessageItem = memo(function VirtualMessageItem({
  virtualItem,
  virtualizer,
  messageId,
  isLast,
  onResize,
  children,
}: VirtualMessageItemProps) {
  const itemRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = itemRef.current;
    if (!element) return;

    virtualizer.measureElement(element);
    onResize?.();

    const resizeObserver = new ResizeObserver(() => {
      virtualizer.measureElement(element);
      onResize?.();
    });
    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
    };
  }, [onResize, virtualItem.key, virtualizer]);

  return (
    <div
      ref={itemRef}
      data-index={virtualItem.index}
      data-message-id={messageId}
      data-virtual-message-item="true"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        transform: `translateY(${virtualItem.start}px)`,
        paddingBottom: isLast ? 0 : ITEM_GAP,
        boxSizing: "border-box",
      }}
    >
      {children}
    </div>
  );
});

export interface ChatContainerCoreMessageRendererParams {
  message: ChatMessageType;
  messageIndex: number;
}

export interface ChatContainerCoreInputRendererParams {
  chatInputRef: RefObject<ChatInputAreaHandle | null>;
  inputProps: Omit<ChatInputAreaProps, "services"> & {
    services?: ChatInputAreaServices;
  };
}

export interface ChatContainerCoreEmptyStateRenderParams {
  currentPageUrl?: string | null;
  isDark: boolean;
}

export interface ChatContainerCoreHandle {
  scrollToBottom: (options?: { behavior?: "auto" | "smooth" }) => void;
  scrollToOffset: (offset: number, options?: { behavior?: "auto" | "smooth" }) => void;
  scrollToItemOffset: (
    index: number,
    offset: number,
    options?: { behavior?: "auto" | "smooth" }
  ) => void;
  scrollToIndex: (
    index: number,
    options?: {
      align?: "start" | "center" | "end";
      behavior?: "auto" | "smooth";
    }
  ) => void;
}

export interface ChatContainerCoreProps {
  isDark?: boolean;
  isConnected: boolean;
  messages: ChatMessageType[];
  isLoading: boolean;
  error?: string | null;
  retryStatus?: { attempt: number; maxRetries: number } | null;
  thinkingLevel?: ThinkingLevel;
  thinkingLevelOptions?: readonly ThinkingLevel[];
  thinkingLevelDisabled?: boolean;
  currentModelName?: string;
  contextWindowK?: number;
  contextUsage?: ChatContextUsage | null;
  isSupportImage?: boolean;
  isSupportFile?: boolean;
  placeholder?: string;
  showConnectingDelayMs?: number;
  currentPageUrl?: string | null;
  hideInput?: boolean;
  className?: string;
  forceScrollToBottomKey?: string | number;
  messagesContainerClassName?: string;
  inputWrapperClassName?: string;
  chatInputClassName?: string;
  chatHeader?: ReactNode;
  extraToolbarButtons?: ReactNode;
  modelSelectItems?: MenuProps["items"];
  createMessageLoading?: boolean;
  allowSendWhileLoading?: boolean;
  queuedMessageCount?: number;
  onCreateNewMessage?: () => void;
  onMcpManagerClick?: () => void;
  onThinkingLevelChange?: (value: ThinkingLevel) => void;
  onModelSelect?: (info: { key: string }) => void;
  onSendTextMessage?: (content: string) => void | Promise<void>;
  onSendMessageContent?: (content: MessageContentItem[]) => void | Promise<void>;
  onUserSend?: () => void;
  onStopGeneration?: () => void;
  onClearMessages?: () => void;
  onDeleteMessage?: (messageIndex: number) => void;
  onRegenerateMessage?: (messageIndex: number) => void;
  onCreateBranch?: (messageIndex: number) => void;
  onCopySuccess?: () => void;
  onCopyError?: () => void;
  onDeleteConfirm?: () => Promise<boolean>;
  chatInputServices?: ChatInputAreaServices;
  inputRef?: RefObject<ChatInputAreaHandle | null>;
  messagesContainerRef?: Ref<HTMLDivElement>;
  renderMessage?: (params: ChatContainerCoreMessageRendererParams) => ReactNode;
  renderEmptyState?: (params: ChatContainerCoreEmptyStateRenderParams) => ReactNode;
  renderInputWrapper?: (inputNode: ReactNode) => ReactNode;
  /** 覆盖默认的重试 / 错误提示条（宿主自定义外观；返回 null 即不显示） */
  renderStatusBanner?: (params: {
    retryStatus?: { attempt: number; maxRetries: number } | null;
    error?: string | null;
  }) => ReactNode;
  renderChatInputArea?: (params: ChatContainerCoreInputRendererParams) => ReactNode;
}

const extractTextContent = (messageContent: MessageContentItem[]): string =>
  messageContent
    .filter(item => item.type === "text")
    .map(item => (item as { type: "text"; text: string }).text)
    .join("\n");

export const ChatContainerCore = forwardRef<ChatContainerCoreHandle, ChatContainerCoreProps>(
  function ChatContainerCore(
    {
      isDark = false,
      isConnected,
      messages,
      isLoading,
      error = null,
      retryStatus = null,
      thinkingLevel,
      thinkingLevelOptions,
      thinkingLevelDisabled = false,
      currentModelName = "未选择模型",
      contextWindowK,
      contextUsage,
      isSupportImage = false,
      isSupportFile = false,
      placeholder = DEFAULT_CHAT_INPUT_PLACEHOLDER,
      showConnectingDelayMs = 800,
      currentPageUrl,
      hideInput = false,
      className,
      forceScrollToBottomKey,
      messagesContainerClassName,
      inputWrapperClassName,
      chatInputClassName,
      chatHeader,
      extraToolbarButtons,
      modelSelectItems = [],
      createMessageLoading = false,
      allowSendWhileLoading = false,
      queuedMessageCount = 0,
      onCreateNewMessage,
      onMcpManagerClick,
      onThinkingLevelChange,
      onModelSelect,
      onSendTextMessage,
      onSendMessageContent,
      onUserSend,
      onStopGeneration,
      onClearMessages,
      onDeleteMessage,
      onRegenerateMessage,
      onCreateBranch,
      onCopySuccess,
      onCopyError,
      onDeleteConfirm,
      chatInputServices,
      inputRef,
      messagesContainerRef,
      renderMessage,
      renderEmptyState,
      renderInputWrapper,
      renderStatusBanner,
      renderChatInputArea,
    }: ChatContainerCoreProps,
    ref
  ) {
    const [showConnectingUI, setShowConnectingUI] = useState(false);
    const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);
    const [scrollPadding, setScrollPadding] = useState({ top: 0, bottom: 0 });
    const internalChatInputRef = useRef<ChatInputAreaHandle>(null);
    const stickToBottomUntilRef = useRef(0);
    const lastScrollTopRef = useRef(0);
    const lastForceScrollToBottomKeyRef = useRef<string | number | undefined>(undefined);
    const resolvedChatInputRef = inputRef || internalChatInputRef;
    const resolvedPlaceholder = useMemo(
      () => resolveChatInputPlaceholder(placeholder),
      [placeholder]
    );

    useEffect(() => {
      if (!scrollElement) {
        setScrollPadding({ top: 0, bottom: 0 });
        return;
      }
      const style = getComputedStyle(scrollElement);
      setScrollPadding({
        top: (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.paddingTop) || 0),
        bottom: (parseFloat(style.borderBottomWidth) || 0) + (parseFloat(style.paddingBottom) || 0),
      });
    }, [scrollElement]);

    const setScrollElementAndForwardRef = useCallback(
      (node: HTMLDivElement | null) => {
        setScrollElement(node);
        if (typeof messagesContainerRef === "function") {
          (messagesContainerRef as (instance: HTMLDivElement | null) => void)(node);
        } else if (messagesContainerRef) {
          (messagesContainerRef as MutableRefObject<HTMLDivElement | null>).current = node;
        }
      },
      [messagesContainerRef]
    );

    const virtualizer = useVirtualizer({
      count: messages.length,
      getScrollElement: useCallback(() => scrollElement, [scrollElement]),
      estimateSize: useCallback(() => 160, []),
      overscan: 5,
      getItemKey: useCallback((index: number) => messages[index]?.id ?? index, [messages]),
      measureElement: useCallback((element: Element) => element.getBoundingClientRect().height, []),
      scrollPaddingStart: scrollPadding.top,
      scrollPaddingEnd: scrollPadding.bottom,
    });

    useEffect(() => {
      virtualizer.shouldAdjustScrollPositionOnItemSizeChange = item => {
        if (Date.now() < stickToBottomUntilRef.current) {
          return false;
        }
        const scrollOffset = virtualizer.scrollOffset ?? scrollElement?.scrollTop;
        return typeof scrollOffset === "number" && item.end <= scrollOffset;
      };
    }, [scrollElement, virtualizer]);

    const virtualItems = virtualizer.getVirtualItems();
    const totalSize = virtualizer.getTotalSize();

    const scrollToBottom = useCallback(
      (options?: { behavior?: "auto" | "smooth" }) => {
        const lastIndex = messages.length - 1;
        if (lastIndex < 0) return;

        const behavior = options?.behavior ?? "auto";
        stickToBottomUntilRef.current = Date.now() + 2000;
        const scroll = () => {
          const viewportHeight = scrollElement?.clientHeight || virtualizer.scrollRect?.height || 0;
          const verticalScrollPadding = scrollPadding.top + scrollPadding.bottom;
          const bottomOffset = Math.max(
            0,
            virtualizer.getTotalSize() + verticalScrollPadding - viewportHeight
          );
          virtualizer.scrollToOffset(bottomOffset, { behavior });
        };

        scroll();
        requestAnimationFrame(() => {
          scroll();
          requestAnimationFrame(scroll);
        });
      },
      [messages.length, scrollElement, scrollPadding, virtualizer]
    );

    const scrollToBottomIfSticky = useCallback(() => {
      if (Date.now() >= stickToBottomUntilRef.current) {
        return;
      }
      scrollToBottom();
    }, [scrollToBottom]);

    const cancelStickToBottom = useCallback(() => {
      stickToBottomUntilRef.current = 0;
    }, []);

    useEffect(() => {
      const element = scrollElement;
      if (!element) {
        return;
      }

      lastScrollTopRef.current = element.scrollTop;

      const handleWheel = (event: WheelEvent) => {
        if (event.deltaY < 0) {
          cancelStickToBottom();
        }
      };

      const handlePointerDown = () => {
        cancelStickToBottom();
      };

      const handleTouchMove = () => {
        cancelStickToBottom();
      };

      const handleScroll = () => {
        const previousScrollTop = lastScrollTopRef.current;
        lastScrollTopRef.current = element.scrollTop;
        if (Date.now() < stickToBottomUntilRef.current && element.scrollTop < previousScrollTop) {
          cancelStickToBottom();
        }
      };

      element.addEventListener("wheel", handleWheel, { passive: true });
      element.addEventListener("pointerdown", handlePointerDown);
      element.addEventListener("touchmove", handleTouchMove, { passive: true });
      element.addEventListener("scroll", handleScroll, { passive: true });

      return () => {
        element.removeEventListener("wheel", handleWheel);
        element.removeEventListener("pointerdown", handlePointerDown);
        element.removeEventListener("touchmove", handleTouchMove);
        element.removeEventListener("scroll", handleScroll);
      };
    }, [cancelStickToBottom, scrollElement]);

    useLayoutEffect(() => {
      scrollToBottomIfSticky();
    }, [messages.length, scrollToBottomIfSticky, totalSize]);

    useLayoutEffect(() => {
      if (
        forceScrollToBottomKey === undefined ||
        lastForceScrollToBottomKeyRef.current === forceScrollToBottomKey
      ) {
        return;
      }

      lastForceScrollToBottomKeyRef.current = forceScrollToBottomKey;
      stickToBottomUntilRef.current = Date.now() + 2000;
      scrollToBottom();
    }, [forceScrollToBottomKey, scrollToBottom]);

    useImperativeHandle(
      ref,
      () => ({
        scrollToBottom,
        scrollToOffset: (offset, options) => {
          virtualizer.scrollToOffset(offset, {
            behavior: options?.behavior ?? "auto",
          });
        },
        scrollToItemOffset: (index, offset, options) => {
          const target = virtualizer.getOffsetForIndex(index, "start");
          if (!target) {
            return;
          }
          virtualizer.scrollToOffset(target[0] + offset, {
            behavior: options?.behavior ?? "auto",
          });
        },
        scrollToIndex: (index, options) => {
          virtualizer.scrollToIndex(index, {
            align: options?.align ?? "start",
            behavior: options?.behavior ?? "auto",
          });
        },
      }),
      [scrollToBottom, virtualizer]
    );

    useEffect(() => {
      if (!isConnected) {
        const timer = setTimeout(() => setShowConnectingUI(true), showConnectingDelayMs);
        return () => clearTimeout(timer);
      }
      setShowConnectingUI(false);
    }, [isConnected, showConnectingDelayMs]);

    const hasNonTextContent = useCallback(
      (messageContent: MessageContentItem[]) =>
        messageContent.some(item => item.type === "image" || item.type === "file"),
      []
    );

    const handleSend = useCallback(() => {
      if (isLoading && !allowSendWhileLoading) return;
      const messageContent = resolvedChatInputRef.current?.getValue() || [];
      const textContent = extractTextContent(messageContent);
      const hasAttachment = hasNonTextContent(messageContent);

      if (!textContent.trim() && !hasAttachment) return;

      onUserSend?.();

      if (onSendMessageContent) {
        void Promise.resolve(onSendMessageContent(messageContent));
      } else if (onSendTextMessage && textContent.trim()) {
        void Promise.resolve(onSendTextMessage(textContent));
      } else {
        return;
      }

      resolvedChatInputRef.current?.clear();
    }, [
      allowSendWhileLoading,
      hasNonTextContent,
      isLoading,
      onUserSend,
      onSendMessageContent,
      onSendTextMessage,
      resolvedChatInputRef,
    ]);

    const defaultToolbarButton = useMemo(() => {
      if (!onClearMessages || messages.length === 0 || isLoading) {
        return null;
      }
      return (
        <Tooltip title="清空对话">
          <button
            type="button"
            onClick={onClearMessages}
            className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-zinc-800"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </Tooltip>
      );
    }, [isLoading, messages.length, onClearMessages]);

    const toolbarButtons = extraToolbarButtons ?? defaultToolbarButton ?? undefined;
    const inputProps: Omit<ChatInputAreaProps, "services"> & {
      services?: ChatInputAreaServices;
    } = {
      className: chatInputClassName,
      placeholder: resolvedPlaceholder,
      contentEditable: !isLoading || allowSendWhileLoading,
      sendLoading: isLoading,
      allowSendWhileLoading,
      queuedMessageCount,
      createMessageLoading,
      onCreateNewMessage,
      onPressEnter: handleSend,
      onStop: onStopGeneration,
      modelSelectItems,
      onModelSelect,
      currentModelName,
      contextWindowK,
      contextUsage,
      isSupportImage,
      isSupportFile,
      thinkingLevel,
      thinkingLevelOptions,
      onThinkingLevelChange,
      thinkingLevelDisabled,
      onMcpManagerClick,
      extraToolbarButtons: toolbarButtons,
    };

    const chatInputNode = renderChatInputArea ? (
      renderChatInputArea({
        chatInputRef: resolvedChatInputRef,
        inputProps,
      })
    ) : chatInputServices ? (
      <ChatInputArea ref={resolvedChatInputRef} services={chatInputServices} {...inputProps} />
    ) : null;

    if (!isConnected) {
      if (!showConnectingUI) return null;
      return (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-yellow-500/10">
            <Unplug className="h-6 w-6 text-yellow-500" />
          </div>
          <h3 className="mb-1 text-sm font-medium text-gray-900 dark:text-[#e6edf3]">
            正在连接 AI 服务...
          </h3>
          <p className="text-center text-xs text-gray-400 dark:text-[#484f58]">
            请确保桌面端已启动
          </p>
        </div>
      );
    }

    return (
      <div className={classNames("flex h-full flex-1 flex-col overflow-hidden", className)}>
        {chatHeader ? (
          <div
            className={classNames(
              "shrink-0 border-b p-3",
              isDark ? "border-gray-800 bg-zinc-900/50" : "border-gray-200 bg-white"
            )}
          >
            {chatHeader}
          </div>
        ) : null}

        <div
          ref={setScrollElementAndForwardRef}
          className={messagesContainerClassName || "flex-1 overflow-y-auto p-4"}
        >
          {messages.length === 0 ? (
            renderEmptyState ? (
              renderEmptyState({
                currentPageUrl,
                isDark,
              })
            ) : (
              <div className="flex flex-col items-center px-6 pt-12">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/10">
                  <svg
                    className="h-6 w-6 text-blue-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z"
                    />
                  </svg>
                </div>
                <h3 className="mb-2 text-sm font-medium text-gray-900 dark:text-[#e6edf3]">
                  开始对话
                </h3>
                <p className="text-center text-xs text-gray-400 dark:text-[#484f58]">
                  与 AI 探讨当前网页内容
                </p>
                {currentPageUrl ? (
                  <p className="mt-4 max-w-full truncate px-4 text-xs text-gray-400 dark:text-[#484f58]">
                    当前页面: {currentPageUrl}
                  </p>
                ) : null}
              </div>
            )
          ) : (
            <div
              style={{
                height: totalSize,
                width: "100%",
                position: "relative",
              }}
            >
              {virtualItems.map(virtualItem => {
                const message = messages[virtualItem.index];
                const isLast = virtualItem.index === messages.length - 1;
                return (
                  <VirtualMessageItem
                    key={virtualItem.key}
                    virtualItem={virtualItem}
                    virtualizer={virtualizer}
                    messageId={message.id}
                    isLast={isLast}
                    onResize={isLast ? scrollToBottomIfSticky : undefined}
                  >
                    {renderMessage ? (
                      renderMessage({
                        message,
                        messageIndex: virtualItem.index,
                      })
                    ) : (
                      <ChatMessage
                        message={message}
                        messageIndex={virtualItem.index}
                        isDark={isDark}
                        onDeleteMessage={onDeleteMessage}
                        onRegenerateMessage={onRegenerateMessage}
                        onCreateBranch={onCreateBranch}
                        onCopySuccess={onCopySuccess}
                        onCopyError={onCopyError}
                        onDeleteConfirm={onDeleteConfirm}
                      />
                    )}
                  </VirtualMessageItem>
                );
              })}
            </div>
          )}
        </div>

        {renderStatusBanner ? (
          renderStatusBanner({ retryStatus, error })
        ) : retryStatus ? (
          <div className="border-t border-yellow-500/20 bg-yellow-500/10 px-4 py-2">
            <div className="flex items-center gap-2 text-xs text-yellow-600 dark:text-yellow-400">
              <LoaderCircle className="h-3.5 w-3.5 shrink-0 animate-spin" />
              <span>
                请求失败，正在重试（第 {retryStatus.attempt}/{retryStatus.maxRetries} 次）...
              </span>
            </div>
          </div>
        ) : error ? (
          <div className="border-t border-red-500/20 bg-red-500/10 px-4 py-2">
            <div className="flex items-center gap-2 text-xs text-red-500">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          </div>
        ) : null}

        {!hideInput && chatInputNode ? (
          renderInputWrapper ? (
            renderInputWrapper(chatInputNode)
          ) : (
            <div
              className={classNames(
                "mx-3 mb-3 mt-2 box-border shrink-0 rounded-3xl border px-3 py-3 shadow-sm",
                isDark ? "border-gray-800 bg-zinc-950" : "border-gray-200 bg-white",
                inputWrapperClassName
              )}
            >
              {chatInputNode}
            </div>
          )
        ) : null}
      </div>
    );
  }
);

ChatContainerCore.displayName = "ChatContainerCore";

export default ChatContainerCore;
