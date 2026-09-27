import { useState, useEffect, useCallback, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import type { ChatSession } from "../types/chat-session";
import type { ChatMessageType } from "@tau/shared";
import {
  branchChat,
  deleteChat,
  getChatMessages,
  listChats,
  omitChatEntries,
  renameChat,
  rewindChat,
  subscribeChatStoreConnection,
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
  getChildBranchesCount: (sessionId: string) => Promise<number>;
  deleteMessage: (messageIndex: number) => Promise<void>;
  /** 回退到这条用户消息之前（重新生成/编辑重发的前半步）；返回回退后的消息，失败返回 null */
  rewindBefore: (messageIndex: number) => Promise<ChatMessageType[] | null>;
  createBranch: (messageIndex: number) => Promise<void>;
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
  parentChatId: entry.parentId,
});

/**
 * 扩展对话（M4.5）：一个页面的对话列表与当前对话。对话是桌面按页面存放的 pi 会话文件，
 * 发消息走 ai.chat（桌面从文件恢复会话并落盘），这里只读投影、调改历史 RPC，不整包写消息。
 * 页面键 = 去掉 # 片段的 URL，由桌面计算（这里传原始 URL）。
 */
export function useChatSessions(url: string | null): UseChatSessionsReturn {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSession, setCurrentSession] = useState<ChatSession>(newDraft);
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const currentRef = useRef(currentSession);
  currentRef.current = currentSession;
  const urlRef = useRef(url);
  urlRef.current = url;

  useEffect(() => subscribeChatStoreConnection(setConnected), []);

  const loadList = useCallback(async (pageUrl: string) => {
    const entries = await listChats(pageUrl);
    const next = entries.map(toSession);
    setSessions(next);
    return next;
  }, []);

  const loadMessages = useCallback(async (pageUrl: string, id: string) => {
    const stored = await getChatMessages(pageUrl, id);
    return toDisplayMessages(stored);
  }, []);

  // 页面 / 连接变化：重载列表，打开最近的对话；没有对话就是新草稿
  useEffect(() => {
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
        const target = list.find(session => !session.parentChatId) ?? list[0];
        if (!target) {
          setCurrentSession(newDraft());
          setMessages([]);
          return;
        }
        const loaded = await loadMessages(url, target.id);
        if (cancelled) return;
        setCurrentSession(target);
        setMessages(loaded);
      } catch (error) {
        console.warn("[useChatSessions] 加载对话失败:", error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url, connected, loadList, loadMessages]);

  const createSession = useCallback(() => {
    setCurrentSession(newDraft());
    setMessages([]);
  }, []);

  const selectSession = useCallback(
    async (sessionId: string) => {
      const pageUrl = urlRef.current;
      if (!pageUrl || sessionId === currentRef.current.id) return;
      const session = sessions.find(item => item.id === sessionId);
      if (!session) return;
      setCurrentSession(session);
      setIsLoading(true);
      try {
        setMessages(await loadMessages(pageUrl, session.id));
      } catch (error) {
        console.warn("[useChatSessions] 加载对话失败:", error);
        setMessages([]);
      } finally {
        setIsLoading(false);
      }
    },
    [sessions, loadMessages]
  );

  const reloadCurrent = useCallback(async () => {
    const pageUrl = urlRef.current;
    const session = currentRef.current;
    if (!pageUrl) return;
    try {
      const [list, loaded] = await Promise.all([
        loadList(pageUrl),
        loadMessages(pageUrl, session.id),
      ]);
      // 重读期间用户可能已切走：只写回仍是当前的对话
      if (currentRef.current.id !== session.id) return;
      const registered = list.find(item => item.id === session.id);
      // 首轮失败（还没有回答）pi 不落盘：列表里没有它，保持草稿与界面上的消息
      if (!registered) return;
      setCurrentSession(registered);
      setMessages(loaded);
    } catch (error) {
      console.warn("[useChatSessions] 重读对话失败:", error);
    }
  }, [loadList, loadMessages]);

  const getChildBranchesCount = useCallback(
    async (sessionId: string): Promise<number> => {
      const countChildren = (id: string): number =>
        sessions
          .filter(session => session.parentChatId === id)
          .reduce((total, child) => total + 1 + countChildren(child.id), 0);
      return countChildren(sessionId);
    },
    [sessions]
  );

  const deleteSession = useCallback(
    async (sessionId: string) => {
      const pageUrl = urlRef.current;
      if (!pageUrl) return;
      let deletedIds: string[];
      try {
        deletedIds = await deleteChat(pageUrl, sessionId);
      } catch (error) {
        console.warn("[useChatSessions] 删除对话失败:", error);
        throw error;
      }
      const doomed = new Set(deletedIds);
      const remaining = sessions.filter(session => !doomed.has(session.id));
      setSessions(remaining);
      if (doomed.has(currentRef.current.id)) {
        const next = remaining.find(session => !session.parentChatId) ?? remaining[0];
        if (next) {
          setCurrentSession(next);
          setMessages(await loadMessages(pageUrl, next.id).catch(() => []));
        } else {
          createSession();
        }
      }
    },
    [sessions, loadMessages, createSession]
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
      try {
        const next = await omitChatEntries(pageUrl, currentRef.current.id, entryIds);
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
      try {
        const next = toDisplayMessages(await rewindChat(pageUrl, currentRef.current.id, entryId));
        setMessages(next);
        return next;
      } catch (error) {
        console.warn("[useChatSessions] 回退对话失败:", error);
        return null;
      }
    },
    [messages]
  );

  const createBranch = useCallback(
    async (messageIndex: number) => {
      const pageUrl = urlRef.current;
      const throughEntryId = messages[messageIndex]?.piEntryIds?.at(-1);
      if (!pageUrl || !throughEntryId) return;
      try {
        const branch = await branchChat(pageUrl, currentRef.current.id, throughEntryId);
        const list = await loadList(pageUrl);
        const session = list.find(item => item.id === branch.id);
        if (session) setCurrentSession(session);
        setMessages(toDisplayMessages(branch.messages));
      } catch (error) {
        console.warn("[useChatSessions] 创建分支失败:", error);
      }
    },
    [messages, loadList]
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
    getChildBranchesCount,
    deleteMessage,
    rewindBefore,
    createBranch,
  };
}
