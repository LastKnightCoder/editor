/**
 * 扩展对话 RPC 服务（M4.5）：扩展的对话是桌面按页面存放的 pi 会话文件
 * （`~/.editor/browser-sessions/<页面键>/`，与当前库无关、不参与同步），
 * 经 aiServer WS 通道的 chat.* 命令读写，全部以页面为单位、id 为 pi 会话 id。
 * 发消息走 ai.chat（带 sessionId + pageUrl，桌面从文件恢复会话），这里不整包写消息。
 * App 挂载时 initChatStoreService()（幂等），断线自动重连。
 */
import WebSocketClient from "@/utils/WebSocketClient";
import { AI_SERVER_WS_URL } from "@/utils/aiServerAddress";
import type { ChatSessionMessage } from "@tau/shared";

const RECONNECT_INTERVAL = 3000;

/** 某页面的一个对话（直接取自 pi 会话文件） */
export interface ChatListEntry {
  id: string;
  title: string;
  parentId: string | null;
  createTime: number;
  updateTime: number;
  messageCount: number;
}

let client: WebSocketClient | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let initialized = false;
const connectionListeners = new Set<(connected: boolean) => void>();

const notifyConnection = (connected: boolean) => {
  connectionListeners.forEach(listener => listener(connected));
};

const scheduleReconnect = () => {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
  }
  reconnectTimer = setTimeout(() => {
    if (client) {
      connect();
    }
  }, RECONNECT_INTERVAL);
};

const connect = () => {
  if (!client) {
    return;
  }
  client.onOpenHandler = () => {
    notifyConnection(true);
  };
  client.onCloseHandler = () => {
    notifyConnection(false);
    scheduleReconnect();
  };
  client.connect();
};

export const initChatStoreService = () => {
  if (initialized) {
    return;
  }
  initialized = true;
  client = new WebSocketClient(AI_SERVER_WS_URL);
  connect();
};

export const closeChatStoreService = () => {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (client) {
    client.onOpenHandler = null;
    client.onCloseHandler = null;
    client.disconnect();
    client = null;
  }
  initialized = false;
  notifyConnection(false);
};

export const isChatStoreConnected = () => Boolean(client?.isConnected);

export const subscribeChatStoreConnection = (listener: (connected: boolean) => void) => {
  connectionListeners.add(listener);
  listener(isChatStoreConnected());
  return () => {
    connectionListeners.delete(listener);
  };
};

const request = <T>(method: string, params?: unknown, timeout = 15_000): Promise<T> => {
  if (!client?.isConnected) {
    return Promise.reject(new Error("桌面端未连接"));
  }
  return client.sendRequest(method, params, timeout) as Promise<T>;
};

/** 某页面的全部对话（含分支），按最近活动降序 */
export const listChats = async (pageUrl: string): Promise<ChatListEntry[]> => {
  const { chats } = await request<{ chats: ChatListEntry[] }>("chat.list", { pageUrl });
  return chats;
};

/** 对话内容（会话文件当前叶子路径的投影；还没落盘返回空） */
export const getChatMessages = async (pageUrl: string, id: string) => {
  const { messages } = await request<{ messages: ChatSessionMessage[] }>("chat.get", {
    pageUrl,
    id,
  });
  return messages;
};

export const renameChat = async (pageUrl: string, id: string, title: string) => {
  await request("chat.rename", { pageUrl, id, title });
};

/** 删除对话连带分支子树，返回全部被删 id */
export const deleteChat = async (pageUrl: string, id: string): Promise<string[]> => {
  const { deletedIds } = await request<{ deletedIds: string[] }>("chat.delete", { pageUrl, id });
  return deletedIds;
};

/** 建分支：截到 throughEntryId（缺省整条），返回新对话 id 与内容 */
export const branchChat = async (pageUrl: string, id: string, throughEntryId?: string) =>
  request<{ id: string; messages: ChatSessionMessage[] }>("chat.branch", {
    pageUrl,
    id,
    ...(throughEntryId ? { throughEntryId } : {}),
  });

/** 回退到这条用户消息（entry id）之前：编辑重发/重新生成的前半步 */
export const rewindChat = async (pageUrl: string, id: string, entryId: string) => {
  const { messages } = await request<{ messages: ChatSessionMessage[] }>("chat.rewind", {
    pageUrl,
    id,
    entryId,
  });
  return messages;
};

/** 删除消息：省略这些 entry（一条回答传它全部 entry id） */
export const omitChatEntries = async (pageUrl: string, id: string, entryIds: string[]) => {
  const { messages } = await request<{ messages: ChatSessionMessage[] }>("chat.omit", {
    pageUrl,
    id,
    entryIds,
  });
  return messages;
};

export const __chatStoreTestUtils = {
  get client() {
    return client;
  },
};
