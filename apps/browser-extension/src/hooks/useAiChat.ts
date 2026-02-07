import { useState, useRef, useCallback, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import WebSocketClient from "@/utils/WebSocketClient";
import { BROWSER_TOOLS } from "@/services/extToolServer";
import type {
  ChatMessageType,
  ContentBlock,
  ToolCallExecutionState,
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
  systemPrompt?: string;
  initialMessages?: ChatMessageType[];
  onMessagesChange?: (messages: ChatMessageType[]) => void;
}

/**
 * AI 聊天 Hook
 */
export function useAiChat(options: UseAiChatOptions = {}) {
  const {
    enableTools = true,
    systemPrompt,
    initialMessages = [],
    onMessagesChange,
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

  // 初始化 WebSocket 客户端
  useEffect(() => {
    const client = new WebSocketClient(`ws://localhost:${WS_PORT}/aiServer`);

    client.onOpenHandler = () => {
      console.log("[useAiChat] 已连接到 AI 服务");
      setIsConnected(true);
    };

    client.onCloseHandler = () => {
      console.log("[useAiChat] AI 服务连接断开");
      setIsConnected(false);
    };

    // 注册流式通知处理器
    const handleTextStream = (data: unknown) => {
      const notification = data as StreamNotificationData;
      if (notification.requestId !== requestIdRef.current) return;

      if (notification.content) {
        currentResponseRef.current.content += notification.content;

        // 更新或添加文本内容块
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

        // 更新或添加推理内容块
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
        // 更新工具调用内容块
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

      // 完成推理块的时间
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

    client.connect();
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
      client.disconnect();
    };
  }, []);

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

  // 发送消息
  // baseMessages: 可选参数，用于覆盖闭包中的 messages（解决重新生成时的闭包过期问题）
  const sendMessage = useCallback(
    async (content: string, baseMessages?: ChatMessageType[]) => {
      if (!wsClientRef.current || !isConnected) {
        setError("AI 服务未连接");
        return;
      }

      if (isLoading) {
        return;
      }

      setError(null);
      setIsLoading(true);

      // 使用传入的 baseMessages 或闭包中的 messages
      const currentMessages = baseMessages ?? messages;

      // 生成请求 ID
      const requestId = uuidv4();
      requestIdRef.current = requestId;

      // 添加用户消息
      const userMessage: ChatMessageType = {
        id: uuidv4(),
        role: "user",
        content,
        timestamp: Date.now(),
      };

      // 初始化助手响应
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

      const newMessages = [...currentMessages, userMessage, assistantMessage];
      updateMessages(newMessages);

      // 构建请求消息
      const requestMessages = currentMessages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          role: m.role,
          content: m.content,
        }));

      // 添加当前用户消息
      requestMessages.push({
        role: "user" as const,
        content,
      });

      try {
        // 获取当前页面信息
        const pageContext = await getCurrentPageContext();

        // 发送请求
        await wsClientRef.current.sendRequest(
          "ai.chat",
          {
            requestId,
            messages: requestMessages,
            systemPrompt,
            enableTools,
            browserTools: enableTools ? BROWSER_TOOLS : undefined,
            pageContext,
          },
          600 * 1000, // 10分钟超时
        );
      } catch (error) {
        setError((error as Error).message);
        setIsLoading(false);
      }
    },
    [
      messages,
      isConnected,
      isLoading,
      systemPrompt,
      enableTools,
      updateMessages,
    ],
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
