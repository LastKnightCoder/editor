import { useState, useRef, useCallback, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import WebSocketClient from "@/utils/WebSocketClient";
import { BROWSER_TOOLS } from "@/services/extToolServer";
import type {
  ChatMessageType,
  ContentBlock,
  MessageContentItem,
  ToolCallExecutionState,
  ToolCallPayload,
} from "@tau/shared";

const WS_PORT = 24678;

// 重新导出共享类型
export type {
  ChatMessageType as ChatMessage,
  ContentBlock,
  ToolCallExecutionState,
};

// 消息角色（扩展支持 tool 角色）
export type Role = "user" | "assistant" | "system" | "tool";

// 流式通知数据类型
interface StreamNotificationData {
  requestId: string;
  content?: string;
  reasoning?: string;
  executions?: ToolCallExecutionState[];
  error?: string;
}

// AI 聊天选项
interface UseAiChatOptions {
  enableTools?: boolean;
  conversationKey?: string;
  systemPrompt?: string;
  initialMessages?: ChatMessageType[];
  onMessagesChange?: (messages: ChatMessageType[]) => void;
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

interface BuildAiChatRpcPayloadOptions {
  requestId: string;
  messages: AiChatRequestMessage[];
  systemPrompt?: string;
  enableTools: boolean;
  conversationKey?: string;
  pageContext?: {
    url: string;
    title: string;
    content?: string;
  };
}

export const mapChatMessageToAiRequestMessage = (
  message: ChatMessageType,
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

  if (source.role === "assistant" && source.tool_calls?.length) {
    return {
      role: "assistant",
      content: source.content || "",
      ...(typeof source.reasoning === "string"
        ? { reasoning_content: source.reasoning }
        : {}),
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

export const buildAiChatRpcPayload = ({
  requestId,
  messages,
  systemPrompt,
  enableTools,
  conversationKey,
  pageContext,
}: BuildAiChatRpcPayloadOptions) => ({
  requestId,
  messages,
  systemPrompt,
  enableTools,
  conversationKey,
  browserTools: enableTools ? BROWSER_TOOLS : undefined,
  pageContext,
});

const buildMessagePreview = (content: AiChatRequestContent): string => {
  if (typeof content === "string") {
    return content;
  }

  return content
    .map((item) => {
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
    wsClient: externalWsClient = null,
    wsConnected,
  } = options;

  // 状态
  const [messages, setMessages] = useState<ChatMessageType[]>(initialMessages);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // 引用
  const wsClientRef = useRef<WebSocketClient | null>(null);
  const requestIdRef = useRef<string | null>(null);
  const currentResponseRef = useRef<{
    content: string;
    reasoning: string;
    contentBlocks: ContentBlock[];
  }>({ content: "", reasoning: "", contentBlocks: [] });

  // 更新消息并通知外部
  const updateMessages = useCallback(
    (newMessages: ChatMessageType[]) => {
      setMessages(newMessages);
      if (onMessagesChange) {
        onMessagesChange(newMessages);
      }
    },
    [onMessagesChange],
  );

  // 更新当前响应消息
  const updateCurrentResponse = useCallback(() => {
    setMessages((prev) => {
      const lastMsg = prev[prev.length - 1];
      if (lastMsg?.role === "assistant") {
        const newMessages = [
          ...prev.slice(0, -1),
          {
            ...lastMsg,
            content: currentResponseRef.current.content,
            reasoning: currentResponseRef.current.reasoning,
            contentBlocks: [...currentResponseRef.current.contentBlocks],
          },
        ];
        // 通知外部消息变化
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

  // 初始化/绑定 WebSocket 客户端（支持复用外部连接）
  useEffect(() => {
    const useExternalClient = Boolean(externalWsClient);
    const client =
      externalWsClient ||
      new WebSocketClient(`ws://localhost:${WS_PORT}/aiServer`);

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

    const handleTextStream = (data: unknown) => {
      const notification = data as StreamNotificationData;
      if (notification.requestId !== requestIdRef.current) return;

      if (notification.content) {
        currentResponseRef.current.content += notification.content;

        const blocks = currentResponseRef.current.contentBlocks;
        const lastBlock = blocks[blocks.length - 1];
        if (lastBlock?.type === "text") {
          lastBlock.content += notification.content;
        } else {
          blocks.push({ type: "text", content: notification.content });
        }

        updateCurrentResponse();
      }
    };

    const handleReasoningStream = (data: unknown) => {
      const notification = data as StreamNotificationData;
      if (notification.requestId !== requestIdRef.current) return;

      if (notification.reasoning) {
        currentResponseRef.current.reasoning += notification.reasoning;

        const blocks = currentResponseRef.current.contentBlocks;
        const lastBlock = blocks[blocks.length - 1];
        if (lastBlock?.type === "reasoning") {
          lastBlock.content += notification.reasoning;
        } else {
          blocks.push({
            type: "reasoning",
            content: notification.reasoning,
            startTime: Date.now(),
          });
        }

        updateCurrentResponse();
      }
    };

    const handleToolStream = (data: unknown) => {
      const notification = data as StreamNotificationData;
      if (notification.requestId !== requestIdRef.current) return;

      if (notification.executions) {
        const blocks = currentResponseRef.current.contentBlocks;
        const lastBlock = blocks[blocks.length - 1];
        if (lastBlock?.type === "tool_calls") {
          lastBlock.executions = notification.executions;
        } else {
          blocks.push({
            type: "tool_calls",
            executions: notification.executions,
          });
        }

        updateCurrentResponse();
      }
    };

    const handleFinishStream = (data: unknown) => {
      const notification = data as StreamNotificationData;
      if (notification.requestId !== requestIdRef.current) return;

      if (notification.error) {
        setError(notification.error);
      }

      const blocks = currentResponseRef.current.contentBlocks;
      for (const block of blocks) {
        if (block.type === "reasoning" && !block.endTime) {
          block.endTime = Date.now();
          block.duration = block.endTime - (block.startTime || block.endTime);
        }
      }

      updateCurrentResponse();
      setIsLoading(false);
      requestIdRef.current = null;
    };

    client.registerNotificationHandler("ai.stream.text", handleTextStream);
    client.registerNotificationHandler(
      "ai.stream.reasoning",
      handleReasoningStream,
    );
    client.registerNotificationHandler("ai.stream.tool", handleToolStream);
    client.registerNotificationHandler("ai.stream.finish", handleFinishStream);
    wsClientRef.current = client;

    return () => {
      client.unregisterNotificationHandler("ai.stream.text", handleTextStream);
      client.unregisterNotificationHandler(
        "ai.stream.reasoning",
        handleReasoningStream,
      );
      client.unregisterNotificationHandler("ai.stream.tool", handleToolStream);
      client.unregisterNotificationHandler(
        "ai.stream.finish",
        handleFinishStream,
      );

      if (!useExternalClient) {
        client.onOpenHandler = null;
        client.onCloseHandler = null;
        client.disconnect();
      }

      if (wsClientRef.current === client) {
        wsClientRef.current = null;
      }
    };
  }, [externalWsClient, wsConnected, updateCurrentResponse]);

  const mapMessageToRequest = useCallback(
    (message: ChatMessageType): AiChatRequestMessage =>
      mapChatMessageToAiRequestMessage(message),
    [],
  );

  const sendRequestMessage = useCallback(
    async ({
      requestMessage,
      baseMessages,
      extraHistoryMessages = [],
      persistRequestMessage = true,
    }: SendRequestMessageOptions): Promise<boolean> => {
      if (!wsClientRef.current || !isConnected) {
        setError("AI 服务未连接");
        return false;
      }

      if (isLoading) {
        return false;
      }

      setError(null);
      setIsLoading(true);

      const currentMessages = baseMessages ?? messages;
      const requestId = uuidv4();
      requestIdRef.current = requestId;

      const assistantMessage: ChatMessageType = {
        id: uuidv4(),
        role: "assistant",
        content: "",
        contentBlocks: [],
        timestamp: Date.now(),
      };

      currentResponseRef.current = {
        content: "",
        reasoning: "",
        contentBlocks: [],
      };

      const persistedRequestMessage: ChatMessageType | null =
        persistRequestMessage
          ? ({
              id: uuidv4(),
              role: requestMessage.role,
              content: buildMessagePreview(requestMessage.content),
              timestamp: Date.now(),
              ...(requestMessage.name ? { name: requestMessage.name } : {}),
              ...(requestMessage.tool_call_id
                ? { tool_call_id: requestMessage.tool_call_id }
                : {}),
              ...(requestMessage.tool_calls?.length
                ? { tool_calls: requestMessage.tool_calls }
                : {}),
              ...(requestMessage.role === "user" &&
              Array.isArray(requestMessage.content)
                ? { requestContent: requestMessage.content }
                : {}),
            } as ChatMessageType)
          : null;

      const newMessages = persistedRequestMessage
        ? [...currentMessages, persistedRequestMessage, assistantMessage]
        : [...currentMessages, assistantMessage];
      updateMessages(newMessages);

      const requestMessages: AiChatRequestMessage[] = [
        ...currentMessages.map(mapMessageToRequest),
        ...extraHistoryMessages,
      ];
      if (persistRequestMessage) {
        requestMessages.push(requestMessage);
      }

      try {
        const pageContext = await getCurrentPageContext();
        await wsClientRef.current.sendRequest(
          "ai.chat",
          buildAiChatRpcPayload({
            requestId,
            messages: requestMessages,
            systemPrompt,
            enableTools,
            conversationKey,
            pageContext,
          }),
          600 * 1000,
        );
        return true;
      } catch (error) {
        setError((error as Error).message);
        setIsLoading(false);
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
      conversationKey,
      updateMessages,
    ],
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
    [sendRequestMessage],
  );

  // 清空消息
  const clearMessages = useCallback(() => {
    updateMessages([]);
    setError(null);
  }, [updateMessages]);

  // 停止生成
  const stopGeneration = useCallback(() => {
    // 目前只能通过重置状态来"停止"
    setIsLoading(false);
    requestIdRef.current = null;
  }, []);

  // 当 initialMessages 变化时更新本地状态
  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  return {
    messages,
    isLoading,
    error,
    isConnected,
    sendMessage,
    sendRequestMessage,
    clearMessages,
    stopGeneration,
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
