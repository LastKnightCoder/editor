/**
 * 聊天会话存储 RPC 服务：插件会话统一存桌面端 sqlite（经 aiServer WS 通道的 chat.* 命令）。
 * App 挂载时 initChatStoreService()（幂等），断线自动重连；
 * URL → 桌面 ChatGroup 的映射持久化在 chrome.storage.local。
 */
import WebSocketClient from "@/utils/WebSocketClient";
import { AI_SERVER_WS_URL } from "@/utils/aiServerAddress";
import type { ChatGroup, ChatSessionMessage, ChatSessionRecord } from "@tau/shared";

const RECONNECT_INTERVAL = 3000;
const URL_GROUP_MAP_KEY = "tau-chat-url-group-map";

export interface ChatListEntry {
  id: number;
  title: string;
  createTime: number;
  updateTime: number;
  groupId?: number | null;
  archived?: boolean;
  parentChatId?: number | null;
  branchIndex?: number;
  orderNum?: number | null;
  source?: "desktop" | "browser";
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

/** 按分组拉取会话列表（桌面侧 SQL 过滤，不拉全表）；不传 groupId 返回全部 */
export const listChats = async (groupId?: number): Promise<ChatListEntry[]> => {
  const { chats } = await request<{ chats: ChatListEntry[] }>("chat.list", { groupId });
  return chats;
};

export const getChat = async (id: number): Promise<ChatSessionRecord> => {
  const { chat } = await request<{ chat: ChatSessionRecord }>("chat.get", { id });
  return chat;
};

export const createChat = async (options: {
  messages: ChatSessionMessage[];
  title: string;
  groupId?: number | null;
  parentChatId?: number | null;
  branchIndex?: number;
}): Promise<ChatSessionRecord> => {
  const { chat } = await request<{ chat: ChatSessionRecord }>("chat.create", options);
  return chat;
};

/** 增量更新：未提供的字段保留桌面库中现值（updateChatMessage 为部分更新语义） */
export const updateChat = async (
  chat: Partial<Omit<ChatSessionRecord, "id" | "updateTime">> & Pick<ChatSessionRecord, "id">
): Promise<ChatSessionRecord> => {
  const { chat: updated } = await request<{ chat: ChatSessionRecord }>("chat.update", { chat });
  return updated;
};

export const deleteChat = async (id: number): Promise<void> => {
  await request("chat.delete", { id });
};

export const branchChat = async (options: {
  parentChatId: number;
  messages: ChatSessionMessage[];
  title: string;
}): Promise<ChatSessionRecord> => {
  const { chat } = await request<{ chat: ChatSessionRecord }>("chat.branch", options);
  return chat;
};

const readUrlGroupMap = async (): Promise<Record<string, number>> => {
  const result = await chrome.storage.local.get(URL_GROUP_MAP_KEY);
  return (result[URL_GROUP_MAP_KEY] as Record<string, number> | undefined) ?? {};
};

/** 取（必要时创建）URL 对应的桌面分组；离线或失败返回 null */
export const ensureGroupForUrl = async (url: string): Promise<number | null> => {
  try {
    const map = await readUrlGroupMap();
    const cached = map[url];
    if (cached) {
      return cached;
    }

    const { group } = await request<{ group: ChatGroup }>("chat.group.ensure", {
      name: url,
    });

    await chrome.storage.local.set({
      [URL_GROUP_MAP_KEY]: { ...map, [url]: group.id },
    });
    return group.id;
  } catch (error) {
    console.warn("[chatStore] ensureGroupForUrl failed:", error);
    return null;
  }
};

export const __chatStoreTestUtils = {
  get client() {
    return client;
  },
};
