import { useState, useEffect, useCallback, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import type { ChatSession } from "../types/chat-session";
import type { ChatMessageType } from "@tau/shared";
import {
  deleteChat,
  forkChat,
  getChatMessages,
  listChats,
  omitChatEntries,
  renameChat,
  rewindChat,
  subscribeChatStoreConnection,
  switchChatVersion,
  type ChatListEntry,
} from "../services/chatStoreClient";
import { toDisplayMessages } from "../services/chatModelBridge";

interface UseChatSessionsReturn {
  sessions: ChatSession[];
  currentSession: ChatSession;
  messages: ChatMessageType[];
  isLoading: boolean;
  /** 新对话 = 本地草稿（首轮回答后才出现在列表里） */
  createSession: () => void;
  deleteSession: (sessionId: string) => Promise<void>;
  updateSessionTitle: (sessionId: string, title: string) => Promise<void>;
  selectSession: (sessionId: string) => Promise<void>;
  /** 一轮结束后：重读当前对话的投影与列表（事实源是桌面的会话文件） */
  reloadCurrent: () => Promise<void>;
  deleteMessage: (messageIndex: number) => Promise<void>;
  /** 回退到这条用户消息之前（重新生成/编辑重发的前半步）；返回回退后的消息，失败返回 null */
  rewindBefore: (messageIndex: number) => Promise<ChatMessageType[] | null>;
  /** 从这里建分支：回到这条回答之后（M4-d，同一对话内），返回是否成功 */
  createBranch: (messageIndex: number) => Promise<boolean>;
  /** 切到这条用户消息的另一个版本 */
  switchVersion: (messageIndex: number, versionIndex: number) => Promise<void>;
}

const newDraft = (): ChatSession => {
  const now = Date.now();
  return { id: uuidv4(), title: "新对话", createTime: now, updateTime: now, draft: true };
};

const toSession = (entry: ChatListEntry): ChatSession => ({
  id: entry.id,
  title: entry.title,
  createTime: entry.createTime,
  updateTime: entry.updateTime,
});

const pageIdentity = (url: string | null) => {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url.split("#")[0];
  }
};
const selectionKey = (url: string) => `pi-chat-selection:${url}`;
const readSelection = (url: string) => {
  try {
    return localStorage.getItem(selectionKey(url));
  } catch {
    return null;
  }
};
const rememberSelection = (url: string, id: string) => {
  try {
    localStorage.setItem(selectionKey(url), id);
  } catch {
    /* 存储不可用时仍可聊天。 */
  }
};

/**
 * 扩展对话（M4.5）：一个页面的对话列表与当前对话。对话是桌面按页面存放的 pi 会话文件，
 * 发消息走 ai.chat（桌面从文件恢复会话并落盘），这里只读投影、调改历史 RPC，不整包写消息。
 * 页面键 = 去掉 # 片段的 URL，由桌面计算（这里传原始 URL）。
 */
