import { App } from "antd";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
} from "react";
import { Download, Maximize2 } from "lucide-react";
import { openExternal } from "@/commands";
import type { ToolCallCustomRendererProps } from "./types";
import {
  ToolBadge,
  ToolCard,
  ToolCardBody,
  ToolCardHeader,
  ToolMutedText,
  ToolSectionTitle,
} from "./ui";
import {
  buildGenerativeWidgetPayload,
  type GenerativeWidgetWarningCode,
  type GenerativeWidgetRenderPayload,
  type WidgetRenderPhase,
} from "@/generative-ui/widget-render-payload";
import {
  GENERATIVE_WIDGET_RENDERER_KEY,
  SHOW_WIDGET_TOOL_NAME,
} from "@/generative-ui/constants";
import { useChatWidgetInteraction } from "./generative-widget/interaction-context";
import {
  getGenerativeWidgetShellSrcDoc,
  getStandaloneGenerativeWidgetHtml,
} from "./generative-widget/shell";
import FullscreenPortal from "@/components/FullscreenPortal";

interface WidgetShellMessage {
  source: string;
  type: string;
  height?: number;
  text?: string;
  url?: string;
  message?: string;
}

const HOST_SOURCE = "tau-host-widget";
const SHELL_SOURCE = "tau-generative-widget";

const humanizeWidgetTitle = (title: string) =>
  title.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();

const getWidgetExportFileName = (title: string) => {
  const normalized = humanizeWidgetTitle(title)
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `${normalized || "widget"}.html`;
};

const WIDGET_WARNING_COPY: Record<GenerativeWidgetWarningCode, string> = {
  widget_arguments_incomplete:
    "widget 参数在流结束时仍未完全闭合，最终渲染可能不完整。",
};

const getThemeTokens = (isDark: boolean) =>
  isDark
    ? {
        "--widget-bg": "transparent",
        "--widget-surface": "#020617",
        "--widget-muted-surface": "#0f172a",
        "--widget-border": "rgba(148, 163, 184, 0.18)",
        "--widget-text": "#e2e8f0",
        "--widget-text-muted": "#94a3b8",
        "--widget-accent": "#38bdf8",
        "--color-background-primary": "#020617",
        "--color-background-secondary": "#0f172a",
        "--color-background-tertiary": "#020617",
        "--color-background-info": "#0c447c",
        "--color-background-danger": "#791f1f",
        "--color-background-success": "#27500a",
        "--color-background-warning": "#633806",
        "--color-text-primary": "#e2e8f0",
        "--color-text-secondary": "#94a3b8",
        "--color-text-tertiary": "#64748b",
        "--color-text-info": "#b5d4f4",
        "--color-text-danger": "#f7c1c1",
        "--color-text-success": "#c0dd97",
        "--color-text-warning": "#fac775",
        "--color-border-primary": "rgba(148, 163, 184, 0.32)",
        "--color-border-secondary": "rgba(148, 163, 184, 0.22)",
        "--color-border-tertiary": "rgba(148, 163, 184, 0.16)",
        "--color-border-info": "#85b7eb",
        "--color-border-danger": "#f09595",
        "--color-border-success": "#97c459",
        "--color-border-warning": "#ef9f27",
        "--font-sans":
          '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        "--font-serif": '"Iowan Old Style", Georgia, serif',
        "--font-mono": '"SFMono-Regular", ui-monospace, monospace',
        "--border-radius-md": "8px",
        "--border-radius-lg": "12px",
        "--border-radius-xl": "16px",
      }
    : {
        "--widget-bg": "transparent",
        "--widget-surface": "#ffffff",
        "--widget-muted-surface": "#f8fafc",
        "--widget-border": "rgba(15, 23, 42, 0.08)",
        "--widget-text": "#0f172a",
        "--widget-text-muted": "#475569",
        "--widget-accent": "#2563eb",
        "--color-background-primary": "#ffffff",
        "--color-background-secondary": "#f8fafc",
        "--color-background-tertiary": "#f1f5f9",
        "--color-background-info": "#e6f1fb",
        "--color-background-danger": "#fcebeb",
        "--color-background-success": "#eaf3de",
        "--color-background-warning": "#faeeda",
        "--color-text-primary": "#0f172a",
        "--color-text-secondary": "#475569",
        "--color-text-tertiary": "#64748b",
        "--color-text-info": "#0c447c",
        "--color-text-danger": "#791f1f",
        "--color-text-success": "#27500a",
        "--color-text-warning": "#633806",
        "--color-border-primary": "rgba(15, 23, 42, 0.24)",
        "--color-border-secondary": "rgba(15, 23, 42, 0.16)",
        "--color-border-tertiary": "rgba(15, 23, 42, 0.1)",
        "--color-border-info": "#85b7eb",
        "--color-border-danger": "#f09595",
        "--color-border-success": "#97c459",
        "--color-border-warning": "#ef9f27",
        "--font-sans":
          '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        "--font-serif": '"Iowan Old Style", Georgia, serif',
        "--font-mono": '"SFMono-Regular", ui-monospace, monospace',
        "--border-radius-md": "8px",
        "--border-radius-lg": "12px",
        "--border-radius-xl": "16px",
      };

