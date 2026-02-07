import { useState, useEffect, useCallback, useRef } from "react";
import { Button, Spin, Tooltip } from "antd";
import {
  ReloadOutlined,
  CopyOutlined,
  CheckOutlined,
  WarningOutlined,
  DisconnectOutlined,
} from "@ant-design/icons";
import { v4 as uuidv4 } from "uuid";
import classNames from "classnames";
import type WebSocketClient from "../../../../utils/WebSocketClient";
import WebSocketClientImpl from "../../../../utils/WebSocketClient";
import { MarkdownRenderer } from "@tau/shared";
import { useTheme } from "../../../../hooks/useTheme";
import { useThemeStore } from "../../../../stores/useThemeStore";
import { useSettingsStore } from "../../../../stores/useSettingsStore";
import { useSummaryCache } from "../../../../hooks/useSummaryCache";
import { BROWSER_TOOLS } from "../../../../services/extToolServer";

const WS_PORT = 24678;

interface OverviewTabProps {
  wsClient: WebSocketClient | null;
  url: string | null;
}

// 流式通知数据类型
interface StreamNotificationData {
  requestId: string;
  content?: string;
  reasoning?: string;
  error?: string;
}

// Clipper 提取结果类型
interface ExtClipperExtractResult {
  success: boolean;
  markdown?: string;
  length?: number;
  error?: string;
}

/**
 * 概览 Tab - AI 网页总结
 * 自动获取当前网页内容并生成 AI 总结
 */
