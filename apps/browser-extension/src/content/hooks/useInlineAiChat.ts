import { useState, useRef, useCallback, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import WebSocketClient from "@/utils/WebSocketClient";
import { extractPageContent } from "../context-extractor";

const WS_PORT = 24678;

/** 流式通知数据 */
interface StreamNotificationData {
  requestId: string;
  content?: string;
  error?: string;
}

interface UseInlineAiChatOptions {
  /** 面板是否处于打开状态，控制惰性连接 */
  active: boolean;
  /** 用户选中的文字 */
  selectedText: string;
  /** 选中文字所在的段落上下文 */
  surroundingContext: string;
  /** 当前页面 URL */
  pageUrl: string;
}

/**
 * 行内 AI 问书 Hook（精简版）
 *
 * 与侧边栏 useAiChat 的区别：
 * - 惰性连接：仅在面板打开时创建 WebSocket
 * - 单轮问答：不维护多轮对话历史
 * - 无工具调用：enableTools = false
 * - 自动构建 System Prompt：包含页面内容 + 选中文字 + 上下文
 */
export function useInlineAiChat({
  active,
  selectedText,
  surroundingContext,
  pageUrl,
}: UseInlineAiChatOptions) {
  const [response, setResponse] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const wsClientRef = useRef<WebSocketClient | null>(null);
  const requestIdRef = useRef<string | null>(null);
  const responseRef = useRef("");
  const rafIdRef = useRef(0);

  // rAF 节流：每帧最多触发一次 setResponse，多个 token 自然合并
  const scheduleUpdate = useCallback(() => {
    if (rafIdRef.current) return;
    rafIdRef.current = requestAnimationFrame(() => {
      setResponse(responseRef.current);
      rafIdRef.current = 0;
    });
  }, []);

  // 惰性 WebSocket 连接：仅在 active 时创建
  useEffect(() => {
    if (!active) {
      // 面板关闭时断开连接
      if (wsClientRef.current) {
        wsClientRef.current.disconnect();
        wsClientRef.current = null;
        setIsConnected(false);
      }
      return;
    }

    const client = new WebSocketClient(`ws://localhost:${WS_PORT}/aiServer`);

    client.onOpenHandler = () => {
      setIsConnected(true);
    };

    client.onCloseHandler = () => {
      setIsConnected(false);
    };

    // 流式文本处理
    const handleTextStream = (data: unknown) => {
      const notification = data as StreamNotificationData;
      if (notification.requestId !== requestIdRef.current) return;

      if (notification.content) {
        responseRef.current += notification.content;
        scheduleUpdate();
      }
    };

    // 完成处理
    const handleFinishStream = (data: unknown) => {
      const notification = data as StreamNotificationData;
      if (notification.requestId !== requestIdRef.current) return;

      if (notification.error) {
        setError(notification.error);
      }

      // 取消 pending rAF，同步刷新最终内容
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = 0;
      }
      setResponse(responseRef.current);

      setIsLoading(false);
      requestIdRef.current = null;
    };

    client.registerNotificationHandler("ai.stream.text", handleTextStream);
    client.registerNotificationHandler("ai.stream.finish", handleFinishStream);

    client.connect();
    wsClientRef.current = client;

    return () => {
      client.unregisterNotificationHandler("ai.stream.text", handleTextStream);
      client.unregisterNotificationHandler(
        "ai.stream.finish",
        handleFinishStream,
      );
      client.disconnect();
      wsClientRef.current = null;
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = 0;
      }
    };
  }, [active]);

  // 构建 System Prompt
  const buildSystemPrompt = useCallback(() => {
    const pageContent = extractPageContent(selectedText);
    const title = document.title;

    return `你是一个阅读助手。用户正在阅读以下网页内容，请根据用户的问题给出准确、简洁的回答。

## 当前网页
- URL: ${pageUrl}
- 标题: ${title}

## 页面内容（以选中位置为中心截取）
${pageContent}

## 用户选中的文字
${selectedText}

## 选中文字所在的段落上下文
${surroundingContext}`;
  }, [selectedText, surroundingContext, pageUrl]);

  // 发送问题
  const sendQuestion = useCallback(
    async (question: string) => {
      if (!wsClientRef.current || !isConnected) {
        setError("AI 服务未连接，请确保桌面端正在运行");
        return;
      }

      if (isLoading) return;

      setError(null);
      setIsLoading(true);
      responseRef.current = "";
      setResponse("");

      const requestId = uuidv4();
      requestIdRef.current = requestId;

      const systemPrompt = buildSystemPrompt();

      try {
        await wsClientRef.current.sendRequest(
          "ai.chat",
          {
            requestId,
            messages: [{ role: "user", content: question }],
            systemPrompt,
            enableTools: false,
          },
          600 * 1000,
        );
      } catch (err) {
        setError((err as Error).message);
        setIsLoading(false);
      }
    },
    [isConnected, isLoading, buildSystemPrompt],
  );

  // 停止生成
  const stopGeneration = useCallback(() => {
    setIsLoading(false);
    requestIdRef.current = null;
  }, []);

  // 重置状态（面板重新打开时使用）
  const reset = useCallback(() => {
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = 0;
    }
    responseRef.current = "";
    setResponse("");
    setError(null);
    setIsLoading(false);
    requestIdRef.current = null;
  }, []);

  return {
    response,
    isLoading,
    error,
    isConnected,
    sendQuestion,
    stopGeneration,
    reset,
  };
}
