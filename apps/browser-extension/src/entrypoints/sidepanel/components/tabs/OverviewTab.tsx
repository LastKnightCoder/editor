import { useState, useEffect, useCallback, useRef } from "react";
import { Tooltip } from "antd";
import { RefreshCw, Copy, Check, AlertTriangle, Unplug } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import type WebSocketClient from "../../../../utils/WebSocketClient";
import WebSocketClientImpl from "../../../../utils/WebSocketClient";
import {
  AI_RUN_METHODS,
  MarkdownRenderer,
  createRunEventFilter,
  type AiRunEventNotification,
} from "@tau/shared";
import { useTheme } from "../../../../hooks/useTheme";
import { useThemeStore } from "../../../../stores/useThemeStore";
import { useSettingsStore } from "../../../../stores/useSettingsStore";
import { useSummaryCache } from "../../../../hooks/useSummaryCache";
import { BROWSER_TOOLS } from "../../../../services/extToolServer";
import { AI_SERVER_WS_URL } from "../../../../utils/aiServerAddress";

interface OverviewTabProps {
  wsClient: WebSocketClient | null;
  url: string | null;
}

// Clipper 提取结果类型
interface ExtClipperExtractResult {
  success: boolean;
  markdown?: string;
  length?: number;
  error?: string;
}

/** 通用 loading spinner */
function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

/**
 * 概览 Tab - AI 网页总结
 * 自动获取当前网页内容并生成 AI 总结
 */
