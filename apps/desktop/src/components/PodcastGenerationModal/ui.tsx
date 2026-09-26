/**
 * 播客弹窗内部的表单小件：字段、日志面板，以及对 @tau/ui 的薄封装（保留旧导出名）。
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Button as TauButton, Input, Textarea, cn } from "@tau/ui";

/** 字段：12px 淡墨标签（可带提示与右侧动作），控件在下 */
export const Field = ({
  label,
  hint,
  action,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) => (
  <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
    <div className="flex min-h-[18px] items-center gap-2">
      <span className="text-ink-2 text-[12px]">{label}</span>
      {hint && <span className="text-ink-3 text-[11.5px] tabular-nums">{hint}</span>}
      <span className="flex-1" />
      {action}
    </div>
    {children}
  </div>
);

/** 可折叠的日志面板：新日志到达时自动滚到底 */
export const LogPanel = ({
  logs,
  defaultOpen = true,
}: {
  logs: string[];
  defaultOpen?: boolean;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs.length, open]);

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="text-ink-2 hover:text-ink-1 flex w-fit items-center gap-1 text-[12px] outline-none"
        aria-expanded={open}
      >
        <ChevronRight
          className={cn(
            "ease-tau-out size-3.5 transition-transform duration-150",
            open && "rotate-90"
          )}
          strokeWidth={1.75}
        />
        详细日志
        <span className="text-ink-3 tabular-nums">{logs.length}</span>
      </button>
      {open && (
        <div
          ref={boxRef}
          className="border-line-1 rounded-tau-sm max-h-64 space-y-0.5 overflow-y-auto border px-3 py-2.5"
        >
          {logs.length === 0 ? (
            <div className="text-ink-3 text-tau-meta">暂无日志</div>
          ) : (
            logs.map((log, index) => (
              <div
                key={index}
                className="text-ink-2 font-tau-mono text-tau-micro whitespace-pre-wrap break-all leading-relaxed"
              >
                {log}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export const SectionTitle = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => <h3 className={cn("text-ink-1 text-tau-body m-0 font-semibold", className)}>{children}</h3>;

export const TextStrong = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => <span className={cn("text-ink-1 font-medium", className)}>{children}</span>;

export const TextSecondary = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => <span className={cn("text-ink-3", className)}>{children}</span>;

export type ButtonVariant = "primary" | "secondary" | "text" | "dashed" | "danger";
export type ButtonSize = "small" | "default";

const VARIANT_MAP = {
  primary: "primary",
  secondary: "secondary",
  text: "ghost",
  dashed: "ghost",
  danger: "danger-soft",
} as const;

/** 旧 API 兼容封装：内部转到 @tau/ui Button（icon 仍接受任意节点） */
export const Button = ({
  children,
  onClick,
  icon,
  variant = "secondary",
  size = "default",
  block = false,
  disabled = false,
  loading = false,
  className,
  title,
  type = "button",
}: {
  children?: React.ReactNode;
  onClick?: () => void;
  icon?: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  title?: string;
  type?: "button" | "submit" | "reset";
}) => (
  <TauButton
    type={type}
    title={title}
    variant={VARIANT_MAP[variant]}
    size={size === "small" ? "sm" : "md"}
    block={block}
    disabled={disabled}
    loading={loading}
    onClick={onClick}
    className={className}
  >
    {!loading && icon}
    {children}
  </TauButton>
);

export const TextInput = ({
  value,
  onChange,
  placeholder,
  disabled,
  maxLength,
  className,
  error,
  type = "text",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  maxLength?: number;
  className?: string;
  error?: boolean;
  type?: string;
}) => (
  <Input
    type={type}
    value={value}
    onChange={e => onChange(e.target.value)}
    placeholder={placeholder}
    disabled={disabled}
    maxLength={maxLength}
    aria-invalid={error || undefined}
    wrapperClassName={className}
  />
);

export const TextArea = ({
  value,
  onChange,
  placeholder,
  disabled,
  maxLength,
  className,
  autoSize,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  maxLength?: number;
  className?: string;
  autoSize?: { minRows: number; maxRows: number };
  autoFocus?: boolean;
}) => {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!autoSize || !ref.current) return;
    const el = ref.current;
    el.style.height = "auto";
    const computed = window.getComputedStyle(el);
    const lineHeight = parseFloat(computed.lineHeight || "20") || 20;
    const minHeight = lineHeight * autoSize.minRows;
    const maxHeight = lineHeight * autoSize.maxRows;
    const next = Math.min(maxHeight, Math.max(minHeight, el.scrollHeight));
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [value, autoSize]);

  return (
    <Textarea
      ref={ref}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      maxLength={maxLength}
      autoFocus={autoFocus}
      rows={autoSize?.minRows}
      className={cn(autoSize && "min-h-0", className)}
    />
  );
};
