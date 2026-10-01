import type { ReactNode } from "react";
import { cn } from "@tau/ui";
import type { LucideIcon } from "lucide-react";

/**
 * 块右上角的悬浮操作条（代码块、源码预览块共用）：浅色实底 + 描边 + 浮起投影，随主题。
 * 显隐交给调用方的 group-hover 类（Tailwind 需要静态类名），例如
 * `group-hover/code:pointer-events-auto group-hover/code:translate-y-0 group-hover/code:opacity-100`。
 */
export const FloatingToolbar = ({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) => (
  <div
    className={cn(
      "pointer-events-none absolute right-[0.5em] top-[0.5em] z-[4] flex -translate-y-[2px] items-center gap-px rounded-[0.5625em] bg-[var(--ed-bg-surface)] p-[2px] text-[var(--ed-text-tertiary)] opacity-0 shadow-[inset_0_0_0_1px_var(--ed-border),var(--ed-shadow-lift)] transition-[opacity,transform] duration-150 ease-[var(--tau-ease-out)]",
      className
    )}
    onClick={e => e.stopPropagation()}
  >
    {children}
  </div>
);

export const ToolbarDivider = () => (
  <span className="mx-[0.2em] h-[0.875em] w-px shrink-0 bg-[var(--ed-border)]" />
);

export const ToolbarIconButton = ({
  icon: Icon,
  title,
  onClick,
  disabled,
  tone = "default",
  active,
  className,
}: {
  icon: LucideIcon;
  title: string;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "default" | "danger" | "ok";
  /** 按下态（开关类按钮） */
  active?: boolean;
  className?: string;
}) => (
  <button
    type="button"
    title={title}
    aria-label={title}
    aria-pressed={active}
    disabled={disabled}
    className={cn(
      "flex h-[1.75em] w-[1.75em] shrink-0 cursor-pointer items-center justify-center rounded-[0.375em] text-[var(--ed-text-tertiary)] transition-colors duration-150 hover:bg-[var(--ed-bg-hover)] hover:text-[var(--ed-text)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[var(--ed-text-tertiary)]",
      tone === "danger" && "hover:bg-[var(--ed-danger-soft)] hover:text-[var(--ed-danger)]",
      tone === "ok" && "text-[var(--ed-ok)] hover:text-[var(--ed-ok)]",
      active && "bg-[var(--ed-accent-soft)] text-[var(--ed-accent-text)]",
      className
    )}
    onClick={onClick}
  >
    <Icon size="1em" strokeWidth={1.9} />
  </button>
);
