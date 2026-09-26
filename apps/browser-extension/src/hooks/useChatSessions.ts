import { useState, useEffect, useCallback, useRef } from "react";
import type { ChatSession } from "../types/chat-session";
import type { ChatMessageType, MessageContentItem } from "@tau/shared";
import {
  branchChat,
  createChat,
  deleteChat,
  ensureGroupForUrl,
  getChat,
  listChats,
  subscribeChatStoreConnection,
  updateChat,
} from "../services/chatStoreClient";
import {
  extractSystemPrompt,
  toDisplayMessages,
  toStoredMessages,
  withSystemPrompt,
} from "../services/chatModelBridge";

interface UseChatSessionsReturn {
  sessions: ChatSession[];
  currentSession: ChatSession;
  messages: ChatMessageType[];
  isLoading: boolean;
  createSession: (systemPromptSnapshot?: string) => Promise<void>;
  ensureSessionSystemPrompt: (
    sessionId: string | number,
    systemPromptSnapshot: string
  ) => Promise<void>;
  deleteSession: (sessionId: string | number) => Promise<void>;
  updateSessionTitle: (sessionId: string | number, title: string) => Promise<void>;
  selectSession: (sessionId: string | number) => Promise<void>;
  saveMessages: (messages: ChatMessageType[]) => void;
  getChildBranchesCount: (sessionId: string | number) => Promise<number>;
  deleteMessage: (messageIndex: number) => void;
  regenerateMessage: (
    messageIndex: number,
    sendCallback: (content: string | MessageContentItem[], baseMessages: ChatMessageType[]) => void
  ) => void;
  createBranch: (messageIndex: number) => Promise<void>;
}

// 默认的空会话（用于初始化状态，id 0 不对应任何持久化行）
const DEFAULT_SESSION: ChatSession = {
  id: 0,
  title: "新对话",
  createTime: Date.now(),
  updateTime: Date.now(),
};

const toSessionMeta = (
  entry: {
    id: number;
    title: string;
    createTime: number;
    updateTime: number;
    parentChatId?: number | null;
    branchIndex?: number;
    archived?: boolean;
  },
  systemPromptSnapshot?: string
): ChatSession => ({
  id: entry.id,
  title: entry.title,
  createTime: entry.createTime,
  updateTime: entry.updateTime,
  parentChatId: entry.parentChatId,
  branchIndex: entry.branchIndex,
  archived: entry.archived,
  systemPromptSnapshot,
});

/**
 * 会话存储 Hook：数据统一走桌面端 sqlite（chat.* RPC），
 * 渲染层消息模型仍为 ChatMessageType，读写经 chatModelBridge 桥接。
 */
