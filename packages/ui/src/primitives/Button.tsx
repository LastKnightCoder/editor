/**
 * Button —— 文字按钮基础件（方案 B「现代产品」形制，mockups/button/，D-013）。
 *
 * 变体六档是一个动作的全部音量，层级纪律靠评审不进 API：
 *  - primary：accent 实心 + 微投影，每屏至多一枚；Dialog 应答区主按钮位
 *  - secondary：surface 亮底 + line-1 描边（D-007/D-009「浮起物」口径），应答与取消的默认档
 *  - soft：accent-soft 平底，工具栏高频次级强调（比 secondary 轻、比 ghost 重）
 *  - ghost：无底 hover 淡墨，与 IconButton 同反馈语言
 *  - danger / danger-soft：对齐 D-011 危险分级——实心红只给确认位，列表/工具栏一律 soft
 *
 * 行为契约：loading = aria-busy + spinner + 文案切换 + 一并 disabled（指针封锁与
 * Tab 队列退出由原生 disabled 承担）；disabled 同理走原生属性；focus-visible 才显
 * 焦点环（鼠标点击不显、Tab 才显）；图标仅左位 16px，icon-only 归 IconButton。
 * 反馈是「光」的（换色 / 边框加深 / brightness），无位移。
 */

import type { ComponentProps } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../cn";
import { Spinner } from "./Loading";

export type ButtonVariant = "primary" | "secondary" | "soft" | "ghost" | "danger" | "danger-soft";

export interface ButtonProps extends ComponentProps<"button"> {
  variant?: ButtonVariant;
  size?: "sm" | "md";
  /** 左位图标（16px stroke 1.75）；纯图标按钮走 IconButton，不设 icon-only 档 */
  icon?: LucideIcon;
  /** 满宽（空态 CTA / 窄容器） */
  block?: boolean;
  /** 载入中：spinner + aria-busy + 文案切换 + disabled，点击不触发 */
  loading?: boolean;
  /** loading 时的文案（默认保持 children 不变） */
  loadingText?: string;
}

const BASE =
  "text-tau-body inline-flex h-[34px] cursor-pointer items-center justify-center gap-[7px] rounded-[10px] " +
  "px-[17px] font-[550] whitespace-nowrap select-none outline-none " +
  "ease-tau-out transition-[background,border-color,box-shadow,filter,color] duration-[140ms] " +
  "focus-visible:shadow-[var(--tau-focus-ring)] " +
  "disabled:pointer-events-none disabled:cursor-default disabled:opacity-45";

const SIZE_SM = "text-tau-meta h-[28px] gap-[6px] px-[13px]";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-ink-inverse font-[600] hover:bg-accent-hover active:brightness-[0.95] " +
    "shadow-[0_1px_2px_color-mix(in_oklab,var(--tau-accent)_40%,transparent)]",
  secondary: "border-line-1 bg-surface text-ink-1 border hover:border-ink-3 active:bg-hover",
  soft: "bg-accent-soft text-accent-text hover:bg-accent/20 active:bg-accent/25",
  ghost: "text-ink-2 hover:bg-hover hover:text-ink-1 active:bg-press disabled:opacity-55",
  danger: "bg-danger text-ink-inverse font-[600] hover:brightness-[1.06] active:brightness-[0.95]",
  "danger-soft": "bg-danger-soft text-danger hover:bg-danger/20 active:bg-danger/25",
};

export function Button({
  variant = "secondary",
  size = "md",
  icon: Icon,
  block,
  loading = false,
  loadingText,
  className,
  type = "button",
  disabled,
  onClick,
  children,
  ref,
  ...props
}: ButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        BASE,
        size === "sm" && SIZE_SM,
        VARIANTS[variant],
        block && "w-full",
        className
      )}
      onClick={e => {
        if (loading) return;
        onClick?.(e);
      }}
      {...props}
    >
      {loading && <Spinner className="border-current/30 size-[13px] border-t-current" />}
      {Icon && <Icon size={16} strokeWidth={1.75} className="shrink-0" />}
      {loading && loadingText !== undefined ? loadingText : children}
    </button>
  );
}
