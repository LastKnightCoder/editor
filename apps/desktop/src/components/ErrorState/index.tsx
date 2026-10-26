/**
 * 错误态 + 可恢复错误边界（三层兜底：路由 errorElement / 页面栈每页 / 局部区域如块预览）。
 *
 * - ErrorState：说人话的标题 + 说明 + 恢复动作，技术细节默认折叠（可一键复制，或一键发送
 *   错误报告），不把堆栈直接甩给用户。size="page" 整窗居中；"panel" 嵌在区域内。
 * - RecoverableBoundary：捕获子树渲染错误，fallback 拿到 reset；resetKeys 任一变化自动复位
 *   （如预览切换到另一块、页面参数变化），无需用户手动点重试。
 */

import { Component, useRef, useState, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, ChevronRight, Copy, Check, Send } from "lucide-react";
import { Button, Tooltip, cn } from "@tau/ui";
import { useThemeStore } from "@tau/themes/react";
import { isElectron } from "@/electron";
import { submitFeedback } from "@/commands/feedback";
import { APP_FEEDBACK_LIMITS } from "@/types/app-feedback";

export interface ErrorAction {
  label: string;
  onClick: () => void;
  variant?: "primary" | "secondary" | "ghost";
}

export interface ErrorStateProps {
  error?: unknown;
  title?: string;
  description?: ReactNode;
  actions?: ErrorAction[];
  size?: "page" | "panel";
  className?: string;
}

/** 任意 throw 值 → 可读的一行摘要 + 详情（堆栈 / 组件栈） */
export function describeError(error: unknown): { summary: string; detail: string } {
  if (error instanceof Error) {
    return { summary: `${error.name}: ${error.message}`, detail: error.stack ?? "" };
  }
  if (error && typeof error === "object") {
    // react-router 的 ErrorResponse：{ status, statusText, data }
    const e = error as { status?: number; statusText?: string; data?: unknown };
    if (typeof e.status === "number") {
      return {
        summary: `${e.status} ${e.statusText ?? ""}`.trim(),
        detail: typeof e.data === "string" ? e.data : JSON.stringify(e.data, null, 2),
      };
    }
    try {
      return { summary: JSON.stringify(error), detail: "" };
    } catch {
      /* 循环引用等，落到 String() */
    }
  }
  return { summary: String(error ?? "未知错误"), detail: "" };
}

/** 错误报告正文：标题 + 摘要 + 堆栈，超长时截断堆栈尾部 */
export function errorReportMessage(title: string, summary: string, detail: string) {
  const head = `【错误报告】${title}\n${summary}`;
  const room = APP_FEEDBACK_LIMITS.message - head.length - 2;
  return detail && room > 0
    ? `${head}\n\n${detail.slice(0, room)}`
    : head.slice(0, APP_FEEDBACK_LIMITS.message);
}

type ReportState = { phase: "idle" | "sending" | "sent" } | { phase: "failed"; message: string };

const LINK_CLASS =
  "text-tau-sm text-ink-3 hover:text-ink-1 flex items-center gap-1 rounded-[6px] outline-none focus-visible:shadow-[var(--tau-focus-ring)] disabled:pointer-events-none";

/** 一键发送错误报告：附带错误详情、环境信息与本次运行日志；同一错误重试复用请求 ID，不重复提交 */
function ReportButton({
  title,
  summary,
  detail,
}: {
  title: string;
  summary: string;
  detail: string;
}) {
  const [state, setState] = useState<ReportState>({ phase: "idle" });
  const requestId = useRef(crypto.randomUUID());
  const send = async () => {
    setState({ phase: "sending" });
    try {
      const { theme, mode } = useThemeStore.getState();
      const result = await submitFeedback({
        kind: "bug",
        message: errorReportMessage(title, summary, detail),
        clientRequestId: requestId.current,
        includeContext: true,
        theme: `${theme} · ${mode}`,
        page: null,
        images: [],
        logs: { app: true, perf: false },
      });
      setState(result.ok ? { phase: "sent" } : { phase: "failed", message: result.message });
    } catch (error) {
      setState({ phase: "failed", message: error instanceof Error ? error.message : "发送失败" });
    }
  };
  if (state.phase === "sent")
    return (
      <span className="text-tau-sm text-ok flex items-center gap-1">
        <Check size={13} strokeWidth={2} />
        已发送，谢谢
      </span>
    );
  return (
    <Tooltip
      content={
        state.phase === "failed" ? state.message : "附带错误详情、版本与系统信息、本次运行日志"
      }
    >
      <button
        type="button"
        disabled={state.phase === "sending"}
        onClick={() => void send()}
        className={cn(LINK_CLASS, state.phase === "failed" && "text-danger hover:text-danger")}
      >
        <Send size={13} strokeWidth={1.75} />
        {state.phase === "sending"
          ? "发送中…"
          : state.phase === "failed"
            ? "发送失败，重试"
            : "发送错误报告"}
      </button>
    </Tooltip>
  );
}

