import { useState, useEffect, useCallback, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import type { ChatSession } from "../types/chat-session";
import type { ChatMessageType } from "@tau/shared";

interface UseChatSessionsReturn {
  sessions: ChatSession[];
  currentSession: ChatSession;
  messages: ChatMessageType[];
  isLoading: boolean;
  createSession: () => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  updateSessionTitle: (sessionId: string, title: string) => Promise<void>;
  selectSession: (sessionId: string) => Promise<void>;
  saveMessages: (messages: ChatMessageType[]) => void;
  getChildBranchesCount: (sessionId: string) => Promise<number>;
  deleteMessage: (messageIndex: number) => void;
  regenerateMessage: (
    messageIndex: number,
    sendCallback: (content: string, baseMessages: ChatMessageType[]) => void,
  ) => void;
  createBranch: (messageIndex: number) => Promise<void>;
}

const STORAGE_PREFIX_META = "tau-chats-meta:";
const STORAGE_PREFIX_MESSAGES = "tau-chat-messages:";

// 默认的空会话（用于初始化状态）
const DEFAULT_SESSION: ChatSession = {
  id: "0",
  title: "新对话",
  createTime: Date.now(),
  updateTime: Date.now(),
};

export function useChatSessions(url: string | null): UseChatSessionsReturn {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSession, setCurrentSession] =
    useState<ChatSession>(DEFAULT_SESSION);
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentUrlRef = useRef(url);
  const currentSessionIdRef = useRef<string | null>(null);

  // 加载会话列表元数据
  const loadSessionsMeta = useCallback(async (url: string) => {
    try {
      const key = `${STORAGE_PREFIX_META}${url}`;
      const result = await chrome.storage.local.get(key);
      const sessionsMeta = result[key] as ChatSession[] | undefined;

      return sessionsMeta && sessionsMeta.length > 0 ? sessionsMeta : [];
    } catch (error) {
      console.error("Failed to load sessions meta:", error);
      return [];
    }
  }, []);

  // 加载单个会话的消息
  const loadSessionMessages = useCallback(async (sessionId: string) => {
    try {
      const key = `${STORAGE_PREFIX_MESSAGES}${sessionId}`;
      const result = await chrome.storage.local.get(key);
      const sessionMessages = result[key] as ChatMessageType[] | undefined;

      return sessionMessages || [];
    } catch (error) {
      console.error("Failed to load session messages:", error);
      return [];
    }
  }, []);

  // 保存会话元数据列表
  const saveSessionsMeta = useCallback(
    async (url: string, sessionsMeta: ChatSession[]) => {
      try {
        const key = `${STORAGE_PREFIX_META}${url}`;
        await chrome.storage.local.set({ [key]: sessionsMeta });
      } catch (error) {
        console.error("Failed to save sessions meta:", error);
      }
    },
    [],
  );

  // 保存会话消息（带 debounce）
  const saveMessages = useCallback((newMessages: ChatMessageType[]) => {
    const sessionId = currentSessionIdRef.current;
    if (!sessionId || sessionId === "0" || !currentUrlRef.current) return;

    // 清除之前的定时器
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    // 设置新的定时器（1s debounce）
    saveTimerRef.current = setTimeout(async () => {
      try {
        const messagesKey = `${STORAGE_PREFIX_MESSAGES}${sessionId}`;
        await chrome.storage.local.set({ [messagesKey]: newMessages });

        // 更新元数据的 updateTime
        const metaKey = `${STORAGE_PREFIX_META}${currentUrlRef.current}`;
        const result = await chrome.storage.local.get(metaKey);
        const sessionsMeta = (result[metaKey] || []) as ChatSession[];

        const updatedMeta = sessionsMeta.map((session) =>
          session.id === sessionId
            ? { ...session, updateTime: Date.now() }
            : session,
        );

        await chrome.storage.local.set({ [metaKey]: updatedMeta });
        setSessions(updatedMeta);
      } catch (error) {
        console.error("Failed to save session messages:", error);
      }
    }, 1000);

    // 立即更新本地 messages 以保持 UI 响应
    setMessages(newMessages);
  }, []);

  // 创建新会话
  const createSession = useCallback(async () => {
    if (!currentUrlRef.current) return;

    const nextIndex = sessions.length + 1;
    const newSession: ChatSession = {
      id: uuidv4(),
      title: `对话 ${nextIndex}`,
      createTime: Date.now(),
      updateTime: Date.now(),
    };

    const updatedSessions = [...sessions, newSession];
    setSessions(updatedSessions);
    await saveSessionsMeta(currentUrlRef.current, updatedSessions);

    // 自动切换到新会话
    setCurrentSession(newSession);
    currentSessionIdRef.current = newSession.id;
    setMessages([]);

    // 立即保存空消息数组
    const messagesKey = `${STORAGE_PREFIX_MESSAGES}${newSession.id}`;
    await chrome.storage.local.set({ [messagesKey]: [] });
  }, [sessions, saveSessionsMeta]);

  // 获取子分支数量
  const getChildBranchesCount = useCallback(
    async (sessionId: string): Promise<number> => {
      // 递归计算所有子分支（包括子分支的子分支）
      const countChildren = (parentId: string): number => {
        const children = sessions.filter((s) => s.parentChatId === parentId);
        return children.reduce(
          (total, child) => total + 1 + countChildren(child.id),
          0,
        );
      };

      return countChildren(sessionId);
    },
    [sessions],
  );

  // 删除会话及其所有子分支
  const deleteSession = useCallback(
    async (sessionId: string) => {
      if (!currentUrlRef.current) return;

      // 收集所有要删除的会话 ID（包括子分支）
      const idsToDelete: string[] = [];
      const collectIds = (id: string) => {
        idsToDelete.push(id);
        const children = sessions.filter((s) => s.parentChatId === id);
        children.forEach((child) => collectIds(child.id));
      };
      collectIds(sessionId);

      // 删除所有消息数据
      const deletePromises = idsToDelete.map((id) => {
        const messagesKey = `${STORAGE_PREFIX_MESSAGES}${id}`;
        return chrome.storage.local.remove(messagesKey);
      });
      await Promise.all(deletePromises);

      // 更新会话列表
      const updatedSessions = sessions.filter(
        (session) => !idsToDelete.includes(session.id),
      );
      setSessions(updatedSessions);
      await saveSessionsMeta(currentUrlRef.current, updatedSessions);

      // 如果删除的是当前会话，切换到第一个或创建新的
      if (idsToDelete.includes(currentSessionIdRef.current || "")) {
        if (updatedSessions.length > 0) {
          const firstSession = updatedSessions[0];
          setCurrentSession(firstSession);
          currentSessionIdRef.current = firstSession.id;
          const newMessages = await loadSessionMessages(firstSession.id);
          setMessages(newMessages);
        } else {
          // 没有会话了，创建一个新的
          await createSession();
        }
      }
    },
    [sessions, loadSessionMessages, saveSessionsMeta, createSession],
  );

  // 更新会话标题
  const updateSessionTitle = useCallback(
    async (sessionId: string, newTitle: string) => {
      if (!currentUrlRef.current) return;

      const updatedSessions = sessions.map((session) =>
        session.id === sessionId
          ? { ...session, title: newTitle, updateTime: Date.now() }
          : session,
      );

      setSessions(updatedSessions);
      await saveSessionsMeta(currentUrlRef.current, updatedSessions);

      // 如果是当前会话，也更新当前会话
      if (sessionId === currentSession.id) {
        setCurrentSession({
          ...currentSession,
          title: newTitle,
          updateTime: Date.now(),
        });
      }
    },
    [sessions, currentSession, saveSessionsMeta],
  );

  // 切换会话
  const selectSession = useCallback(
    async (sessionId: string) => {
      if (sessionId === currentSessionIdRef.current) return;

      const session = sessions.find((s) => s.id === sessionId);
      if (!session) return;

      setCurrentSession(session);
      currentSessionIdRef.current = session.id;
      setIsLoading(true);

      const newMessages = await loadSessionMessages(session.id);
      setMessages(newMessages);
      setIsLoading(false);
    },
    [sessions, loadSessionMessages],
  );

  // 删除单条消息
  const deleteMessage = useCallback(
    (messageIndex: number) => {
      if (messageIndex < 0 || messageIndex >= messages.length) return;

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
    [messages, saveMessages],
  );

  // 重新生成消息（删除当前消息及之后的所有消息，然后重新发送）
  const regenerateMessage = useCallback(
    (
      messageIndex: number,
      sendCallback: (content: string, baseMessages: ChatMessageType[]) => void,
    ) => {
      if (messageIndex < 0 || messageIndex >= messages.length) return;

      const message = messages[messageIndex];
      if (message.role !== "user") return;

      // 获取用户消息内容
      const userContent = message.content;

      // 删除该消息及之后的所有消息
      const updatedMessages = messages.slice(0, messageIndex);
      setMessages(updatedMessages);
      saveMessages(updatedMessages);

      // 重新发送用户消息，传递截断后的消息避免闭包过期
      sendCallback(userContent, updatedMessages);
    },
    [messages, saveMessages],
  );

  // 创建分支（从某条消息处创建新会话）
  const createBranch = useCallback(
    async (messageIndex: number) => {
      if (!currentUrlRef.current) return;
      if (messageIndex < 0 || messageIndex >= messages.length) return;

      // 获取分支点之前的消息（包含当前消息）
      const branchMessages = messages.slice(0, messageIndex + 1);

      // 计算同一父会话下的分支序号
      const parentId = currentSessionIdRef.current;
      const siblingBranches = sessions.filter(
        (s) => s.parentChatId === parentId,
      );
      const branchIndex = siblingBranches.length + 1;

      const newSession: ChatSession = {
        id: uuidv4(),
        title: `分支 ${branchIndex}`,
        createTime: Date.now(),
        updateTime: Date.now(),
        parentChatId: parentId || undefined,
        branchIndex,
      };

      const updatedSessions = [...sessions, newSession];
      setSessions(updatedSessions);
      await saveSessionsMeta(currentUrlRef.current, updatedSessions);

      // 保存分支消息
      const messagesKey = `${STORAGE_PREFIX_MESSAGES}${newSession.id}`;
      await chrome.storage.local.set({ [messagesKey]: branchMessages });

      // 切换到新分支
      setCurrentSession(newSession);
      currentSessionIdRef.current = newSession.id;
      setMessages(branchMessages);
    },
    [messages, sessions, saveSessionsMeta],
  );

  // URL 变化时重新加载会话列表
  useEffect(() => {
    if (!url) {
      setSessions([]);
      setCurrentSession(DEFAULT_SESSION);
      currentSessionIdRef.current = null;
      setMessages([]);
      setIsLoading(false);
      return;
    }

    currentUrlRef.current = url;
    setIsLoading(true);

    (async () => {
      const sessionsMeta = await loadSessionsMeta(url);

      if (sessionsMeta.length > 0) {
        setSessions(sessionsMeta);
        const firstSession = sessionsMeta[0];
        setCurrentSession(firstSession);
        currentSessionIdRef.current = firstSession.id;

        const sessionMessages = await loadSessionMessages(firstSession.id);
        setMessages(sessionMessages);
      } else {
        // 没有会话，创建第一个
        const initialSession: ChatSession = {
          id: uuidv4(),
          title: "对话 1",
          createTime: Date.now(),
          updateTime: Date.now(),
        };

        setSessions([initialSession]);
        setCurrentSession(initialSession);
        currentSessionIdRef.current = initialSession.id;
        setMessages([]);

        // 保存初始会话
        await saveSessionsMeta(url, [initialSession]);
        const messagesKey = `${STORAGE_PREFIX_MESSAGES}${initialSession.id}`;
        await chrome.storage.local.set({ [messagesKey]: [] });
      }

      setIsLoading(false);
    })();

    // 清理定时器
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [url, loadSessionsMeta, loadSessionMessages, saveSessionsMeta]);

  return {
    sessions,
    currentSession,
    messages,
    isLoading,
    createSession,
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