export default function OverviewTab({
  wsClient: _wsClient,
  url,
}: OverviewTabProps) {
  // 状态
  const [summary, setSummary] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [copied, setCopied] = useState(false);
  const [lastUrl, setLastUrl] = useState<string | null>(null);

  // 引用
  const wsClientRef = useRef<WebSocketClientImpl | null>(null);
  const requestIdRef = useRef<string | null>(null);
  const summaryRef = useRef<string>("");

  // 获取主题和设置
  const { themeMode } = useThemeStore();
  const resolvedTheme = useTheme(themeMode);
  const isDark = resolvedTheme === "dark";
  const { autoSummaryEnabled } = useSettingsStore();
  const { getSummary, saveSummary, clearSummary } = useSummaryCache();

  // 初始化 WebSocket 客户端
  useEffect(() => {
    const client = new WebSocketClientImpl(
      `ws://localhost:${WS_PORT}/aiServer`,
    );

    client.onOpenHandler = () => {
      console.log("[OverviewTab] 已连接到 AI 服务");
      setIsConnected(true);
    };

    client.onCloseHandler = () => {
      console.log("[OverviewTab] AI 服务连接断开");
      setIsConnected(false);
    };

    // 注册流式通知处理器
    const handleTextStream = (data: unknown) => {
      const notification = data as StreamNotificationData;
      if (notification.requestId !== requestIdRef.current) return;

      if (notification.content) {
        summaryRef.current += notification.content;
        setSummary(summaryRef.current);
      }
    };

    const handleFinishStream = (data: unknown) => {
      const notification = data as StreamNotificationData;
      if (notification.requestId !== requestIdRef.current) return;

      if (notification.error) {
        setError(notification.error);
      } else if (summaryRef.current && url) {
        // 保存总结到缓存
        saveSummary(url, summaryRef.current).catch((err) => {
          console.error("Failed to save summary cache:", err);
        });
      }

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
    };
  }, []);

  // URL 变化时检查缓存或自动生成总结
  useEffect(() => {
    if (url && url !== lastUrl && isConnected && !isLoading) {
      setLastUrl(url);

      // 1. 先检查缓存
      getSummary(url)
        .then((cachedSummary) => {
          if (cachedSummary) {
            setSummary(cachedSummary.summary);
            summaryRef.current = cachedSummary.summary;
            setError(null);
            return;
          }

          // 2. 无缓存且开启自动总结
          if (autoSummaryEnabled) {
            checkAndGenerateSummary();
          }
        })
        .catch((err) => {
          console.error("Failed to get summary cache:", err);
          // 缓存读取失败，如果开启自动总结则继续
          if (autoSummaryEnabled) {
            checkAndGenerateSummary();
          }
        });
    }
  }, [url, isConnected, autoSummaryEnabled]);

  // 检查内容并决定是否生成总结
  const checkAndGenerateSummary = useCallback(async () => {
    if (!wsClientRef.current || !isConnected) {
      setError("AI 服务未连接");
      return;
    }

    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (!tab?.id) {
        setError("无法获取当前页面");
        return;
      }

      // 获取页面 HTML
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          return {
            html: document.documentElement.outerHTML,
            url: window.location.href,
            title: document.title,
          };
        },
      });

      const pageData = results[0]?.result;
      if (!pageData) {
        setError("无法获取页面内容");
        return;
      }

      // 调用桌面端 clipper 服务提取内容
      const result = (await wsClientRef.current.sendRequest(
        "ext.clipper.extract",
        {
          html: pageData.html,
          url: pageData.url,
          title: pageData.title,
          mode: "smart",
        },
        600000,
      )) as ExtClipperExtractResult;

      if (!result.success) {
        setError(`内容提取失败: ${result.error}`);
        return;
      }

      // 判断内容长度
      if (result.length && result.length >= 500) {
        generateSummary();
      } else {
        setError("页面内容较少，建议手动生成总结");
      }
    } catch (error) {
      console.error("检查页面内容失败:", error);
      setError("无法获取页面内容");
    }
  }, [isConnected]);

  // 生成总结
  const generateSummary = useCallback(async () => {
    if (!wsClientRef.current || !isConnected) {
      setError("AI 服务未连接");
      return;
    }

    if (isLoading) return;

    setError(null);
    setIsLoading(true);
    setSummary("");
    summaryRef.current = "";

    // 生成请求 ID
    const requestId = uuidv4();
    requestIdRef.current = requestId;

    try {
      // 获取当前页面信息
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (!tab?.url || !tab?.title) {
        setError("无法获取当前页面信息");
        setIsLoading(false);
        return;
      }

      // 发送总结请求（使用 webClip 场景的模型）
      await wsClientRef.current.sendRequest(
        "ai.chat",
        {
          requestId,
          feature: "webClip",
          messages: [
            {
              role: "user",
              content: `请总结当前网页的主要内容。

要求：
1. 首先用一句话概括网页的核心主题
2. 然后分点列出关键信息（3-5 点）
3. 如果有重要的数据或结论，请特别标注
4. 最后给出一个简短的评价或建议

请使用工具获取页面内容后进行总结。`,
            },
          ],
          systemPrompt: `你是一个专业的内容分析助手，擅长快速提取和总结网页内容的核心信息。
请用简洁、结构化的方式呈现总结结果，使用 Markdown 格式。`,
          enableTools: true,
          browserTools: BROWSER_TOOLS,
          pageContext: {
            url: tab.url,
            title: tab.title,
          },
        },
        600000,
      );
    } catch (error) {
      setError((error as Error).message);
      setIsLoading(false);
    }
  }, [isConnected, isLoading]);

  // 重新生成总结（清除缓存）
  const handleRegenerate = useCallback(async () => {
    if (url) {
      await clearSummary(url);
    }
    generateSummary();
  }, [url, clearSummary, generateSummary]);

  // 复制总结
  const handleCopy = useCallback(async () => {
    if (!summary) return;

    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("复制失败");
    }
  }, [summary]);

  // 如果未连接，显示连接状态
  if (!isConnected) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-yellow-500/10">
          <DisconnectOutlined className="text-2xl text-yellow-500" />
        </div>
        <h3 className="mb-1 text-sm font-medium text-gray-900 dark:text-[#e6edf3]">
          正在连接 AI 服务...
        </h3>
        <p className="text-center text-xs text-gray-400 dark:text-[#484f58]">
          请确保桌面端已启动
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col h-full overflow-hidden">
      {/* 头部 */}
      <div
        className={classNames(
          "flex-shrink-0 flex items-center justify-between px-4 py-3 border-b",
          isDark ? "border-gray-800" : "border-gray-200",
        )}
      >
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
            <svg
              className="h-4 w-4 text-blue-500"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z"
              />
            </svg>
          </div>
          <span className="text-sm font-medium text-gray-900 dark:text-[#e6edf3]">
            AI 概览
          </span>
        </div>

        <div className="flex items-center gap-1">
          {summary && (
            <Tooltip title={copied ? "已复制" : "复制内容"}>
              <Button
                type="text"
                size="small"
                icon={
                  copied ? (
                    <CheckOutlined className="text-green-500" />
                  ) : (
                    <CopyOutlined />
                  )
                }
                onClick={handleCopy}
              />
            </Tooltip>
          )}
          <Tooltip title="重新生成">
            <Button
              type="text"
              size="small"
              icon={<ReloadOutlined spin={isLoading} />}
              onClick={handleRegenerate}
              disabled={isLoading}
            />
          </Tooltip>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* URL 显示 */}
        {url && (
          <div
            className={classNames(
              "mb-4 px-3 py-2 rounded-lg text-xs truncate",
              isDark
                ? "bg-gray-800 text-gray-400"
                : "bg-gray-100 text-gray-500",
            )}
          >
            {url}
          </div>
        )}

        {/* 加载状态 */}
        {isLoading && !summary && (
          <div className="flex flex-col items-center justify-center py-12">
            <Spin size="large" />
            <p className="mt-4 text-sm text-gray-400">正在分析页面内容...</p>
          </div>
        )}

        {/* 错误提示 */}
        {error && !isLoading && (
          <div
            className={classNames(
              "rounded-lg p-4 mb-4",
              isDark ? "bg-red-900/20" : "bg-red-50",
            )}
          >
            <div className="flex items-center gap-2 text-red-500">
              <WarningOutlined />
              <span className="text-sm">{error}</span>
            </div>
            <Button
              type="link"
              size="small"
              onClick={generateSummary}
              className="mt-2 p-0"
            >
              重试
            </Button>
          </div>
        )}

        {/* 总结内容 */}
        {summary && (
          <div
            className={classNames(
              "text-sm",
              isDark ? "text-gray-300" : "text-gray-700",
            )}
          >
            <MarkdownRenderer content={summary} isDark={isDark} />
          </div>
        )}

        {/* 空状态 */}
        {!isLoading && !summary && !error && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
              <svg
                className="h-6 w-6 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                />
              </svg>
            </div>
            <p className="text-sm text-gray-400 mb-4">
              {autoSummaryEnabled
                ? "点击下方按钮生成页面总结"
                : "自动总结已关闭，点击下方按钮手动生成"}
            </p>
            <Button type="primary" onClick={generateSummary}>
              生成总结
            </Button>
          </div>
        )}

        {/* 加载中的渐进显示 */}
        {isLoading && summary && (
          <div className="mt-4 flex items-center gap-2 text-xs text-gray-400">
            <Spin size="small" />
            <span>正在生成...</span>
          </div>
        )}
      </div>
    </div>
  );
}
