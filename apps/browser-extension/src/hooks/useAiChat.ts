import { useState, useRef, useCallback, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import WebSocketClient from "@/utils/WebSocketClient";
import { AI_SERVER_MAIN_WS_URL, AI_SERVER_WS_URL } from "@/utils/aiServerAddress";
import { BROWSER_TOOLS } from "@/services/extToolServer";
import { toDisplayMessages } from "@/services/chatModelBridge";
import type {
  AiRunApprovalRequest,
  AiRunEventNotification,
  AiRunQuestionRequest,
  AiRunSnapshot,
  AiRunStartParams,
  AiRunStateResult,
  ChatMessageType,
  MessageContentItem,
  ResponseMessage,
  ToolCallPayload,
} from "@tau/shared";
import {
  AI_RUN_METHODS,
  applyChatStreamEvent,
  createAssistantMessage,
  createRunEventFilter,
  getAssistantContentBlocks,
} from "@tau/shared";

// 重新导出共享类型
export type {
  ChatMessageType as ChatMessage,
  ContentBlock,
  ToolCallExecutionState,
} from "@tau/shared";

// 消息角色（扩展支持 tool 角色）
export type Role = "user" | "assistant" | "system" | "tool";

// AI 聊天选项
interface UseAiChatOptions {
  enableTools?: boolean;
  /** v1 遗留，v2 不再使用（对话身份由 session 决定） */
  conversationKey?: string;
  systemPrompt?: string;
  initialMessages?: ChatMessageType[];
  onMessagesChange?: (messages: ChatMessageType[]) => void;
  /**
   * 持久对话（M4.5，侧栏）：对话落在桌面按页面存放的 pi 会话文件里，每轮只发本轮的用户消息，
   * 历史由桌面从文件恢复。不传则为一次性调用（概览页、行内问答：带全量历史）。
   */
  session?: { id: string; pageUrl: string };
  /** 一轮结束（含失败）：持久对话据此重读投影 */
  onFinish?: () => void;
  wsClient?: WebSocketClient | null;
  wsConnected?: boolean;
}

export type AiChatRequestContent = string | MessageContentItem[];

export interface AiChatRequestMessage {
  role: Role;
  content: AiChatRequestContent;
  reasoning_content?: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCallPayload[];
}

interface SendRequestMessageOptions {
  requestMessage: AiChatRequestMessage;
  baseMessages?: ChatMessageType[];
  extraHistoryMessages?: AiChatRequestMessage[];
  persistRequestMessage?: boolean;
}

type ChatMessageWithToolContext = ChatMessageType & {
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCallPayload[];
  requestContent?: MessageContentItem[];
};

interface BuildAiRunStartOptions {
  runId: string;
  messages: AiChatRequestMessage[];
  systemPrompt?: string;
  enableTools: boolean;
  /** 持久对话：桌面按页面 + 会话 id 从文件恢复会话 */
  session?: { id: string; pageUrl: string };
  pageContext?: {
    url: string;
    title: string;
    content?: string;
  };
}

export type AiRunRetryStatus = { attempt: number; maxAttempts: number; delayMs: number } | null;
export interface AiRunInteractions {
  approvals: AiRunApprovalRequest[];
  questions: AiRunQuestionRequest[];
}
const EMPTY_INTERACTIONS: AiRunInteractions = { approvals: [], questions: [] };

export const mapChatMessageToAiRequestMessage = (
  message: ChatMessageType
): AiChatRequestMessage => {
  const source = message as ChatMessageWithToolContext;
  if (source.role === "user") {
    const requestContent =
      Array.isArray(source.requestContent) && source.requestContent.length > 0
        ? source.requestContent
        : source.content || "";

    return {
      role: "user",
      content: requestContent,
    };
  }

  if (source.role === "tool") {
    return {
      role: "tool",
      content: source.content || "",
      name: source.name,
      tool_call_id: source.tool_call_id,
    };
  }

  const retiredExecutions =
    source.contentBlocks?.flatMap(block =>
      block.type === "tool_calls"
        ? block.executions.filter(
            execution => typeof execution.metadata?.codexItemType === "string"
          )
        : []
    ) ?? [];
  if (source.role === "assistant" && retiredExecutions.length > 0) {
    return {
      role: "assistant",
      content: [
        source.content,
        ...retiredExecutions.map(
          execution =>
            `历史工具 ${execution.toolName}\n${execution.output || execution.error || "[无输出]"}`
        ),
      ]
        .filter(Boolean)
        .join("\n\n"),
    };
  }
  if (source.role === "assistant" && source.tool_calls?.length) {
    return {
      role: "assistant",
      content: source.content || "",
      ...(typeof source.reasoning === "string" ? { reasoning_content: source.reasoning } : {}),
      tool_calls: source.tool_calls,
    };
  }

  return {
    role: source.role,
    content: source.content || "",
    ...(source.role === "assistant" && typeof source.reasoning === "string"
      ? { reasoning_content: source.reasoning }
      : {}),
  };
};

/**
 * v2 运行参数（M5）。扩展页面工具随请求带上（扩展本地执行）；提问走桌面宿主原生，
 * 所以不再把扩展本地的 ask-question 当页面工具带过去。
 */
export const buildAiRunStartParams = ({
  runId,
  messages,
  systemPrompt,
  enableTools,
  session,
  pageContext,
}: BuildAiRunStartOptions): AiRunStartParams => ({
  runId,
  messages: messages as AiRunStartParams["messages"],
  ...(systemPrompt ? { systemPrompt } : {}),
  enableTools,
  ...(session ? { session } : {}),
  ...(enableTools ? { browserTools: BROWSER_TOOLS } : {}),
  ...(pageContext ? { pageContext } : {}),
});

const buildMessagePreview = (content: AiChatRequestContent): string => {
  if (typeof content === "string") {
    return content;
  }

  return content
    .map(item => {
      if (item.type === "text") {
        return item.text;
      }
      if (item.type === "image") {
        return "[图片]";
      }
      if (item.type === "file") {
        return item.fileName ? `[文件: ${item.fileName}]` : "[文件]";
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
};

/** 本轮的请求消息 → 界面上的用户消息（发送时与接回时同一形状） */
const toRequestDisplayMessage = (requestMessage: AiChatRequestMessage): ChatMessageType =>
  ({
    id: uuidv4(),
    role: requestMessage.role,
    content: buildMessagePreview(requestMessage.content),
    timestamp: Date.now(),
    ...(requestMessage.name ? { name: requestMessage.name } : {}),
    ...(requestMessage.tool_call_id ? { tool_call_id: requestMessage.tool_call_id } : {}),
    ...(requestMessage.tool_calls?.length ? { tool_calls: requestMessage.tool_calls } : {}),
    ...(requestMessage.role === "user" && Array.isArray(requestMessage.content)
      ? { requestContent: requestMessage.content }
      : {}),
  }) as ChatMessageType;

const toAssistantDisplayMessage = (id: string, response: ResponseMessage): ChatMessageType => ({
  id,
  role: "assistant",
  content: response.content,
  reasoning: response.reasoning_content || undefined,
  contentBlocks: getAssistantContentBlocks(response),
  timestamp: Date.now(),
});

/**
 * 侧栏重开 / 切回在跑的对话时的界面：这一轮之前的对话 + 这一轮的提问 + 到此刻的回答。
 * 回答是桌面归约好的快照，之后的事件在同一对象上继续归约。
 */
export const buildResumedMessages = (
  snapshot: AiRunSnapshot,
  assistantId: string
): ChatMessageType[] => {
  const request = snapshot.request as unknown as AiChatRequestMessage;
  return [
    ...toDisplayMessages(snapshot.baseMessages),
    toRequestDisplayMessage({ role: "user", content: request.content ?? "" }),
    toAssistantDisplayMessage(assistantId, snapshot.response),
  ];
};

/**
 * AI 聊天 Hook
 */
export function useAiChat(options: UseAiChatOptions = {}) {
  const {
    enableTools = true,
    conversationKey,
    systemPrompt,
    initialMessages = [],
    onMessagesChange,
    session,
    onFinish,
    wsClient: externalWsClient = null,
    wsConnected,
  } = options;
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  // 状态
  const [messages, setMessages] = useState<ChatMessageType[]>(initialMessages);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const [isMainConnected, setIsMainConnected] = useState(false);
  const [retryStatus, setRetryStatus] = useState<AiRunRetryStatus>(null);
  const [interactions, setInteractions] = useState<AiRunInteractions>(EMPTY_INTERACTIONS);

  // 引用
  const wsClientRef = useRef<WebSocketClient | null>(null);
  /** 桌面主进程通道（持久对话） */
  const mainClientRef = useRef<WebSocketClient | null>(null);
  /** 当前这轮走的通道（停止/审批/作答发回同一处） */
  const runClientRef = useRef<WebSocketClient | null>(null);
  const runFilterRef = useRef<ReturnType<typeof createRunEventFilter> | null>(null);
  const requestIdRef = useRef<string | null>(null);
  // 当前流式响应（统一模型）：块组装走 @tau/shared 的 applyChatStreamEvent，
  // 渲染投影为 ChatMessageType 时才复制，ref 内可自由原地更新
  const currentResponseRef = useRef<ResponseMessage | null>(null);
  const currentResponseIdRef = useRef<string>("");
  /** 接回在跑的一轮时，ai.run.state 响应之前收到的事件（非 null = 正在查询） */
  const resumeBufferRef = useRef<AiRunEventNotification[] | null>(null);

  // 更新消息并通知外部
  const updateMessages = useCallback(
    (newMessages: ChatMessageType[]) => {
      setMessages(newMessages);
      if (onMessagesChange) {
        onMessagesChange(newMessages);
      }
    },
    [onMessagesChange]
  );

  // 把统一模型投影为渲染层消息（ChatMessageType）
  const updateCurrentResponse = useCallback(() => {
    const response = currentResponseRef.current;
    if (!response) {
      return;
    }
    setMessages(prev => {
      const lastMsg = prev[prev.length - 1];
      if (lastMsg?.role === "assistant") {
        const newMessages: ChatMessageType[] = [
          ...prev.slice(0, -1),
          {
            ...lastMsg,
            content: response.content,
            reasoning: response.reasoning_content || undefined,
            contentBlocks: getAssistantContentBlocks(response),
          },
        ];
        if (onMessagesChange) {
          onMessagesChange(newMessages);
        }
        return newMessages;
      }
      return prev;
    });
  }, [onMessagesChange]);

  useEffect(() => {
    if (typeof wsConnected === "boolean") {
      setIsConnected(wsConnected);
      return;
    }
    if (externalWsClient) {
      setIsConnected(externalWsClient.isConnected);
    }
  }, [externalWsClient, wsConnected]);

  /** 一轮结束（settled、断连、发起失败）：收尾状态并通知持久对话重读投影 */
  const finishRun = useCallback(() => {
    if (currentResponseRef.current) {
      currentResponseRef.current.assistant_blocks?.forEach(block => {
        block.state = "final";
      });
      updateCurrentResponse();
    }
    setIsLoading(false);
    setRetryStatus(null);
    setInteractions(EMPTY_INTERACTIONS);
    requestIdRef.current = null;
    runFilterRef.current = null;
    runClientRef.current = null;
    onFinishRef.current?.();
  }, [updateCurrentResponse]);

  /**
   * 放下当前这一轮但不停止它（切到别的对话、通道重建）：桌面照常跑完落盘，
   * 切回来或重开时经 ai.run.state 接回。
   */
  const detachRun = useCallback(() => {
    resumeBufferRef.current = null;
    if (!requestIdRef.current) return;
    requestIdRef.current = null;
    runFilterRef.current = null;
    runClientRef.current = null;
    currentResponseRef.current = null;
    setIsLoading(false);
    setRetryStatus(null);
    setInteractions(EMPTY_INTERACTIONS);
  }, []);

  // v2 运行事件 → 统一流事件 → 归约器（快照幂等，与桌面本地同一套块组装逻辑）
  const handleRunEvent = useCallback(
    (data: unknown) => {
      // 正在查询在跑的那一轮：快照回来之前到达的事件先攒着，拿到 lastSeq 后再按序补上
      if (!runFilterRef.current && resumeBufferRef.current) {
        resumeBufferRef.current.push(data as AiRunEventNotification);
        return;
      }
      const event = runFilterRef.current?.(data as AiRunEventNotification);
      if (!event) return;
      const response = currentResponseRef.current;
      switch (event.type) {
        case "text":
        case "reasoning":
        case "tool-calls":
        case "turn-finish":
          if (!response) return;
          applyChatStreamEvent(response, event);
          updateCurrentResponse();
          return;
        case "usage":
          return;
        case "retry":
          setRetryStatus(event.status);
          return;
        case "error":
          setError(event.message);
          return;
        case "interactions":
          setInteractions({ approvals: event.approvals, questions: event.questions });
          return;
        case "settled":
          if (event.error) setError(event.error);
          else if (event.ok) setError(null);
          finishRun();
      }
    },
    [finishRun, updateCurrentResponse]
  );

  const handleServerGone = useCallback(() => {
    if (!requestIdRef.current) return;
    setError("与桌面端的连接断开，这次回答没有完成");
    finishRun();
  }, [finishRun]);

  // 初始化/绑定 WebSocket 客户端（支持复用外部连接）
  useEffect(() => {
    const useExternalClient = Boolean(externalWsClient);
    const client = externalWsClient || new WebSocketClient(AI_SERVER_WS_URL);

    if (!useExternalClient) {
      client.onOpenHandler = () => {
        console.log("[useAiChat] 已连接到 AI 服务");
        setIsConnected(true);
      };
      client.onCloseHandler = () => {
        console.log("[useAiChat] AI 服务连接断开");
        setIsConnected(false);
      };
      client.connect();
    } else if (typeof wsConnected !== "boolean") {
      setIsConnected(client.isConnected);
    }

    client.registerNotificationHandler(AI_RUN_METHODS.event, handleRunEvent);
    // 服务端（渲染窗口）走了：当前这轮不会再有事件，立即收尾（v1 要干等 600 秒超时）
    client.registerNotificationHandler("server-gone", handleServerGone);
    wsClientRef.current = client;

    return () => {
      client.unregisterNotificationHandler(AI_RUN_METHODS.event, handleRunEvent);
      client.unregisterNotificationHandler("server-gone", handleServerGone);

      if (!useExternalClient) {
        client.onOpenHandler = null;
        client.onCloseHandler = null;
        client.disconnect();
      }

      if (wsClientRef.current === client) {
        wsClientRef.current = null;
      }
    };
  }, [externalWsClient, wsConnected, handleRunEvent, handleServerGone]);

  // 持久对话的通道：桌面主进程 /aiServerMain（侧栏会话才用；一次性调用不连）
  useEffect(() => {
    if (!session) return;
    const client = new WebSocketClient(AI_SERVER_MAIN_WS_URL);
    client.onOpenHandler = () => setIsMainConnected(true);
    client.onCloseHandler = () => {
      setIsMainConnected(false);
      handleServerGone();
    };
    client.registerNotificationHandler(AI_RUN_METHODS.event, handleRunEvent);
    client.registerNotificationHandler("server-gone", handleServerGone);
    client.connect();
    mainClientRef.current = client;
    // 断线自动重连（桌面重启、主进程桥晚于侧栏起来）
    const timer = setInterval(() => {
      if (!client.isConnected) client.connect();
    }, 3000);
    return () => {
      clearInterval(timer);
      client.unregisterNotificationHandler(AI_RUN_METHODS.event, handleRunEvent);
      client.unregisterNotificationHandler("server-gone", handleServerGone);
      client.onOpenHandler = null;
      client.onCloseHandler = null;
      client.disconnect();
      if (mainClientRef.current === client) mainClientRef.current = null;
      setIsMainConnected(false);
    };
    // session 对象每次渲染可能是新的：按 id + 页面建连
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, session?.pageUrl, handleRunEvent, handleServerGone]);

  // 换了对话：上一个对话在跑的那轮放下不停（桌面跑完落盘，切回来再接回）
  useEffect(() => {
    if (!session) return;
    return () => detachRun();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, session?.pageUrl, detachRun]);

  /**
   * 接回在跑的一轮（M5 遗留）：侧栏关掉重开、切回在跑的对话、桌面通道重连后，问桌面这个对话是否
   * 还在跑；在跑就用快照还原界面（提问 + 到此刻的回答 + 审批/提问 + 重试状态），之后的事件按 seq 续接。
   * 查询期间到达的事件先攒着（快照之后的补上，之前的丢弃），不会漏也不会重。
   */
  useEffect(() => {
    const client = mainClientRef.current;
    if (!session || !isMainConnected || !client?.isConnected || requestIdRef.current) return;
    const current = { id: session.id, pageUrl: session.pageUrl };
    let cancelled = false;
    // 每次查询一份缓冲：作废的旧查询晚到时不能动新查询的缓冲
    const buffered: AiRunEventNotification[] = [];
    resumeBufferRef.current = buffered;
    void client
      .sendRequest(AI_RUN_METHODS.state, { session: current }, 10 * 1000)
      .then(result => {
        // 已经换了对话：这个结果作废（缓冲归新查询管）
        if (cancelled) return;
        resumeBufferRef.current = null;
        const { snapshot } = (result ?? {}) as AiRunStateResult;
        // 查询期间自己发起了新一轮：以自己这轮为准
        if (requestIdRef.current || !snapshot) return;
        const assistantId = uuidv4();
        requestIdRef.current = snapshot.runId;
        runFilterRef.current = createRunEventFilter(snapshot.runId, snapshot.lastSeq);
        runClientRef.current = client;
        currentResponseIdRef.current = assistantId;
        currentResponseRef.current = snapshot.response;
        setError(null);
        setIsLoading(true);
        setRetryStatus(snapshot.retry);
        setInteractions(snapshot.interactions);
        updateMessages(buildResumedMessages(snapshot, assistantId));
        buffered.forEach(handleRunEvent);
      })
      .catch(error => {
        if (cancelled) return;
        resumeBufferRef.current = null;
        console.warn("[useAiChat] 查询在跑的回答失败:", error);
      });
    return () => {
      cancelled = true;
      if (resumeBufferRef.current === buffered) resumeBufferRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, session?.pageUrl, isMainConnected, handleRunEvent, updateMessages]);

  const mapMessageToRequest = useCallback(
    (message: ChatMessageType): AiChatRequestMessage => mapChatMessageToAiRequestMessage(message),
    []
  );

  const sendRequestMessage = useCallback(
    async ({
      requestMessage,
      baseMessages,
      extraHistoryMessages = [],
      persistRequestMessage = true,
    }: SendRequestMessageOptions): Promise<boolean> => {
      if (isLoading) {
        return false;
      }

      setError(null);
      setIsLoading(true);

      const currentMessages = baseMessages ?? messages;
      const requestId = uuidv4();
      requestIdRef.current = requestId;
      // 先按 runId 订阅再发起：最早的事件可能先于 start 的响应到达
      runFilterRef.current = createRunEventFilter(requestId);

      const assistantMessageId = uuidv4();
      currentResponseIdRef.current = assistantMessageId;
      currentResponseRef.current = createAssistantMessage();

      const assistantMessage: ChatMessageType = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        contentBlocks: [],
        timestamp: Date.now(),
      };

      const persistedRequestMessage: ChatMessageType | null = persistRequestMessage
        ? toRequestDisplayMessage(requestMessage)
        : null;

      const newMessages = persistedRequestMessage
        ? [...currentMessages, persistedRequestMessage, assistantMessage]
        : [...currentMessages, assistantMessage];
      updateMessages(newMessages);

      // 持久对话只发本轮的用户消息（历史在桌面的会话文件里）；一次性调用带全量历史
      const requestMessages: AiChatRequestMessage[] = session
        ? [requestMessage]
        : [...currentMessages.map(mapMessageToRequest), ...extraHistoryMessages];
      if (!session && persistRequestMessage) {
        requestMessages.push(requestMessage);
      }

      // 持久对话由桌面主进程驱动（渲染层重载不中断）；一次性调用走渲染端 aiServer
      const runClient = session ? mainClientRef.current : wsClientRef.current;
      if (!runClient?.isConnected) {
        setError(session ? "桌面端未连接" : "AI 服务未连接");
        finishRun();
        return false;
      }
      runClientRef.current = runClient;
      try {
        const pageContext = await getCurrentPageContext();
        await runClient.sendRequest(
          AI_RUN_METHODS.start,
          buildAiRunStartParams({
            runId: requestId,
            messages: requestMessages,
            systemPrompt,
            enableTools,
            ...(session ? { session } : {}),
            pageContext,
          }),
          30 * 1000
        );
        return true;
      } catch (error) {
        setError((error as Error).message);
        finishRun();
        return false;
      }
    },
    [
      mapMessageToRequest,
      messages,
      isConnected,
      isLoading,
      systemPrompt,
      enableTools,
      session,
      updateMessages,
      finishRun,
    ]
  );

  // 发送用户文本消息
  const sendMessage = useCallback(
    async (content: string, baseMessages?: ChatMessageType[]) => {
      await sendRequestMessage({
        requestMessage: {
          role: "user",
          content,
        },
        baseMessages,
      });
    },
    [sendRequestMessage]
  );

  // 清空消息
  const clearMessages = useCallback(() => {
    updateMessages([]);
    setError(null);
  }, [updateMessages]);

  // 停止生成：通知桌面真正停下（v1 只清本地状态，桌面会一直跑完）；收尾等 settled
  const stopGeneration = useCallback(() => {
    const runId = requestIdRef.current;
    const client = runClientRef.current;
    if (!runId || !client?.isConnected) {
      finishRun();
      return;
    }
    client.sendRequest(AI_RUN_METHODS.abort, { runId }, 10 * 1000).catch(() => finishRun());
  }, [finishRun]);

  /** 审批（宿主原生，M5）：允许 / 本会话始终允许 / 拒绝 */
  const approveTool = useCallback(
    async (requestId: string, choice: "allow" | "allow-session" | "deny") => {
      const runId = requestIdRef.current;
      if (!runId || !runClientRef.current?.isConnected) return;
      await runClientRef.current.sendRequest(
        AI_RUN_METHODS.approve,
        { runId, requestId, choice },
        10 * 1000
      );
    },
    []
  );

  /** 回答提问（宿主原生，M5）：答案不合规时抛错，调用方提示 */
  const answerQuestion = useCallback(async (requestId: string, answers: unknown) => {
    const runId = requestIdRef.current;
    if (!runId || !runClientRef.current?.isConnected) throw new Error("这轮回答已结束");
    await runClientRef.current.sendRequest(
      AI_RUN_METHODS.answer,
      { runId, requestId, answers },
      10 * 1000
    );
  }, []);

  // 当 initialMessages 变化时更新本地状态。一轮在跑（含接回的）时不覆盖：会话文件的投影缺本轮
  // 还没落盘的部分，这一轮结束后 onFinish 重读投影再对齐
  useEffect(() => {
    if (requestIdRef.current) return;
    setMessages(initialMessages);
  }, [initialMessages]);

  return {
    messages,
    isLoading,
    error,
    retryStatus,
    interactions,
    isConnected: session ? isMainConnected : isConnected,
    sendMessage,
    sendRequestMessage,
    clearMessages,
    stopGeneration,
    approveTool,
    answerQuestion,
  };
}

async function getCurrentPageContext(): Promise<
  | {
      url: string;
      title: string;
      content?: string;
    }
  | undefined
> {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tab?.id || !tab.url || !tab.title) {
      return undefined;
    }

    return {
      url: tab.url,
      title: tab.title,
    };
  } catch {
    return undefined;
  }
}

export default useAiChat;
