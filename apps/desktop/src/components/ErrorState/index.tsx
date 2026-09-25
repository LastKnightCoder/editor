/**
 * 错误态 + 可恢复错误边界（三层兜底：路由 errorElement / 页面栈每页 / 局部区域如块预览）。
 *
 * - ErrorState：纯展示。说人话的标题 + 说明 + 恢复动作，技术细节默认折叠（可一键复制，
 *   便于反馈），不把堆栈直接甩给用户。size="page" 整窗居中；"panel" 嵌在区域内。
 * - RecoverableBoundary：捕获子树渲染错误，fallback 拿到 reset；resetKeys 任一变化自动复位
 *   （如预览切换到另一块、页面参数变化），无需用户手动点重试。
 */

import { Component, useState, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, ChevronRight, Copy, Check } from "lucide-react";
import { Button, cn } from "@tau/ui";

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
            <div className="flex items-center justify-between">
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
              <button
                type="button"
                onClick={copy}
                className="text-tau-sm text-ink-3 hover:text-ink-1 flex items-center gap-1 rounded-[6px] outline-none focus-visible:shadow-[var(--tau-focus-ring)]"
              >
                {copied ? (
                  <Check size={13} strokeWidth={2} />
                ) : (
                  <Copy size={13} strokeWidth={1.75} />
                )}
                {copied ? "已复制" : "复制错误信息"}
              </button>
            </div>
            {expanded && (
              <pre className="bg-sunken border-line-1 text-ink-2 font-tau-mono rounded-tau-md mt-2 max-h-[220px] overflow-auto whitespace-pre-wrap break-words border px-3 py-2 text-[11.5px] leading-relaxed">
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
