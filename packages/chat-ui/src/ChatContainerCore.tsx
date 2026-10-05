import React, {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
  useImperativeHandle,
  memo,
  type ReactNode,
  type MutableRefObject,
  type Ref,
  type RefObject,
} from "react";
import { cn } from "@tau/ui";
import type { ChatDropdownItem } from "@tau/shared";
import { MessageSquare, RotateCw, TriangleAlert, Unplug } from "lucide-react";
import { useVirtualizer, type VirtualItem, type Virtualizer } from "@tanstack/react-virtual";
import {
  type ChatInputAreaProps,
  type ChatInputAreaHandle,
  type MessageContentItem,
  type ThinkingLevel,
  type ChatContextUsage,
} from "@tau/shared";
import type { ChatMessageType } from "@tau/shared/chat-renderers";
import { DEFAULT_CHAT_INPUT_PLACEHOLDER, resolveChatInputPlaceholder } from "@tau/shared";

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
  inputProps: Omit<ChatInputAreaProps, "services">;
}

export interface ChatContainerCoreEmptyStateRenderParams {
  currentPageUrl?: string | null;
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
  chatHeader?: ReactNode;
  extraToolbarButtons?: ReactNode;
  modelSelectItems?: ChatDropdownItem[];
  createMessageLoading?: boolean;
  allowSendWhileLoading?: boolean;
  queuedMessageCount?: number;
  onCreateNewMessage?: () => void;
  onMcpManagerClick?: () => void;
  onThinkingLevelChange?: (value: ThinkingLevel) => void;
  onModelSelect?: (info: { key: string }) => void;
  onSendMessageContent?: (content: MessageContentItem[]) => void | Promise<void>;
  onUserSend?: () => void;
  onStopGeneration?: () => void;
  inputRef?: RefObject<ChatInputAreaHandle | null>;
  messagesContainerRef?: Ref<HTMLDivElement>;
  renderMessage: (params: ChatContainerCoreMessageRendererParams) => ReactNode;
  renderEmptyState?: (params: ChatContainerCoreEmptyStateRenderParams) => ReactNode;
  /** 输入框外框（外观由宿主决定）；缺省直接渲染输入区 */
  renderInputWrapper?: (inputNode: ReactNode) => ReactNode;
  /** 覆盖默认的重试 / 错误提示条（宿主自定义外观；返回 null 即不显示） */
  renderStatusBanner?: (params: {
    retryStatus?: { attempt: number; maxRetries: number } | null;
    error?: string | null;
  }) => ReactNode;
  renderChatInputArea: (params: ChatContainerCoreInputRendererParams) => ReactNode;
}

const extractTextContent = (messageContent: MessageContentItem[]): string =>
  messageContent
    .filter(item => item.type === "text")
    .map(item => (item as { type: "text"; text: string }).text)
    .join("\n");

export const ChatContainerCore = React.forwardRef<ChatContainerCoreHandle, ChatContainerCoreProps>(
  function ChatContainerCore(
    {
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
      onSendMessageContent,
      onUserSend,
      onStopGeneration,
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
      resolvedChatInputRef,
    ]);

    const inputProps: Omit<ChatInputAreaProps, "services"> = {
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
      extraToolbarButtons,
    };

    const chatInputNode = renderChatInputArea({
      chatInputRef: resolvedChatInputRef,
      inputProps,
    });

    if (!isConnected) {
      if (!showConnectingUI) return null;
      return (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
          <div className="bg-warn-soft text-warn mb-4 grid size-12 place-items-center rounded-full">
            <Unplug size={22} strokeWidth={1.75} />
          </div>
          <h3 className="text-tau-body text-ink-1 mb-1 font-medium">正在连接 AI 服务...</h3>
          <p className="text-tau-sm text-ink-3 text-center">请确保桌面端已启动</p>
        </div>
      );
    }

    return (
      <div className={cn("flex h-full flex-1 flex-col overflow-hidden", className)}>
        {chatHeader ? (
          <div className="border-line-1 shrink-0 border-b p-3">{chatHeader}</div>
        ) : null}

        <div
          ref={setScrollElementAndForwardRef}
          className={messagesContainerClassName || "flex-1 overflow-y-auto p-4"}
        >
          {messages.length === 0 ? (
            renderEmptyState ? (
              renderEmptyState({ currentPageUrl })
            ) : (
              <div className="flex flex-col items-center px-6 pt-12">
                <div className="bg-accent-soft text-accent-text mb-4 grid size-12 place-items-center rounded-full">
                  <MessageSquare size={22} strokeWidth={1.75} />
                </div>
                <h3 className="text-tau-body text-ink-1 mb-2 font-medium">开始对话</h3>
                <p className="text-tau-sm text-ink-3 text-center">与 AI 探讨当前网页内容</p>
                {currentPageUrl ? (
                  <p className="text-tau-sm text-ink-3 mt-4 max-w-full truncate px-4">
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
                    {renderMessage({ message, messageIndex: virtualItem.index })}
                  </VirtualMessageItem>
                );
              })}
            </div>
          )}
        </div>

        {renderStatusBanner ? (
          renderStatusBanner({ retryStatus, error })
        ) : retryStatus || error ? (
          <div className="px-3 pt-2">
            <div
              role="status"
              className={cn(
                "text-tau-sm rounded-tau-sm flex items-center gap-2 px-3 py-2",
                retryStatus ? "bg-warn-soft text-warn" : "bg-danger-soft text-danger"
              )}
            >
              {retryStatus ? (
                <>
                  <RotateCw size={13} strokeWidth={1.75} className="shrink-0 animate-spin" />
                  <span>
                    请求失败，正在重试（第 {retryStatus.attempt}/{retryStatus.maxRetries} 次）…
                  </span>
                </>
              ) : (
                <>
                  <TriangleAlert size={13} strokeWidth={1.75} className="shrink-0" />
                  <span className="min-w-0 break-words">{error}</span>
                </>
              )}
            </div>
          </div>
        ) : null}

        {!hideInput
          ? renderInputWrapper
            ? renderInputWrapper(chatInputNode)
            : chatInputNode
          : null}
      </div>
    );
  }
);

ChatContainerCore.displayName = "ChatContainerCore";

export default ChatContainerCore;