export function useChatSessions(rawUrl: string | null): UseChatSessionsReturn {
  const url = pageIdentity(rawUrl);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSession, setCurrentSession] = useState<ChatSession>(newDraft);
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const currentRef = useRef(currentSession);
  currentRef.current = currentSession;
  const urlRef = useRef(url);
  urlRef.current = url;
  const selectionGeneration = useRef(0);
  const listGeneration = useRef(0);
  const selectCurrent = useCallback((session: ChatSession) => {
    selectionGeneration.current += 1;
    currentRef.current = session;
    setCurrentSession(session);
    if (urlRef.current) rememberSelection(urlRef.current, session.id);
  }, []);

  useEffect(() => subscribeChatStoreConnection(setConnected), []);

  const loadList = useCallback(async (pageUrl: string) => {
    const generation = ++listGeneration.current;
    const entries = await listChats(pageUrl);
    const next = entries.map(toSession);
    if (pageUrl === urlRef.current && generation === listGeneration.current) setSessions(next);
    return next;
  }, []);

  const loadMessages = useCallback(async (pageUrl: string, id: string) => {
    const stored = await getChatMessages(pageUrl, id);
    return toDisplayMessages(stored);
  }, []);

  // 页面 / 连接变化：重载列表，打开最近的对话；没有对话就是新草稿
  useEffect(() => {
    const generation = ++selectionGeneration.current;
    if (!url || !connected) {
      setSessions([]);
      setCurrentSession(newDraft());
      setMessages([]);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    void (async () => {
      try {
        const list = await loadList(url);
        if (cancelled) return;
        if (generation !== selectionGeneration.current) return;
        const saved = readSelection(url);
        const target = saved ? list.find(item => item.id === saved) : list[0];
        if (!target) {
          selectCurrent(saved ? { ...newDraft(), id: saved } : newDraft());
          setMessages([]);
          setIsLoading(false);
          return;
        }
        const loaded = await loadMessages(url, target.id);
        if (cancelled || generation !== selectionGeneration.current) return;
        selectCurrent(target);
        setMessages(loaded);
        setIsLoading(false);
      } catch (error) {
        console.warn("[useChatSessions] 加载对话失败:", error);
      } finally {
        if (!cancelled && generation === selectionGeneration.current) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url, connected, loadList, loadMessages, selectCurrent]);

  const createSession = useCallback(() => {
    selectCurrent(newDraft());
    setMessages([]);
  }, [selectCurrent]);

  const selectSession = useCallback(
    async (sessionId: string) => {
      const pageUrl = urlRef.current;
      if (!pageUrl || sessionId === currentRef.current.id) return;
      const session = sessions.find(item => item.id === sessionId);
      if (!session) return;
      selectCurrent(session);
      const generation = selectionGeneration.current;
      setMessages([]);
      setIsLoading(true);
      try {
        const loaded = await loadMessages(pageUrl, session.id);
        if (generation !== selectionGeneration.current || pageUrl !== urlRef.current) return;
        setMessages(loaded);
      } catch (error) {
        if (generation !== selectionGeneration.current || pageUrl !== urlRef.current) return;
        console.warn("[useChatSessions] 加载对话失败:", error);
        setMessages([]);
      } finally {
        if (generation === selectionGeneration.current && pageUrl === urlRef.current)
          setIsLoading(false);
      }
    },
    [sessions, loadMessages, selectCurrent]
  );

  const reloadCurrent = useCallback(async () => {
    const pageUrl = urlRef.current;
    const session = currentRef.current;
    const generation = selectionGeneration.current;
    if (!pageUrl) return;
    try {
      const [list, loaded] = await Promise.all([
        loadList(pageUrl),
        loadMessages(pageUrl, session.id),
      ]);
      // 重读期间用户可能已切走：只写回仍是当前的对话
      if (
        currentRef.current.id !== session.id ||
        urlRef.current !== pageUrl ||
        generation !== selectionGeneration.current
      )
        return;
      const registered = list.find(item => item.id === session.id);
      // 首轮失败（还没有回答）pi 不落盘：列表里没有它，保持草稿与界面上的消息
      if (!registered) return;
      setCurrentSession(registered);
      setMessages(loaded);
    } catch (error) {
      console.warn("[useChatSessions] 重读对话失败:", error);
    }
  }, [loadList, loadMessages]);

  const deleteSession = useCallback(
    async (sessionId: string) => {
      const pageUrl = urlRef.current;
      if (!pageUrl) return;
      try {
        await deleteChat(pageUrl, sessionId);
      } catch (error) {
        console.warn("[useChatSessions] 删除对话失败:", error);
        throw error;
      }
      if (urlRef.current !== pageUrl) return;
      const remaining = sessions.filter(session => session.id !== sessionId);
      setSessions(previous => previous.filter(session => session.id !== sessionId));
      if (currentRef.current.id === sessionId) {
        const next = remaining[0];
        if (next) {
          selectCurrent(next);
          const generation = selectionGeneration.current;
          const loaded = await loadMessages(pageUrl, next.id).catch(() => []);
          if (generation === selectionGeneration.current && pageUrl === urlRef.current)
            setMessages(loaded);
        } else {
          createSession();
        }
      }
    },
    [sessions, loadMessages, createSession, selectCurrent]
  );

  const updateSessionTitle = useCallback(async (sessionId: string, title: string) => {
    const pageUrl = urlRef.current;
    if (!pageUrl) return;
    const apply = (session: ChatSession) =>
      session.id === sessionId ? { ...session, title } : session;
    // 草稿还没有文件：只改本地，首轮之后标题取 pi 的
    if (currentRef.current.id === sessionId && currentRef.current.draft) {
      setCurrentSession(apply);
      return;
    }
    try {
      await renameChat(pageUrl, sessionId, title);
      if (urlRef.current !== pageUrl) return;
      setSessions(prev => prev.map(apply));
      setCurrentSession(apply);
    } catch (error) {
      console.warn("[useChatSessions] 更新标题失败:", error);
    }
  }, []);

  const deleteMessage = useCallback(
    async (messageIndex: number) => {
      const pageUrl = urlRef.current;
      const entryIds = messages[messageIndex]?.piEntryIds ?? [];
      if (!pageUrl || entryIds.length === 0) return;
      const id = currentRef.current.id;
      const generation = selectionGeneration.current;
      try {
        const next = await omitChatEntries(pageUrl, id, entryIds);
        if (generation !== selectionGeneration.current || pageUrl !== urlRef.current) return;
        setMessages(toDisplayMessages(next));
      } catch (error) {
        console.warn("[useChatSessions] 删除消息失败:", error);
      }
    },
    [messages]
  );

  const rewindBefore = useCallback(
    async (messageIndex: number) => {
      const pageUrl = urlRef.current;
      const target = messages[messageIndex];
      const entryId = target?.role === "user" ? target.piEntryIds?.[0] : undefined;
      if (!pageUrl || !entryId) return null;
      const id = currentRef.current.id;
      const generation = selectionGeneration.current;
      try {
        const next = toDisplayMessages(await rewindChat(pageUrl, id, entryId));
        if (generation !== selectionGeneration.current || pageUrl !== urlRef.current) return null;
        setMessages(next);
        return next;
      } catch (error) {
        console.warn("[useChatSessions] 回退对话失败:", error);
        return null;
      }
    },
    [messages]
  );

  /** 从这里建分支（M4-d）：回到这条回答之后，接下来发的消息成为新版本；返回是否成功 */
  const createBranch = useCallback(
    async (messageIndex: number) => {
      const pageUrl = urlRef.current;
      const entryId = messages[messageIndex]?.piEntryIds?.at(-1);
      if (!pageUrl || !entryId) return false;
      const id = currentRef.current.id;
      const generation = selectionGeneration.current;
      try {
        const loaded = toDisplayMessages(await forkChat(pageUrl, id, entryId));
        if (generation !== selectionGeneration.current || pageUrl !== urlRef.current) return false;
        setMessages(loaded);
        return true;
      } catch (error) {
        console.warn("[useChatSessions] 创建分支失败:", error);
        return false;
      }
    },
    [messages]
  );

  /** 切到这条用户消息的第 versionIndex 个版本 */
  const switchVersion = useCallback(
    async (messageIndex: number, versionIndex: number) => {
      const pageUrl = urlRef.current;
      const entryId = messages[messageIndex]?.piVersions?.ids[versionIndex];
      if (!pageUrl || !entryId) return;
      const id = currentRef.current.id;
      const generation = selectionGeneration.current;
      try {
        const loaded = toDisplayMessages(await switchChatVersion(pageUrl, id, entryId));
        if (generation !== selectionGeneration.current || pageUrl !== urlRef.current) return;
        setMessages(loaded);
      } catch (error) {
        console.warn("[useChatSessions] 切换版本失败:", error);
      }
    },
    [messages]
  );

  return {
    sessions,
    currentSession,
    messages,
    isLoading,
    createSession,
    deleteSession,
    updateSessionTitle,
    selectSession,
    reloadCurrent,
    deleteMessage,
    rewindBefore,
    createBranch,
    switchVersion,
  };
}