const getPayloadFromMetadata = (
  metadata?: Record<string, unknown>,
): GenerativeWidgetRenderPayload | null => {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const render =
    metadata.render && typeof metadata.render === "object"
      ? (metadata.render as Record<string, unknown>)
      : null;
  if (!render || render.rendererKey !== GENERATIVE_WIDGET_RENDERER_KEY) {
    return null;
  }

  const payload =
    render.payload && typeof render.payload === "object"
      ? (render.payload as GenerativeWidgetRenderPayload)
      : null;
  return payload;
};

const getFallbackPayload = (
  parsedInput: unknown | null,
  toolCallId: string,
  execution: ToolCallCustomRendererProps["execution"],
): GenerativeWidgetRenderPayload | null => {
  if (
    execution.toolName !== SHOW_WIDGET_TOOL_NAME ||
    execution.status === "failed" ||
    execution.status === "success"
  ) {
    return null;
  }

  if (!parsedInput || typeof parsedInput !== "object") {
    return null;
  }

  const record = parsedInput as Record<string, unknown>;
  if (typeof record.widget_code !== "string") {
    return null;
  }

  return buildGenerativeWidgetPayload({
    toolCallId,
    title: typeof record.title === "string" ? record.title : undefined,
    loadingMessages: Array.isArray(record.loading_messages)
      ? record.loading_messages.filter(
          (item): item is string => typeof item === "string",
        )
      : undefined,
    widgetCode: record.widget_code,
    phase: execution.status === "pending" ? "pending" : "preview",
  });
};

const frameClassName = (isMeasured: boolean) =>
  `w-full rounded-xl border-0 bg-transparent ${isMeasured ? "transition-[height] duration-200 ease-out" : ""}`;

interface GenerativeWidgetFrameProps {
  payload: GenerativeWidgetRenderPayload;
  effectivePhase: WidgetRenderPhase;
  shellSrcDoc: string;
  themeTokens: Record<string, string>;
  isDark: boolean;
  isFullscreen?: boolean;
  onPrompt: (text: string) => void;
  onOpenLink: (url: string) => void;
}

