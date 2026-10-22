/**
 * 从外部发起一个新对话（插件 chat.start）：在对话页或停靠栏开一个新草稿，预填输入与引用，
 * 用户首次发送、草稿登记成正式对话后交回会话 ID；没发送就切走、关闭或发起方取消时交回 null。
 * 同一时间只有一个待发起的请求。
 */

import { useEffect, useRef, type RefObject } from "react";
import { create } from "zustand";
import { useMemoizedFn } from "ahooks";
import type { MentionRef } from "@tau/shared";
import type { ChatContainerHandle } from "@/components/ChatSidebar/ChatContainer";
import { useShellStore } from "@/app/shellStore";
import { openPage } from "@/services/page-navigation";

export type ChatPlacement = "page" | "dock";

export interface ChatStartRequest {
  id: number;
  placement: ChatPlacement;
  prompt: string;
  mentions: MentionRef[];
  settle(sessionId: string | null): void;
}

export const useChatStartStore = create<{ request: ChatStartRequest | null }>(() => ({
  request: null,
}));

let nextRequestId = 0;
/** 输入框随 ChatContainer 懒加载：预填时每 16ms 看一次，最多等约 2 秒 */
const APPLY_INTERVAL_MS = 16;
const MAX_APPLY_ATTEMPTS = 120;

export function startChat(
  options: { placement: ChatPlacement; prompt: string; mentions: MentionRef[] },
  signal: AbortSignal
): Promise<string | null> {
  signal.throwIfAborted();
  if (useChatStartStore.getState().request) throw new Error("请先发送或关闭上一个发起的对话");
  return new Promise(resolve => {
    let done = false;
    const settle = (sessionId: string | null) => {
      if (done) return;
      done = true;
      signal.removeEventListener("abort", abort);
      if (useChatStartStore.getState().request === request)
        useChatStartStore.setState({ request: null });
      resolve(sessionId);
    };
    const abort = () => settle(null);
    const request: ChatStartRequest = { id: ++nextRequestId, ...options, settle };
    signal.addEventListener("abort", abort, { once: true });
    useChatStartStore.setState({ request });
    if (options.placement === "dock") useShellStore.getState().setAssistOpen(true);
    else openPage("chat");
  });
}

interface Claim {
  request: ChatStartRequest;
  /** 认领时的对话：新草稿出现前忽略它 */
  from: string;
  draftId: string | null;
}

/**
 * 对话面板（对话页、停靠栏）接收发起请求：active 为面板可见时认领，换新草稿并预填；
 * 返回的回调接在 ChatContainer 的 onChatCreated 上，草稿登记时交回会话 ID。
 */
export function useChatStartConsumer(
  placement: ChatPlacement,
  options: {
    active: boolean;
    currentChatId: string;
    isDraft: boolean;
    newChat(): void;
    container: RefObject<ChatContainerHandle | null>;
  }
): (sessionId: string) => void {
  const { active, currentChatId, isDraft, newChat, container } = options;
  const request = useChatStartStore(state =>
    state.request?.placement === placement ? state.request : null
  );
  const claim = useRef<Claim | null>(null);
  const cancel = useMemoizedFn(() => {
    claim.current?.request.settle(null);
    claim.current = null;
  });

  useEffect(() => {
    if (!request) {
      claim.current = null;
      return;
    }
    if (!active || claim.current?.request === request) return;
    claim.current = { request, from: currentChatId, draftId: null };
    newChat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, request]);

  useEffect(() => {
    const current = claim.current;
    if (!current) return;
    if (current.draftId === null) {
      if (!isDraft || currentChatId === current.from) return;
      current.draftId = currentChatId;
      let attempts = 0;
      const apply = () => {
        if (claim.current !== current) return;
        const handle = container.current;
        if (!handle) {
          if (++attempts < MAX_APPLY_ATTEMPTS) setTimeout(apply, APPLY_INTERVAL_MS);
          return;
        }
        handle.setInputValue(current.request.prompt);
        handle.appendMentions(current.request.mentions);
        handle.focusInput();
      };
      setTimeout(apply, 0);
      return;
    }
    if (currentChatId !== current.draftId) cancel();
  }, [currentChatId, isDraft, container, cancel]);

  // 页面隐藏（Activity）、停靠栏收起或卸载：没发送的请求取消
  useEffect(() => {
    if (!active) return;
    return cancel;
  }, [active, cancel]);

  return useMemoizedFn((sessionId: string) => {
    const current = claim.current;
    if (current?.draftId !== sessionId) return;
    claim.current = null;
    current.request.settle(sessionId);
  });
}
