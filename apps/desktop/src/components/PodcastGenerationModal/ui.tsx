import { useEffect, useRef } from "react";
import classNames from "classnames";

export const SectionTitle = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => <h3 className={classNames("text-ink-1 text-tau-body font-[600]", className)}>{children}</h3>;

export const TextStrong = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => <span className={classNames("text-ink-1 font-medium", className)}>{children}</span>;

export const TextSecondary = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => <span className={classNames("text-ink-3", className)}>{children}</span>;

export type ButtonVariant = "primary" | "secondary" | "text" | "dashed" | "danger";
export type ButtonSize = "small" | "default";

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
}) => {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-tau-sm font-medium transition-colors ease-tau-out focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed";
  const sizeClass = size === "small" ? "px-2.5 h-7 text-tau-sm" : "px-4 h-9 text-tau-body";
  const variantClass =
    variant === "primary"
      ? "bg-accent text-ink-inverse hover:bg-accent-hover"
      : variant === "text"
        ? "bg-transparent text-ink-2 hover:bg-hover"
        : variant === "dashed"
          ? "border-line-2 text-ink-3 hover:text-ink-2 hover:border-ink-3/50 border border-dashed bg-transparent"
          : variant === "danger"
            ? "bg-danger text-ink-inverse hover:opacity-90"
            : "border-line-1 bg-surface text-ink-1 hover:bg-hover border";

  return (
    <button
      type={type}
      title={title}
      disabled={disabled || loading}
      onClick={onClick}
      className={classNames(base, sizeClass, variantClass, block && "w-full", className)}
    >
      {loading && (
        <svg
          className="h-4 w-4 animate-spin"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="9" strokeOpacity="0.25" />
          <path d="M12 3a9 9 0 0 1 9 9" strokeLinecap="round" />
        </svg>
      )}
      {!loading && icon}
      {children}
    </button>
  );
};

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
  <input
    type={type}
    value={value}
    onChange={e => onChange(e.target.value)}
    placeholder={placeholder}
    disabled={disabled}
    maxLength={maxLength}
    className={classNames(
      "border-line-1 bg-surface text-ink-1 placeholder:text-ink-3 focus:border-accent rounded-tau-sm text-tau-body h-9 border px-3 outline-none transition-colors [appearance:textfield] focus:shadow-[var(--tau-focus-ring)] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
      error ? "border-danger focus:shadow-[0_0_0_3px_var(--tau-danger-soft)]" : "",
      disabled && "cursor-not-allowed opacity-60",
      // 如果没有传入宽度类，默认使用 w-full
      className?.includes("w-") ? "" : "w-full",
      className
    )}
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
  }, [value, autoSize]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      maxLength={maxLength}
      autoFocus={autoFocus}
      rows={autoSize?.minRows}
      className={classNames(
        "border-line-1 bg-surface text-ink-1 placeholder:text-ink-3 focus:border-accent rounded-tau-sm text-tau-body w-full resize-none border px-3 py-2 outline-none transition-colors",
        disabled && "cursor-not-allowed opacity-60",
        className
      )}
    />
  );
};