const GenerativeWidgetFrame = ({
  payload,
  effectivePhase,
  shellSrcDoc,
  themeTokens,
  isDark,
  isFullscreen = false,
  onPrompt,
  onOpenLink,
}: GenerativeWidgetFrameProps) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const pendingHostMessageRef = useRef<Record<string, unknown> | null>(null);
  const [shellReady, setShellReady] = useState(false);
  const [frameHeight, setFrameHeight] = useState(220);
  const [hasMeasured, setHasMeasured] = useState(false);

  const postToShell = useCallback((nextMessage: Record<string, unknown>) => {
    const targetWindow = iframeRef.current?.contentWindow;
    if (!targetWindow) {
      pendingHostMessageRef.current = nextMessage;
      return;
    }
    targetWindow.postMessage(
      {
        source: HOST_SOURCE,
        ...nextMessage,
      },
      "*",
    );
  }, []);

  useEffect(() => {
    const handleShellMessage = (event: MessageEvent<WidgetShellMessage>) => {
      if (event.source !== iframeRef.current?.contentWindow) {
        return;
      }
      if (!event.data || event.data.source !== SHELL_SOURCE) {
        return;
      }

      if (event.data.type === "widget:ready") {
        setShellReady(true);
        if (pendingHostMessageRef.current) {
          postToShell(pendingHostMessageRef.current);
          pendingHostMessageRef.current = null;
        }
        return;
      }

      if (event.data.type === "widget:resize" && event.data.height) {
        const nextHeight = Math.max(120, Math.ceil(event.data.height));
        setFrameHeight((prev) =>
          Math.abs(prev - nextHeight) > 2 ? nextHeight : prev,
        );
        setHasMeasured(true);
        return;
      }

      if (event.data.type === "widget:prompt" && event.data.text) {
        onPrompt(event.data.text);
        return;
      }

      if (event.data.type === "widget:open-link" && event.data.url) {
        onOpenLink(event.data.url);
        return;
      }

      if (event.data.type === "widget:error" && event.data.message) {
        console.error("[GenerativeWidgetRenderer]", event.data.message);
      }
    };

    window.addEventListener("message", handleShellMessage as EventListener);
    return () => {
      window.removeEventListener(
        "message",
        handleShellMessage as EventListener,
      );
    };
  }, [onOpenLink, onPrompt, postToShell]);

  useEffect(() => {
    const hostMessage =
      effectivePhase === "final"
        ? {
            type: "widget:finalize",
            html: payload.previewHtml,
            finalHtml: payload.finalHtml,
            visualSignature: payload.visualSignature,
            theme: themeTokens,
          }
        : {
            type: shellReady ? "widget:update" : "widget:init",
            html: payload.previewHtml,
            finalHtml: payload.finalHtml,
            visualSignature: payload.visualSignature,
            theme: themeTokens,
          };

    if (!shellReady) {
      pendingHostMessageRef.current = hostMessage;
      return;
    }

    postToShell(hostMessage);
  }, [effectivePhase, payload, postToShell, shellReady, themeTokens]);

  const frameProps: HTMLAttributes<HTMLIFrameElement> = {
    className: frameClassName(hasMeasured),
    title: payload.title,
    style: {
      height: `${frameHeight}px`,
    },
  };

  return (
    <div
      className={
        isFullscreen
          ? "h-full min-h-0 overflow-auto"
          : `overflow-hidden rounded-xl border ${
              isDark
                ? "border-white/10 bg-slate-950/40"
                : "border-slate-200 bg-slate-50/60"
            }`
      }
    >
      <iframe
        {...frameProps}
        ref={iframeRef}
        srcDoc={shellSrcDoc}
        sandbox="allow-scripts allow-forms"
      />
    </div>
  );
};