export function useChatSessions(url: string | null): UseChatSessionsReturn {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSession, setCurrentSession] = useState<ChatSession>(DEFAULT_SESSION);
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  // 迁移等外部写入后触发列表刷新
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const refresh = () => setRefreshKey(key => key + 1);
    window.addEventListener("tau-chat-store-changed", refresh);
    return () => {
      window.removeEventListener("tau-chat-store-changed", refresh);
    };
  }, []);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentUrlRef = useRef(url);
  const currentSessionIdRef = useRef<number | null>(null);
  // 当前会话的 system 快照与消息（saveMessages 全量提交时合并）
  const systemPromptRef = useRef<string | undefined>(undefined);
  // 待落盘快照：记录触发保存时所属的会话，避免 debounce 到点前切换会话导致消息写入错误的会话
  const pendingSaveRef = useRef<{
    chatId: number;
    messages: ChatMessageType[];
    systemPrompt?: string;
  } | null>(null);

  useEffect(() => {
    return subscribeChatStoreConnection(setConnected);
  }, []);

  const loadSessionDetail = useCallback(async (chatId: number) => {
    const chat = await getChat(chatId);
    systemPromptRef.current = extractSystemPrompt(chat.messages);
    return {
      session: toSessionMeta(chat, systemPromptRef.current),
      messages: toDisplayMessages(chat.messages),
    };
  }, []);

  // 按 URL 分组加载会话列表（桌面侧按分组过滤）
  const loadSessions = useCallback(async (targetUrl: string): Promise<ChatSession[]> => {
    const groupId = await ensureGroupForUrl(targetUrl);
    if (groupId === null) {
      return [];
    }
    const chats = await listChats(groupId);
    return chats
      .slice()
      .sort((a, b) => b.updateTime - a.updateTime)
      .map(entry => toSessionMeta(entry));
  }, []);

  const persistMessages = useCallback(
    async (chatId: number, displayMessages: ChatMessageType[], systemPrompt?: string) => {
      try {
        const stored = withSystemPrompt(toStoredMessages(displayMessages), systemPrompt);
        const updated = await updateChat({
          id: chatId,
          messages: stored,
        });
        setSessions(prev =>
          prev.map(session =>
            session.id === chatId ? { ...session, updateTime: updated.updateTime } : session
          )
        );
      } catch (error) {
        console.warn("[useChatSessions] 保存会话消息失败:", error);
      }
    },
    []
  );

  /** 立即落盘待保存的消息（切换/卸载前调用，防止 debounce 丢失或串库） */
  const flushPendingSave = useCallback(() => {
    const pending = pendingSaveRef.current;
    pendingSaveRef.current = null;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (pending) {
      void persistMessages(pending.chatId, pending.messages, pending.systemPrompt);
    }
  }, [persistMessages]);

  const discardPendingSave = useCallback((chatIds: Set<number>) => {
    if (pendingSaveRef.current && chatIds.has(pendingSaveRef.current.chatId)) {
      pendingSaveRef.current = null;
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    }
  }, []);

  // 保存会话消息（带 debounce）
  const saveMessages = useCallback(
    (newMessages: ChatMessageType[]) => {
      const chatId = currentSessionIdRef.current;
      if (chatId) {
        pendingSaveRef.current = {
          chatId,
          messages: newMessages,
          systemPrompt: systemPromptRef.current,
        };
        if (saveTimerRef.current) {
          clearTimeout(saveTimerRef.current);
        }
        saveTimerRef.current = setTimeout(() => {
          saveTimerRef.current = null;
          flushPendingSave();
        }, 1000);
      }

      // 立即更新本地 messages 以保持 UI 响应
      setMessages(newMessages);
    },
    [flushPendingSave]
  );

  // 创建新会话
  const createSession = useCallback(
    async (systemPromptSnapshot?: string) => {
      if (!currentUrlRef.current) {
        return;
      }
      flushPendingSave();
      try {
        const groupId = await ensureGroupForUrl(currentUrlRef.current);
        if (groupId === null) {
          return;
        }
        const nextIndex = sessions.length + 1;
        const created = await createChat({
          messages: systemPromptSnapshot ? withSystemPrompt([], systemPromptSnapshot) : [],
          title: `对话 ${nextIndex}`,
          groupId,
        });

        const nextSession = toSessionMeta(created, systemPromptSnapshot);
        setSessions(prev => [nextSession, ...prev]);
        setCurrentSession(nextSession);
        currentSessionIdRef.current = created.id;
        systemPromptRef.current = systemPromptSnapshot;
        setMessages([]);
      } catch (error) {
        console.warn("[useChatSessions] 创建会话失败:", error);
      }
    },
    [sessions.length, flushPendingSave]
  );

  const ensureSessionSystemPrompt = useCallback(
    async (sessionId: string | number, systemPromptSnapshot: string) => {
      if (systemPromptRef.current === systemPromptSnapshot) {
        return;
      }
      systemPromptRef.current = systemPromptSnapshot;
      const chatId = Number(sessionId);
      if (!Number.isInteger(chatId) || chatId <= 0) {
        return;
      }
      // 快照仅在前端生效（会话内动态注入），下一次消息落库时随 withSystemPrompt 一并提交
      setCurrentSession(prev => (prev.id === chatId ? { ...prev, systemPromptSnapshot } : prev));
    },
    []
  );

  // 获取子分支数量（递归，含多级）
  const getChildBranchesCount = useCallback(
    async (sessionId: string | number): Promise<number> => {
      const parentId = Number(sessionId);
      const countChildren = (id: number): number => {
        const children = sessions.filter(s => s.parentChatId === id);
        return children.reduce((total, child) => total + 1 + countChildren(child.id), 0);
      };
      return countChildren(parentId);
    },
    [sessions]
  );

  // 删除会话及其所有子分支（服务端级联）
  const deleteSession = useCallback(
    async (sessionId: string | number) => {
      const chatId = Number(sessionId);
      if (!Number.isInteger(chatId) || chatId <= 0) {
        return;
      }
      try {
        await deleteChat(chatId);
      } catch (error) {
        console.warn("[useChatSessions] 删除会话失败:", error);
        return;
      }

      const idsToDelete = new Set<number>([chatId]);
      const collectIds = (id: number) => {
        sessions
          .filter(s => s.parentChatId === id)
          .forEach(child => {
            idsToDelete.add(child.id);
            collectIds(child.id);
          });
      };
      collectIds(chatId);

      // 被删会话的待保存快照直接丢弃，避免向已删除行写入
      discardPendingSave(idsToDelete);
      // 其余会话的待保存内容先行落盘
      flushPendingSave();

      const updatedSessions = sessions.filter(session => !idsToDelete.has(session.id));
      setSessions(updatedSessions);

      if (idsToDelete.has(currentSessionIdRef.current ?? -1)) {
        if (updatedSessions.length > 0) {
          const firstSession = updatedSessions[0];
          try {
            const detail = await loadSessionDetail(firstSession.id);
            setCurrentSession(detail.session);
            currentSessionIdRef.current = firstSession.id;
            setMessages(detail.messages);
          } catch {
            setCurrentSession(firstSession);
            currentSessionIdRef.current = firstSession.id;
            setMessages([]);
          }
        } else {
          await createSession();
        }
      }
    },
    [sessions, loadSessionDetail, createSession, discardPendingSave, flushPendingSave]
  );

  // 更新会话标题（增量提交：只改 title，messages 等字段由桌面端保留现值）
  const updateSessionTitle = useCallback(async (sessionId: string | number, newTitle: string) => {
    const chatId = Number(sessionId);
    if (!Number.isInteger(chatId) || chatId <= 0) {
      return;
    }
    try {
      const updated = await updateChat({
        id: chatId,
        title: newTitle,
        titleDirty: true,
      });
      const next = toSessionMeta(updated);
      setSessions(prev => prev.map(s => (s.id === chatId ? next : s)));
      setCurrentSession(prev => (prev.id === chatId ? next : prev));
    } catch (error) {
      console.warn("[useChatSessions] 更新标题失败:", error);
    }
  }, []);

  // 切换会话
  const selectSession = useCallback(
    async (sessionId: string | number) => {
      const chatId = Number(sessionId);
      if (chatId === currentSessionIdRef.current) {
        return;
      }
      const session = sessions.find(s => s.id === chatId);
      if (!session) {
        return;
      }

      // 先落盘当前会话的待保存消息，再切换（防止 debounce 到点后写入新会话）
      flushPendingSave();
      setCurrentSession(session);
      currentSessionIdRef.current = session.id;
      setIsLoading(true);

      try {
        const detail = await loadSessionDetail(session.id);
        setCurrentSession(detail.session);
        setMessages(detail.messages);
      } catch (error) {
        console.warn("[useChatSessions] 加载会话失败:", error);
        setMessages([]);
      } finally {
        setIsLoading(false);
      }
    },
    [sessions, loadSessionDetail, flushPendingSave]
  );

  // 删除单条消息
  const deleteMessage = useCallback(
    (messageIndex: number) => {
      if (messageIndex < 0 || messageIndex >= messages.length) {
        return;
      }

      const updatedMessages = [...messages];
      updatedMessages.splice(messageIndex, 1);

      // 如果删除的是用户消息，同时删除其后的助手回复
      if (
        messageIndex < updatedMessages.length &&
        updatedMessages[messageIndex]?.role === "assistant"
      ) {
        updatedMessages.splice(messageIndex, 1);
      }

      setMessages(updatedMessages);
      saveMessages(updatedMessages);
    },
    [messages, saveMessages]
  );

  // 重新生成消息（删除当前消息及之后的所有消息，然后重新发送）
  const regenerateMessage = useCallback(
    (
      messageIndex: number,
      sendCallback: (
        content: string | MessageContentItem[],
        baseMessages: ChatMessageType[]
      ) => void
    ) => {
      if (messageIndex < 0 || messageIndex >= messages.length) {
        return;
      }

      const message = messages[messageIndex];
      if (message.role !== "user") {
        return;
      }

      const userMessage = message as ChatMessageType & {
        requestContent?: MessageContentItem[];
      };
      const userContent =
        userMessage.requestContent && userMessage.requestContent.length > 0
          ? userMessage.requestContent
          : message.content;

      const updatedMessages = messages.slice(0, messageIndex);
      setMessages(updatedMessages);
      saveMessages(updatedMessages);

      sendCallback(userContent, updatedMessages);
    },
    [messages, saveMessages]
  );

  // 创建分支（从某条消息处创建新会话）
  const createBranch = useCallback(
    async (messageIndex: number) => {
      const parentId = currentSessionIdRef.current;
      if (!parentId || messageIndex < 0 || messageIndex >= messages.length) {
        return;
      }

      const branchMessages = messages.slice(0, messageIndex + 1);
      const siblingCount = sessions.filter(s => s.parentChatId === parentId).length;

      try {
        const created = await branchChat({
          parentChatId: parentId,
          messages: withSystemPrompt(toStoredMessages(branchMessages), systemPromptRef.current),
          title: `分支 ${siblingCount + 1}`,
        });

        // 先落盘旧会话待保存内容，再切换到新分支
        flushPendingSave();
        const nextSession = toSessionMeta(created, systemPromptRef.current);
        setSessions(prev => [nextSession, ...prev]);
        setCurrentSession(nextSession);
        currentSessionIdRef.current = created.id;
        setMessages(branchMessages);
      } catch (error) {
        console.warn("[useChatSessions] 创建分支失败:", error);
      }
    },
    [messages, sessions, flushPendingSave]
  );

  // URL / 连接状态变化时重新加载会话列表
  useEffect(() => {
    if (!url) {
      flushPendingSave();
      setSessions([]);
      setCurrentSession(DEFAULT_SESSION);
      currentSessionIdRef.current = null;
      setMessages([]);
      setIsLoading(false);
      return;
    }

    currentUrlRef.current = url;

    if (!connected) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    (async () => {
      try {
        const loaded = await loadSessions(url);
        if (cancelled) {
          return;
        }

        if (loaded.length > 0) {
          setSessions(loaded);
          // 刷新（重连/迁移事件）时优先恢复用户当前正在看的会话，避免被切走
          const currentId = currentSessionIdRef.current;
          const target = loaded.find(session => session.id === currentId) ?? loaded[0];
          if (target.id !== currentId) {
            currentSessionIdRef.current = target.id;
          }
          const detail = await loadSessionDetail(target.id);
          if (cancelled) {
            return;
          }
          setCurrentSession(detail.session);
          currentSessionIdRef.current = target.id;
          setMessages(detail.messages);
        } else {
          // 该 URL 首次使用：创建初始会话（对齐旧行为，保证首条消息可落库）
          const groupId = await ensureGroupForUrl(url);
          if (groupId === null || cancelled) {
            return;
          }
          const created = await createChat({
            messages: [],
            title: "对话 1",
            groupId,
          });
          if (cancelled) {
            return;
          }
          const initialSession = toSessionMeta(created);
          setSessions([initialSession]);
          setCurrentSession(initialSession);
          currentSessionIdRef.current = created.id;
          systemPromptRef.current = undefined;
          setMessages([]);
        }
      } catch (error) {
        console.warn("[useChatSessions] 加载会话列表失败:", error);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      // URL 切换/卸载前落盘待保存消息（异步执行，失败仅告警）
      flushPendingSave();
    };
  }, [url, connected, refreshKey, loadSessions, loadSessionDetail, flushPendingSave]);

  return {
    sessions,
    currentSession,
    messages,
    isLoading,
    createSession,
    ensureSessionSystemPrompt,
    deleteSession,
    updateSessionTitle,
    selectSession,
    saveMessages,
    getChildBranchesCount,
    deleteMessage,
    regenerateMessage,
    createBranch,
  };
}
