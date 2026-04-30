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
      "text-sm font-semibold text-gray-800 dark:text-zinc-100",
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
      "font-medium text-gray-800 dark:text-zinc-100",
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
  <span className={classNames("text-gray-500 dark:text-zinc-400", className)}>
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
    "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors duration-150 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed";
  const sizeClass =
    size === "small" ? "px-2.5 h-7 text-xs" : "px-4 h-9 text-sm";
  const variantClass =
    variant === "primary"
      ? "bg-gray-900 text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200 shadow-[0_1px_2px_rgba(0,0,0,0.1)]"
      : variant === "text"
        ? "bg-transparent text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700/60"
        : variant === "dashed"
          ? "border border-dashed border-gray-300 dark:border-zinc-600 bg-transparent text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200 hover:border-gray-400 dark:hover:border-zinc-500"
          : variant === "danger"
            ? "bg-red-500 text-white hover:bg-red-600 dark:bg-red-500/80 dark:hover:bg-red-500"
            : "bg-white dark:bg-zinc-900 text-gray-700 dark:text-zinc-200 shadow-[0_0_0_1px_rgba(34,42,53,0.1),0_1px_2px_rgba(0,0,0,0.06)] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.08)] hover:bg-gray-50 dark:hover:bg-zinc-800";

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
      "h-9 px-3 rounded-lg border bg-white dark:bg-zinc-900 text-sm text-gray-800 dark:text-zinc-100 placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-gray-900/10 dark:focus:ring-white/10 transition-colors duration-150 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
      error
        ? "border-red-400 focus:ring-red-500/30"
        : "border-gray-200 dark:border-zinc-700",
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
        "w-full px-3 py-2 rounded-lg border bg-white dark:bg-zinc-900 text-sm text-gray-800 dark:text-zinc-100 placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-gray-900/10 dark:focus:ring-white/10 resize-none transition-colors duration-150",
        "border-gray-200 dark:border-zinc-700",
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
  creatable = false,
  disabled = false,
  size = "default",
  className,
}: {
  value?: T;
  onChange: (value: T) => void;
  options: Array<SelectOption<T>>;
  placeholder?: string;
  searchable?: boolean;
  creatable?: boolean;
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
    const showAbove =
      spaceBelow < Math.min(dropdownHeight, 280) && spaceAbove > spaceBelow;

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
      (o.searchText ?? String(o.value)).toLowerCase().includes(q),
    );
  }, [options, query, searchable]);

  const showCreatable = useMemo(() => {
    if (!creatable || !query.trim()) return false;
    return !options.some((o) => String(o.value) === query.trim());
  }, [creatable, query, options]);

  const triggerClass = classNames(
    "w-full rounded-lg bg-white dark:bg-zinc-900 text-sm text-gray-800 dark:text-zinc-100 px-3 flex items-center justify-between cursor-pointer transition-colors duration-150",
    size === "small" ? "h-7 text-xs" : "h-9",
    disabled
      ? "opacity-50 cursor-not-allowed"
      : "hover:bg-gray-50 dark:hover:bg-zinc-800",
    "shadow-[0_0_0_1px_rgba(34,42,53,0.1),0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.08)]",
  );

  const dropdownContent = (
    <div
      ref={dropdownRef}
      className="fixed z-[9999] p-1.5 rounded-xl bg-white dark:bg-zinc-900 shadow-[0_0_0_1px_rgba(34,42,53,0.08),0_1px_5px_-4px_rgba(19,19,22,0.7),0_4px_8px_rgba(34,42,53,0.05)] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_4px_16px_rgba(0,0,0,0.4)]"
      style={{
        top: placement === "bottom" ? position.top : "auto",
        bottom:
          placement === "top" ? `calc(100vh - ${position.top}px)` : "auto",
        left: position.left,
        width: position.width,
      }}
    >
      {searchable && (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && showCreatable) {
              onChange(query.trim() as T);
              setOpen(false);
              setQuery("");
            }
          }}
          placeholder="搜索..."
          className="w-full h-8 px-3 mb-1.5 rounded-lg border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800 text-sm text-gray-800 dark:text-zinc-100 placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-gray-900/10 dark:focus:ring-white/10"
          autoFocus
          onClick={(e) => e.stopPropagation()}
        />
      )}
      <div className="max-h-[240px] overflow-y-auto overflow-x-hidden scrollbar-thin">
        {showCreatable && (
          <div
            className="px-3 py-1.5 mx-0.5 mb-0.5 rounded-lg text-sm cursor-pointer transition-colors hover:bg-gray-100 dark:hover:bg-zinc-700/50 text-gray-900 dark:text-gray-100 font-medium"
            onClick={() => {
              onChange(query.trim() as T);
              setOpen(false);
              setQuery("");
            }}
          >
            使用 "{query.trim()}"
          </div>
        )}
        {filtered.length === 0 && !showCreatable && (
          <div className="px-3 py-2 text-sm text-gray-500 dark:text-zinc-400">
            无匹配项
          </div>
        )}
        {filtered.map((o) => (
          <div
            key={String(o.value)}
            role="option"
            aria-selected={o.value === value}
            className={classNames(
              "px-3 py-1.5 mx-0.5 mb-0.5 rounded-lg text-sm cursor-pointer transition-colors duration-100",
              o.value === value
                ? "bg-gray-900/[0.06] text-gray-900 dark:bg-white/[0.08] dark:text-white font-medium"
                : "hover:bg-gray-100 dark:hover:bg-zinc-700/50 text-gray-700 dark:text-zinc-200",
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
          {selected?.label ??
            (value ? (
              <span>{String(value)}</span>
            ) : (
              <span className="text-gray-400 dark:text-zinc-500">
                {placeholder ?? "请选择"}
              </span>
            ))}
        </div>
        <svg
          className={classNames(
            "w-4 h-4 shrink-0 ml-2 transition-transform text-gray-400 dark:text-zinc-500",
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