export default function OverviewTab({ wsClient: _wsClient, url }: OverviewTabProps) {
  // 状态
  const [summary, setSummary] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [showConnectingUI, setShowConnectingUI] = useState(false);
  const [copied, setCopied] = useState(false);
  const [lastUrl, setLastUrl] = useState<string | null>(null);

  // 引用
  const wsClientRef = useRef<WebSocketClientImpl | null>(null);
  const requestIdRef = useRef<string | null>(null);
  const runFilterRef = useRef<ReturnType<typeof createRunEventFilter> | null>(null);
  const summaryRef = useRef<string>("");
  // 通知处理器在挂载时注册一次，页面 URL 取最新值
  const urlRef = useRef(url);
  urlRef.current = url;

  // 获取主题和设置
  const { themeMode } = useThemeStore();
  const resolvedTheme = useTheme(themeMode);
  const isDark = resolvedTheme === "dark";
  const { autoSummaryEnabled } = useSettingsStore();
  const { getSummary, saveSummary, clearSummary } = useSummaryCache();

  // 初始化 WebSocket 客户端
  useEffect(() => {
    const client = new WebSocketClientImpl(AI_SERVER_WS_URL);

    client.onOpenHandler = () => {
      console.log("[OverviewTab] 已连接到 AI 服务");
      setIsConnected(true);
    };

    client.onCloseHandler = () => {
      console.log("[OverviewTab] AI 服务连接断开");
      setIsConnected(false);
    };

    const finish = () => {
      setIsLoading(false);
      requestIdRef.current = null;
      runFilterRef.current = null;
    };

    // v2 运行事件（快照语义：fullText 即当前全量），最后一条一定是 settled
    const handleRunEvent = (data: unknown) => {
      const event = runFilterRef.current?.(data as AiRunEventNotification);
      if (!event) return;
      if (event.type === "text") {
        summaryRef.current = event.fullText;
        setSummary(event.fullText);
        return;
      }
      if (event.type !== "settled") return;
      if (event.error) {
        setError(event.error);
      } else if (!event.aborted) {
        const text = summaryRef.current || event.lastText;
        if (!text) {
          setError("AI 未返回总结内容");
        } else {
          summaryRef.current = text;
          setSummary(text);
          const pageUrl = urlRef.current;
          // 保存总结到缓存
          if (pageUrl) {
            saveSummary(pageUrl, text).catch(err => {
              console.error("Failed to save summary cache:", err);
            });
          }
        }
      }
      finish();
    };

    // 桌面窗口走了：这轮不会再有事件，立即收尾
    const handleServerGone = () => {
      if (!requestIdRef.current) return;
      setError("与桌面端的连接断开，总结没有完成");
      finish();
    };

    client.registerNotificationHandler(AI_RUN_METHODS.event, handleRunEvent);
    client.registerNotificationHandler("server-gone", handleServerGone);

    client.connect();
    wsClientRef.current = client;

    return () => {
      client.unregisterNotificationHandler(AI_RUN_METHODS.event, handleRunEvent);
      client.unregisterNotificationHandler("server-gone", handleServerGone);
      client.disconnect();
    };
  }, []);

  // 延迟展示连接中 UI，避免短暂闪烁
  useEffect(() => {
    if (!isConnected) {
      const timer = setTimeout(() => setShowConnectingUI(true), 800);
      return () => clearTimeout(timer);
    } else {
      setShowConnectingUI(false);
    }
  }, [isConnected]);

  // URL 变化时检查缓存或自动生成总结
  useEffect(() => {
    if (url && url !== lastUrl && isConnected && !isLoading) {
      setLastUrl(url);

      // 1. 先检查缓存
      getSummary(url)
        .then(cachedSummary => {
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
        .catch(err => {
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
        600000
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

      // 发送总结请求（v2：立即返回，正文经 ai.run.event 推送，settled 收尾）
      runFilterRef.current = createRunEventFilter(requestId);
      await wsClientRef.current.sendRequest(
        AI_RUN_METHODS.start,
        {
          runId: requestId,
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
        30 * 1000
      );
    } catch (error) {
      setError((error as Error).message);
      setIsLoading(false);
      requestIdRef.current = null;
      runFilterRef.current = null;
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

  // 如果未连接，显示连接状态（延迟展示，避免短暂闪烁）
  if (!isConnected) {
    if (!showConnectingUI) return null;
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-yellow-500/10">
          <Unplug className="h-6 w-6 text-yellow-500" />
        </div>
        <h3 className="mb-1 text-sm font-medium text-gray-900 dark:text-[#e6edf3]">
          正在连接 AI 服务...
        </h3>
        <p className="text-center text-xs text-gray-400 dark:text-[#484f58]">请确保桌面端已启动</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      {/* 内容区域 */}
      <div className="tau-scrollbar flex flex-1 flex-col overflow-y-auto">
        {/* URL + 操作栏 */}
        {url && (
          <div className="sticky top-0 z-10 flex shrink-0 items-center gap-2 bg-white/80 px-4 py-2.5 backdrop-blur-sm dark:bg-[#161b22]/80">
            <span className="min-w-0 flex-1 truncate text-xs text-gray-400 dark:text-[#484f58]">
              {url}
            </span>
            <div className="flex shrink-0 items-center gap-0.5">
              {summary && (
                <Tooltip title={copied ? "已复制" : "复制内容"}>
                  <button
                    onClick={handleCopy}
                    className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-black/5 hover:text-gray-600 dark:text-[#484f58] dark:hover:bg-white/10 dark:hover:text-[#8b949e]"
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </Tooltip>
              )}
              <Tooltip title="重新生成">
                <button
                  onClick={handleRegenerate}
                  disabled={isLoading}
                  className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-black/5 hover:text-gray-600 disabled:opacity-50 dark:text-[#484f58] dark:hover:bg-white/10 dark:hover:text-[#8b949e]"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
                </button>
              </Tooltip>
            </div>
          </div>
        )}

        {/* 加载状态 */}
        {isLoading && !summary && (
          <div className="flex flex-1 flex-col items-center justify-center px-6">
            <Spinner className="h-5 w-5 text-gray-400 dark:text-[#484f58]" />
            <p className="mt-3 text-sm text-gray-400 dark:text-[#484f58]">正在分析页面内容...</p>
          </div>
        )}

        {/* 错误提示 */}
        {error && !isLoading && (
          <div className="mx-4 mt-4 rounded-lg bg-red-50 p-3 dark:bg-red-900/10">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400 dark:text-red-400/80" />
              <div>
                <span className="text-sm text-red-600 dark:text-red-400/90">{error}</span>
                <button
                  onClick={generateSummary}
                  className="mt-1.5 block text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-[#6e7681] dark:hover:text-[#8b949e]"
                >
                  重试
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 总结内容 */}
        {summary && (
          <div className="px-4 pb-4 text-sm text-gray-700 dark:text-[#c9d1d9]">
            <MarkdownRenderer content={summary} isDark={isDark} />
          </div>
        )}

        {/* 空状态 */}
        {!isLoading && !summary && !error && (
          <div className="flex flex-1 flex-col items-center justify-center px-6">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-gray-50 dark:bg-[#0d1117]">
              <svg
                className="h-5 w-5 text-gray-300 dark:text-[#484f58]"
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
            <p className="mb-4 text-center text-xs text-gray-400 dark:text-[#484f58]">
              {autoSummaryEnabled
                ? "点击下方按钮生成页面总结"
                : "自动总结已关闭，点击下方按钮手动生成"}
            </p>
            <button
              onClick={generateSummary}
              className="rounded-lg border border-gray-200 bg-white px-4 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 active:bg-gray-100 dark:border-[#30363d] dark:bg-[#21262d] dark:text-[#c9d1d9] dark:hover:bg-[#30363d] dark:active:bg-[#3a424b]"
            >
              生成总结
            </button>
          </div>
        )}

        {/* 加载中的渐进显示 */}
        {isLoading && summary && (
          <div className="flex items-center gap-2 px-4 pb-4 text-xs text-gray-400 dark:text-[#484f58]">
            <Spinner className="h-3.5 w-3.5" />
            <span>正在生成...</span>
          </div>
        )}
      </div>
    </div>
  );
}
