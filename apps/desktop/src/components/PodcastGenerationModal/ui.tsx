import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import classNames from "classnames";

export const SectionTitle = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <h3
    className={classNames(
      "text-sm font-semibold text-gray-800 dark:text-slate-100",
      className,
    )}
  >
    {children}
  </h3>
);

export const TextStrong = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <span
    className={classNames(
      "font-medium text-gray-800 dark:text-slate-100",
      className,
    )}
  >
    {children}
  </span>
);

export const TextSecondary = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <span
    className={classNames(
      "text-gray-500 dark:text-slate-400",
      className,
    )}
  >
    {children}
  </span>
);

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "text"
  | "dashed"
  | "danger";
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
    "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed";
  const sizeClass =
    size === "small" ? "px-2.5 h-7 text-xs" : "px-4 h-10 text-sm";
  const variantClass =
    variant === "primary"
      ? "bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400"
      : variant === "text"
        ? "bg-transparent text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700/60"
        : variant === "dashed"
          ? "border border-dashed border-gray-300 dark:border-slate-600 bg-transparent text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800/50"
          : variant === "danger"
            ? "bg-red-500 text-white hover:bg-red-600 dark:bg-red-500/80 dark:hover:bg-red-500"
            : "border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800";

  return (
    <button
      type={type}
      title={title}
      disabled={disabled || loading}
      onClick={onClick}
      className={classNames(
        base,
        sizeClass,
        variantClass,
        block && "w-full",
        className,
      )}
    >
      {loading && (
        <svg
          className="w-4 h-4 animate-spin"
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
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    disabled={disabled}
    maxLength={maxLength}
    className={classNames(
      "h-10 px-3 rounded-lg border bg-white dark:bg-slate-900 text-sm text-gray-800 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30",
      error
        ? "border-red-400 focus:ring-red-500/30"
        : "border-gray-200 dark:border-slate-700",
      disabled && "opacity-60 cursor-not-allowed",
      // 如果没有传入宽度类，默认使用 w-full
      className?.includes("w-") ? "" : "w-full",
      className,
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
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      maxLength={maxLength}
      autoFocus={autoFocus}
      rows={autoSize?.minRows}
      className={classNames(
        "w-full px-3 py-2 rounded-lg border bg-white dark:bg-slate-900 text-sm text-gray-800 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 resize-none",
        "border-gray-200 dark:border-slate-700",
        disabled && "opacity-60 cursor-not-allowed",
        className,
      )}
    />
  );
};

export interface SelectOption<T extends string | number> {
  value: T;
  label: React.ReactNode;
  searchText?: string;
}

export const SelectField = <T extends string | number>({
  value,
  onChange,
  options,
  placeholder,
  searchable = false,
  disabled = false,
  size = "default",
  className,
}: {
  value?: T;
  onChange: (value: T) => void;
  options: Array<SelectOption<T>>;
  placeholder?: string;
  searchable?: boolean;
  disabled?: boolean;
  size?: ButtonSize;
  className?: string;
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  const [placement, setPlacement] = useState<"bottom" | "top">("bottom");

  // 计算下拉框位置
  const calculatePosition = () => {
    if (!triggerRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const dropdownHeight = dropdownRef.current?.scrollHeight || 280;
    const viewportHeight = window.innerHeight;
    const gap = 6;

    const spaceBelow = viewportHeight - triggerRect.bottom - gap;
    const spaceAbove = triggerRect.top - gap;

    // 决定显示在上方还是下方
    const showAbove = spaceBelow < Math.min(dropdownHeight, 280) && spaceAbove > spaceBelow;

    setPlacement(showAbove ? "top" : "bottom");
    setPosition({
      top: showAbove ? triggerRect.top - gap : triggerRect.bottom + gap,
      left: triggerRect.left,
      width: triggerRect.width,
    });
  };

  useEffect(() => {
    if (!open) return;

    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        dropdownRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
      setQuery("");
    };

    // 立即计算一次位置
    calculatePosition();

    document.addEventListener("mousedown", onDocClick);
    window.addEventListener("scroll", calculatePosition, true);
    window.addEventListener("resize", calculatePosition);

    return () => {
      document.removeEventListener("mousedown", onDocClick);
      window.removeEventListener("scroll", calculatePosition, true);
      window.removeEventListener("resize", calculatePosition);
    };
  }, [open]);

  const selected = useMemo(
    () => options.find((o) => o.value === value),
    [options, value],
  );

  const filtered = useMemo(() => {
    if (!searchable || !query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter((o) =>
      (o.searchText ?? String(o.value))
        .toLowerCase()
        .includes(q),
    );
  }, [options, query, searchable]);

  const triggerClass = classNames(
    "w-full rounded-xl border bg-white dark:bg-slate-900 text-sm text-gray-800 dark:text-slate-100 px-3 flex items-center justify-between cursor-pointer transition-colors",
    size === "small" ? "h-7 text-xs" : "h-10",
    disabled
      ? "opacity-60 cursor-not-allowed"
      : "hover:border-gray-300 dark:hover:border-slate-600",
    "border-gray-200 dark:border-slate-700",
  );

  const dropdownContent = (
    <div
      ref={dropdownRef}
      className="fixed z-[9999] p-2 rounded-2xl bg-white/95 dark:bg-slate-900/90 backdrop-blur-lg border border-white/50 dark:border-white/10 shadow-[0_18px_45px_rgba(15,23,42,0.2)] dark:shadow-[0_22px_60px_rgba(2,6,23,0.6)]"
      style={{
        top: placement === "bottom" ? position.top : "auto",
        bottom: placement === "top" ? `calc(100vh - ${position.top}px)` : "auto",
        left: position.left,
        width: position.width,
      }}
    >
      {searchable && (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索..."
          className="w-full h-9 px-3 mb-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-gray-800 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
          autoFocus
          onClick={(e) => e.stopPropagation()}
        />
      )}
      <div className="max-h-[240px] overflow-y-auto overflow-x-hidden scrollbar-thin">
        {filtered.length === 0 && (
          <div className="px-3 py-2 text-sm text-gray-500 dark:text-slate-400">
            无匹配项
          </div>
        )}
        {filtered.map((o) => (
          <div
            key={String(o.value)}
            role="option"
            aria-selected={o.value === value}
            className={classNames(
              "px-3 py-2 mx-1 mb-0.5 rounded-xl text-sm cursor-pointer transition-colors",
              o.value === value
                ? "bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400"
                : "hover:bg-white/60 dark:hover:bg-slate-700/50 text-gray-700 dark:text-slate-200",
            )}
            onClick={() => {
              onChange(o.value);
              setOpen(false);
              setQuery("");
            }}
          >
            {o.label}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className={classNames("relative", className)}>
      <div
        ref={triggerRef}
        className={triggerClass}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
        role="button"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <div className="truncate flex-1 min-w-0">
          {selected?.label ?? (
            <span className="text-gray-400 dark:text-slate-500">
              {placeholder ?? "请选择"}
            </span>
          )}
        </div>
        <svg
          className={classNames(
            "w-4 h-4 shrink-0 ml-2 transition-transform text-gray-400 dark:text-slate-500",
            open && "rotate-180",
          )}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>

      {open && createPortal(dropdownContent, document.body)}
    </div>
  );
};

