import { useEffect, useState, type RefObject } from "react";
import { useMemoizedFn } from "ahooks";
import { useChatAutoScroll } from "@tau/shared";
import { useEdgeFade } from "@tau/ui";
import type { ChatContainerCoreHandle } from "@tau/chat-ui";
import { Role } from "@/constants";
import type { ChatMessage } from "@/types";
import { isDraftChat } from "@/stores/useChatSessionStore";

interface ChatScrollAnchor {
  index: number;
  messageId?: string;
  offset: number;
  wasAtBottom: boolean;
}

const CHAT_SCROLL_POSITION_CACHE = new Map<string, ChatScrollAnchor>();

interface ChatScrollingOptions {
  messagesRef: RefObject<HTMLDivElement | null>;
  coreRef: RefObject<ChatContainerCoreHandle | null>;
  entry?: string;
  chatScope: string;
  currentChat: ChatMessage;
  preserveScrollPosition: boolean;
  scrollPositionScope?: string;
  actualChatRef: RefObject<ChatMessage>;
  visibleMessages: ChatMessage["messages"];
  sendLoading: boolean;
  lastVisibleMessageRole: Role | undefined;
  hasRestoredScrollPositionRef: RefObject<boolean>;
  isRestoringScrollPositionRef: RefObject<boolean>;
}

/** 消息滚动：自动贴底接线、滚动位置的保存/恢复（重开对话回到原位）与按消息变化的贴底节奏 */
export function useChatScrolling({
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
}: ChatScrollingOptions) {
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
    if (entry) {
      hasRestoredScrollPositionRef.current = true;
      return;
    }
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
    entry,
    enableAutoScroll,
    forceScrollToBottom,
    getScrollPositionKey,
    isScrolledToBottom,
    restoreScrollAnchor,
    setAutoScrollEnabled,
    visibleMessages.length,
  ]);

  const hasEntryLocation = useMemoizedFn(() => Boolean(entry));
  // 在消息列表变化时滚动到底部（仅在自动滚动启用时）
  useEffect(() => {
    if (!hasEntryLocation() && visibleMessages.length > 0) {
      const timer = setTimeout(() => {
        if (hasEntryLocation()) return;
        if (sendLoading || lastVisibleMessageRole === Role.User) {
          forceScrollToBottomSoon();
          return;
        }
        scrollToBottom();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [
    forceScrollToBottomSoon,
    hasEntryLocation,
    lastVisibleMessageRole,
    scrollToBottom,
    sendLoading,
    visibleMessages.length,
  ]);

  // 监听消息内容变化（仅在自动滚动启用时）
  useEffect(() => {
    if (!hasEntryLocation() && visibleMessages.length > 0) {
      const lastMessage = visibleMessages[visibleMessages.length - 1];
      if (lastMessage && lastMessage.role === Role.Assistant) {
        scrollToBottom();
      }
    }
  }, [hasEntryLocation, visibleMessages, scrollToBottom]);

  return {
    setMessagesContainer,
    scrollToBottom,
    enableAutoScroll,
    setAutoScrollEnabled,
    forceScrollToBottomSoon,
    getVisibleMessageId,
  };
}
