import { useState, useRef, useCallback, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { AI_RUN_METHODS, createRunEventFilter, type AiRunEventNotification } from "@tau/shared";
import WebSocketClient from "@/utils/WebSocketClient";
import { AI_SERVER_WS_URL } from "@/utils/aiServerAddress";
import { extractPageContent } from "../context-extractor";
import { injectInlineTimeContext } from "@/utils/systemPrompt";

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
  const runFilterRef = useRef<ReturnType<typeof createRunEventFilter> | null>(null);
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

    const client = new WebSocketClient(AI_SERVER_WS_URL);

    client.onOpenHandler = () => {
      setIsConnected(true);
    };

    client.onCloseHandler = () => {
      setIsConnected(false);
    };

    const finish = (errorMessage?: string) => {
      if (errorMessage) setError(errorMessage);
      // 取消 pending rAF，同步刷新最终内容
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = 0;
      }
      setResponse(responseRef.current);
      setIsLoading(false);
      requestIdRef.current = null;
      runFilterRef.current = null;
    };

    // v2 运行事件（快照语义：fullText 即当前全量），最后一条一定是 settled
    const handleRunEvent = (data: unknown) => {
      const event = runFilterRef.current?.(data as AiRunEventNotification);
      if (!event) return;
      if (event.type === "text") {
        responseRef.current = event.fullText;
        scheduleUpdate();
      } else if (event.type === "error") {
        setError(event.message);
      } else if (event.type === "settled") {
        finish(event.error);
      }
    };

    // 桌面窗口走了：这轮不会再有事件，立即收尾
    const handleServerGone = () => {
      if (requestIdRef.current) finish("与桌面端的连接断开，这次回答没有完成");
    };

    client.registerNotificationHandler(AI_RUN_METHODS.event, handleRunEvent);
    client.registerNotificationHandler("server-gone", handleServerGone);

    client.connect();
    wsClientRef.current = client;

    return () => {
      client.unregisterNotificationHandler(AI_RUN_METHODS.event, handleRunEvent);
      client.unregisterNotificationHandler("server-gone", handleServerGone);
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

    const basePrompt = `你是一个阅读助手。用户正在阅读以下网页内容，请根据用户的问题给出准确、简洁的回答。

## 当前网页
- URL: ${pageUrl}
- 标题: ${title}

## 页面内容（以选中位置为中心截取）
${pageContent}

## 用户选中的文字
${selectedText}

## 选中文字所在的段落上下文
${surroundingContext}`;

    return injectInlineTimeContext(basePrompt);
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
      runFilterRef.current = createRunEventFilter(requestId);

      const systemPrompt = buildSystemPrompt();

      try {
        // v2：立即返回，过程经 ai.run.event 推送
        await wsClientRef.current.sendRequest(
          AI_RUN_METHODS.start,
          {
            runId: requestId,
            messages: [{ role: "user", content: question }],
            systemPrompt,
            enableTools: false,
          },
          30 * 1000
        );
      } catch (err) {
        setError((err as Error).message);
        setIsLoading(false);
        requestIdRef.current = null;
        runFilterRef.current = null;
      }
    },
    [isConnected, isLoading, buildSystemPrompt]
  );

  // 停止生成：通知桌面停下（收尾等 settled；连接不在就直接收尾）
  const stopGeneration = useCallback(() => {
    const runId = requestIdRef.current;
    if (runId && wsClientRef.current?.isConnected) {
      wsClientRef.current.sendRequest(AI_RUN_METHODS.abort, { runId }, 10 * 1000).catch(() => {});
      return;
    }
    setIsLoading(false);
    requestIdRef.current = null;
    runFilterRef.current = null;
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
    runFilterRef.current = null;
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
