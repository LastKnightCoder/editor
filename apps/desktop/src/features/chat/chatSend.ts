/**
 * 往主聊天的某个对话追加一条用户消息（正文里「让它按新原文重写」、选中文字 @Agent 派活）。
 * 停靠栏或对话页可见时由它承接：先切到目标对话，等输入框就绪后发送；多条请求按顺序处理。
 * 只在主窗口生效；独立编辑窗口经主进程转发到主窗口（见 services/content-editing/follow-up）。
 */

import { useEffect, type RefObject } from "react";
import { create } from "zustand";
import type { MessageContentItem } from "@tau/shared";
import type { ChatContainerHandle } from "@/components/ChatSidebar/ChatContainer";
import { getChatDatabase } from "@/services/chatDatabase";
import useSettingStore from "@/stores/useSettingStore";
import { useShellStore } from "@/app/shellStore";

interface ChatSendRequest {
  id: number;
  databaseName: string;
  /** 目标对话；缺省为当前对话 */
  chatId?: string;
  content: MessageContentItem[];
  /** 已被某个面板认领发送，另一个同时可见的面板不再重复发 */
  claimed?: boolean;
  settle(sent: boolean): void;
}

const useChatSendStore = create<{ queue: ChatSendRequest[] }>(() => ({ queue: [] }));

let nextRequestId = 0;
/** 输入框随 ChatContainer 懒加载、切对话要读投影：每 16ms 看一次，最多等约 3 秒 */
const APPLY_INTERVAL_MS = 16;
const MAX_APPLY_ATTEMPTS = 180;

export function sendToChat(options: {
  databaseName?: string;
  chatId?: string;
  content: MessageContentItem[];
}): Promise<boolean> {
  const databaseName = (options.databaseName ?? getChatDatabase()).replace(/\.db$/, "");
  if (databaseName !== getChatDatabase()) return Promise.resolve(false);
  return new Promise(resolve => {
    const request: ChatSendRequest = {
      id: ++nextRequestId,
      ...options,
      databaseName,
      settle: sent => {
        useChatSendStore.setState(state => ({
          queue: state.queue.filter(item => item !== request),
        }));
        resolve(sent);
      },
    };
    setTimeout(() => {
      if (!request.claimed && useChatSendStore.getState().queue.includes(request))
        request.settle(false);
    }, APPLY_INTERVAL_MS * MAX_APPLY_ATTEMPTS);
    useChatSendStore.setState(state => ({ queue: [...state.queue, request] }));
    useShellStore.getState().setAssistOpen(true);
  });
}

/**
 * 对话面板（停靠栏、对话页）承接追加请求：active 为面板可见时处理队首请求。
 * select 切到目标对话；切换生效（currentChatId 变为目标）后再发送。
 */
export function useChatSendConsumer(options: {
  active: boolean;
  currentChatId: string;
  select(chatId: string): void;
  container: RefObject<ChatContainerHandle | null>;
}) {
  const { active, currentChatId, select, container } = options;
  const request = useChatSendStore(state => state.queue[0] ?? null);
  const database = useSettingStore(state => state.setting.database.active.replace(/\.db$/, ""));

  useEffect(() => {
    if (!request || !active) return;
    if (request.databaseName !== database || request.databaseName !== getChatDatabase()) {
      if (!request.claimed) request.settle(false);
      return;
    }
    if (request.chatId && request.chatId !== currentChatId) {
      select(request.chatId);
      return;
    }
    let attempts = 0;
    let timer = setTimeout(function apply() {
      if (useChatSendStore.getState().queue[0] !== request || request.claimed) return;
      if (request.databaseName !== getChatDatabase()) {
        request.settle(false);
        return;
      }
      const handle = container.current;
      if (!handle) {
        if (++attempts < MAX_APPLY_ATTEMPTS) timer = setTimeout(apply, APPLY_INTERVAL_MS);
        else request.settle(false);
        return;
      }
      request.claimed = true;
      void handle.sendUserMessage(request.content).then(
        sent => request.settle(sent),
        () => request.settle(false)
      );
    }, 0);
    return () => clearTimeout(timer);
  }, [request, active, currentChatId, select, container, database]);

  // 目标对话切不过去（已删除、属于别的库）时不无限等待
  useEffect(() => {
    if (!request?.chatId || !active || request.chatId === currentChatId) return;
    const timer = setTimeout(() => {
      if (useChatSendStore.getState().queue[0] === request) request.settle(false);
    }, APPLY_INTERVAL_MS * MAX_APPLY_ATTEMPTS);
    return () => clearTimeout(timer);
  }, [request, active, currentChatId]);
}
