import { useState, useEffect, useCallback, useRef, useLayoutEffect } from "react";
import { Button, IconButton, Tooltip, cn } from "@tau/ui";
import { RefreshCw, Copy, Check, Sparkles, ChevronDown } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import type WebSocketClient from "../../../../utils/WebSocketClient";
import WebSocketClientImpl from "../../../../utils/WebSocketClient";
import { AI_RUN_METHODS, createRunEventFilter, type AiRunEventNotification } from "@tau/shared";
import { MarkdownRenderer } from "@tau/chat-ui";
import { diagramLanguageRenderers } from "@tau/editor-diagram/renderers";
import { useIsDark } from "../../../../stores/useExtensionTheme";
import { useSettingsStore } from "../../../../stores/useSettingsStore";
import { useSummaryCache } from "../../../../hooks/useSummaryCache";
import { BROWSER_TOOLS } from "../../../../services/extToolServer";
import { AI_SERVER_WS_URL } from "../../../../utils/aiServerAddress";

interface SummaryCardProps {
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

/** 折叠态的正文高度上限（约 5 行），超出时出「展开」 */
const COLLAPSED_MAX_HEIGHT = 120;

/**
 * 本页流顶部的 AI 总结卡：有缓存直接显示，否则按设置自动生成或等手动生成；
 * 默认折叠到约 5 行，不挤占下方的高亮与笔记。
 */
export default function SummaryCard({ wsClient: _wsClient, url }: SummaryCardProps) {
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
  const runFilterRef = useRef<ReturnType<typeof createRunEventFilter> | null>(null);
  const summaryRef = useRef<string>("");
  // 通知处理器在挂载时注册一次，页面 URL 取最新值
  const urlRef = useRef(url);
  urlRef.current = url;

  // 获取主题和设置
  const isDark = useIsDark();
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
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

  // 正文超出折叠高度才给「展开」
  useLayoutEffect(() => {
    const element = bodyRef.current;
    if (!element) return;
    const measure = () => setOverflowing(element.scrollHeight > COLLAPSED_MAX_HEIGHT + 4);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [summary]);

  useEffect(() => setExpanded(false), [url]);

  const busy = isLoading && !summary;

  return (
    <section className="border-line-1 bg-surface rounded-tau-md border px-3.5 pb-2.5 pt-2.5">
      <div className="text-tau-sm text-ink-3 flex h-7 items-center gap-1.5">
        <Sparkles size={14} strokeWidth={1.75} className="text-accent-text shrink-0" />
        <span className="flex-1">{busy ? "正在总结这一页…" : "AI 总结"}</span>
        {summary && !isLoading && (
          <Tooltip content={copied ? "已复制" : "复制"}>
            <IconButton
              aria-label="复制总结"
              className="size-7 [&_svg]:size-3.5"
              onClick={handleCopy}
            >
              {copied ? <Check className="text-ok" /> : <Copy />}
            </IconButton>
          </Tooltip>
        )}
        {(summary || error) && (
          <Tooltip content="重新生成">
            <IconButton
              aria-label="重新生成总结"
              className="size-7 [&_svg]:size-3.5"
              disabled={isLoading || !isConnected}
              onClick={handleRegenerate}
            >
              <RefreshCw className={cn(isLoading && "animate-spin")} />
            </IconButton>
          </Tooltip>
        )}
      </div>

      {!isConnected ? (
        <p className="text-tau-sm text-ink-3 pb-1">正在连接 AI 服务…</p>
      ) : busy ? (
        <div className="space-y-2 pb-1.5 pt-1" aria-hidden>
          <div className="bg-hover h-2.5 w-[92%] animate-pulse rounded-full" />
          <div className="bg-hover h-2.5 w-[78%] animate-pulse rounded-full" />
          <div className="bg-hover h-2.5 w-[54%] animate-pulse rounded-full" />
        </div>
      ) : summary ? (
        <>
          <div
            ref={bodyRef}
            className={cn(
              "text-tau-body-lg text-ink-1 relative overflow-hidden",
              !expanded &&
                overflowing &&
                "[mask-image:linear-gradient(to_bottom,black_70%,transparent)]"
            )}
            style={expanded ? undefined : { maxHeight: COLLAPSED_MAX_HEIGHT }}
          >
            <MarkdownRenderer
              content={summary}
              isDark={isDark}
              codeLanguageRenderers={diagramLanguageRenderers}
            />
          </div>
          {overflowing && (
            <button
              type="button"
              onClick={() => setExpanded(value => !value)}
              className="text-tau-sm text-accent-text mt-1 inline-flex items-center gap-0.5"
            >
              {expanded ? "收起" : "展开全部"}
              <ChevronDown
                size={13}
                strokeWidth={1.75}
                className={cn("transition-transform", expanded && "rotate-180")}
              />
            </button>
          )}
        </>
      ) : error ? (
        <div className="text-tau-sm flex items-center gap-2 pb-1">
          <span className="text-danger min-w-0 flex-1">{error}</span>
          <Button size="sm" variant="ghost" onClick={generateSummary}>
            重试
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2 pb-1">
          <span className="text-tau-sm text-ink-3 min-w-0 flex-1">
            {autoSummaryEnabled ? "这一页还没有总结" : "自动总结已关闭"}
          </span>
          <Button size="sm" variant="secondary" onClick={generateSummary}>
            生成总结
          </Button>
        </div>
      )}
    </section>
  );
}