export function ErrorState({
  error,
  title = "出了点问题",
  description = "这部分内容渲染时发生了意外错误。你的数据没有丢失，可以重试或换个地方继续。",
  actions = [],
  size = "panel",
  className,
}: ErrorStateProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const { summary, detail } = describeError(error);
  const hasError = error !== undefined;

  const copy = () => {
    const text = [summary, detail, `\n— ${navigator.userAgent}`, new Date().toISOString()]
      .filter(Boolean)
      .join("\n");
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };

  return (
    <div
      role="alert"
      className={cn(
        "flex w-full items-center justify-center",
        size === "page"
          ? "bg-page font-tau text-tau-body h-screen p-8"
          : "h-full min-h-[240px] p-6",
        className
      )}
    >
      <div
        className={cn(
          "flex w-full flex-col items-center text-center",
          size === "page" ? "max-w-[460px]" : "max-w-[400px]"
        )}
      >
        <span
          className={cn(
            "bg-danger-soft text-danger grid shrink-0 place-items-center rounded-full",
            size === "page" ? "size-14" : "size-11"
          )}
        >
          <AlertTriangle size={size === "page" ? 24 : 20} strokeWidth={1.75} />
        </span>
        <h2
          className={cn(
            "text-ink-1 mt-4 font-semibold",
            size === "page" ? "text-[18px]" : "text-[15px]"
          )}
        >
          {title}
        </h2>
        <p className="text-tau-sm text-ink-2 mt-1.5 leading-relaxed">{description}</p>

        {actions.length > 0 && (
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            {actions.map((a, i) => (
              <Button
                key={a.label}
                size={size === "page" ? "md" : "sm"}
                variant={a.variant ?? (i === 0 ? "primary" : "secondary")}
                onClick={a.onClick}
              >
                {a.label}
              </Button>
            ))}
          </div>
        )}

        {hasError && (
          <div className="mt-6 w-full text-left">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setExpanded(v => !v)}
                aria-expanded={expanded}
                className="text-tau-sm text-ink-3 hover:text-ink-1 flex items-center gap-1 rounded-[6px] outline-none focus-visible:shadow-[var(--tau-focus-ring)]"
              >
                <ChevronRight
                  size={14}
                  strokeWidth={1.75}
                  className={cn(
                    "ease-tau-out transition-transform duration-[160ms]",
                    expanded && "rotate-90"
                  )}
                />
                技术详情
              </button>
              <span className="ml-auto" />
              {isElectron && <ReportButton title={title} summary={summary} detail={detail} />}
              <button type="button" onClick={copy} className={LINK_CLASS}>
                {copied ? (
                  <Check size={13} strokeWidth={2} />
                ) : (
                  <Copy size={13} strokeWidth={1.75} />
                )}
                {copied ? "已复制" : "复制错误信息"}
              </button>
            </div>
            {expanded && (
              <pre className="bg-sunken border-line-1 text-ink-2 font-tau-mono rounded-tau-md mt-2 max-h-[220px] overflow-auto border px-3 py-2 text-[11.5px] leading-relaxed break-words whitespace-pre-wrap">
                {summary}
                {detail && `\n\n${detail}`}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface RecoverableBoundaryProps {
  children: ReactNode;
  fallback: (props: { error: unknown; reset: () => void }) => ReactNode;
  /** 任一值变化即自动复位（浅比较） */
  resetKeys?: unknown[];
  onError?: (error: unknown, info: ErrorInfo) => void;
}

interface RecoverableBoundaryState {
  error: unknown;
  hasError: boolean;
}

const keysChanged = (a: unknown[] = [], b: unknown[] = []) =>
  a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]));

export class RecoverableBoundary extends Component<
  RecoverableBoundaryProps,
  RecoverableBoundaryState
> {
  state: RecoverableBoundaryState = { error: undefined, hasError: false };

  static getDerivedStateFromError(error: unknown): RecoverableBoundaryState {
    return { error, hasError: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("[RecoverableBoundary]", error, info.componentStack);
    this.props.onError?.(error, info);
  }

  componentDidUpdate(prev: RecoverableBoundaryProps) {
    if (this.state.hasError && keysChanged(prev.resetKeys, this.props.resetKeys)) this.reset();
  }

  reset = () => this.setState({ error: undefined, hasError: false });

  render() {
    if (this.state.hasError)
      return this.props.fallback({ error: this.state.error, reset: this.reset });
    return this.props.children;
  }
}