const GenerativeWidgetRenderer = ({
  execution,
  isDark,
  parsedInput,
  renderDefault,
}: ToolCallCustomRendererProps) => {
  const { message } = App.useApp();
  const interaction = useChatWidgetInteraction();
  const [isFullscreen, setIsFullscreen] = useState(false);

  const payload = useMemo(
    () =>
      getPayloadFromMetadata(execution.metadata) ||
      getFallbackPayload(parsedInput, execution.toolCallId, execution),
    [execution, parsedInput],
  );

  const effectivePhase = useMemo(() => {
    if (!payload) {
      return null;
    }
    if (execution.status === "success") {
      return "final" as const;
    }
    if (execution.status === "failed") {
      return "error" as const;
    }
    return payload.phase;
  }, [execution.status, payload]);

  const shellSrcDoc = useMemo(() => getGenerativeWidgetShellSrcDoc(), []);

  const themeTokens = useMemo(() => getThemeTokens(isDark), [isDark]);

  const displayTitle = payload
    ? humanizeWidgetTitle(payload.title) || payload.title
    : "";
  const widgetPhase = payload ? (effectivePhase ?? payload.phase) : "preview";

  const handlePrompt = useCallback(
    (text: string) => {
      if (!interaction) {
        message.warning("当前上下文不支持从 widget 回写聊天");
        return;
      }
      void interaction.sendPrompt(text);
    },
    [interaction, message],
  );

  const handleOpenLink = useCallback((url: string) => {
    void openExternal(url);
  }, []);

  const handleExportHtml = useCallback(() => {
    if (!payload || execution.toolName !== SHOW_WIDGET_TOOL_NAME) {
      return;
    }

    const exportHtml = getStandaloneGenerativeWidgetHtml({
      documentTitle: displayTitle,
      payload,
      effectivePhase: widgetPhase,
      theme: themeTokens,
    });
    const blob = new Blob([exportHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = getWidgetExportFileName(displayTitle);
    anchor.click();
    URL.revokeObjectURL(url);
    message.success("HTML 已导出");
  }, [
    displayTitle,
    execution.toolName,
    message,
    payload,
    themeTokens,
    widgetPhase,
  ]);

  if (execution.toolName !== SHOW_WIDGET_TOOL_NAME || !payload) {
    return <>{renderDefault()}</>;
  }

  const statusBadge =
    execution.status === "success"
      ? "已完成"
      : execution.status === "failed"
        ? "失败"
        : execution.status === "executing"
          ? "执行中"
          : execution.status === "retrying"
            ? "重试中"
            : "流式生成中";
  const loadingMessage = payload.loadingMessages[0] || "正在生成界面...";
  const warningMessages =
    payload.warningCodes?.map((code) => WIDGET_WARNING_COPY[code] || code) ||
    [];

  return (
    <>
      <ToolCard isDark={isDark}>
        <ToolCardHeader isDark={isDark} divided>
          <ToolSectionTitle
            isDark={isDark}
            action={
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  aria-label="导出 HTML 文件"
                  className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                    isDark
                      ? "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                  }`}
                  onClick={handleExportHtml}
                >
                  <Download size={14} />
                  <span>导出 HTML</span>
                </button>
                <button
                  type="button"
                  aria-label="全屏查看渲染内容"
                  className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                    isDark
                      ? "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                  }`}
                  onClick={() => setIsFullscreen(true)}
                >
                  <Maximize2 size={14} />
                  <span>全屏查看</span>
                </button>
                <ToolBadge isDark={isDark}>{statusBadge}</ToolBadge>
              </div>
            }
          >
            {displayTitle}
          </ToolSectionTitle>
          <ToolMutedText isDark={isDark} className="mt-2 break-words">
            {effectivePhase === "final" ? "Widget 已完成渲染" : loadingMessage}
          </ToolMutedText>
        </ToolCardHeader>
        <ToolCardBody>
          <GenerativeWidgetFrame
            payload={payload}
            effectivePhase={widgetPhase}
            shellSrcDoc={shellSrcDoc}
            themeTokens={themeTokens}
            isDark={isDark}
            onPrompt={handlePrompt}
            onOpenLink={handleOpenLink}
          />
          {warningMessages.length > 0 ? (
            <ToolMutedText
              isDark={isDark}
              className="break-words text-amber-500"
            >
              {warningMessages.join(" ")}
            </ToolMutedText>
          ) : null}
          {execution.status === "failed" && execution.error ? (
            <ToolMutedText isDark={isDark} className="break-words text-red-500">
              {execution.error}
            </ToolMutedText>
          ) : null}
        </ToolCardBody>
      </ToolCard>

      {isFullscreen ? (
        <FullscreenPortal
          title={`${displayTitle} · 全屏预览`}
          onClose={() => setIsFullscreen(false)}
        >
          <div className="h-full min-h-0 overflow-auto">
            <GenerativeWidgetFrame
              payload={payload}
              effectivePhase={widgetPhase}
              shellSrcDoc={shellSrcDoc}
              themeTokens={themeTokens}
              isDark={isDark}
              isFullscreen
              onPrompt={handlePrompt}
              onOpenLink={handleOpenLink}
            />
          </div>
        </FullscreenPortal>
      ) : null}
    </>
  );
};

export default GenerativeWidgetRenderer;
