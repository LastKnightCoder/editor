import { todosTranslator, useTodosI18n } from "@/features/todos/i18n";
/**
 * 待办域小件：圆形勾选（一次性任务 = 完成；周期任务虚线圈 = 今日打卡，打卡后 ok 绿）、
 * 项目色点、类型图标（截止 warn 旗 / 周期 ok 循环）、优先级信号标、中性标签药丸。
 */

import { Check, Flag, Repeat, type LucideIcon } from "lucide-react";
import { cn } from "@tau/ui";
import type { TodoItemType, TodoPriority } from "@/types";
import { groupDotClass } from "@/utils/groupTone";
const t = todosTranslator.t;

export function TodoCheck({
  checked,
  recurring = false,
  overdue = false,
  size = "md",
  label,
  onToggle,
  disabled = false,
  className,
}: {
  checked: boolean;
  recurring?: boolean;
  overdue?: boolean;
  size?: "sm" | "md" | "lg";
  label: string;
  onToggle(): void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      disabled={disabled}
      aria-checked={checked}
      aria-label={label}
      title={label}
      onClick={event => {
        event.stopPropagation();
        onToggle();
      }}
      className={cn(
        "ease-tau-out relative grid shrink-0 cursor-pointer place-items-center rounded-full border-[1.5px] outline-none transition-[background-color,border-color,color] duration-150 focus-visible:shadow-[var(--tau-focus-ring)] disabled:cursor-not-allowed disabled:opacity-50",
        // 命中面积外扩（视觉 17px，热区 ≥ 24px）
        "after:absolute after:-inset-[5px] after:content-['']",
        size === "sm" && "size-[15px]",
        size === "md" && "size-[17px]",
        size === "lg" && "size-5",
        recurring && !checked && "border-dashed",
        checked
          ? recurring
            ? "border-ok bg-ok text-ink-inverse"
            : "border-accent bg-accent text-ink-inverse"
          : cn(
              "hover:border-accent hover:text-accent text-transparent",
              overdue ? "border-danger" : "border-ink-3"
            ),
        className
      )}
    >
      <Check
        className={size === "sm" ? "size-2.5" : size === "lg" ? "size-3" : "size-[11px]"}
        strokeWidth={3}
      />
    </button>
  );
}

export function GroupDot({ color, className }: { color?: string | null; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("size-2 shrink-0 rounded-[3px]", groupDotClass(color), className)}
    />
  );
}

const TYPE_ICON: Partial<Record<TodoItemType, { icon: LucideIcon; className: string }>> = {
  deadline: { icon: Flag, className: "text-warn" },
  recurring: { icon: Repeat, className: "text-ok" },
};

const TYPE_LABEL: Record<TodoItemType, string> = {
  get normal() {
    return t("kind.normal");
  },
  get deadline() {
    return t("kind.deadline");
  },
  get recurring() {
    return t("kind.recurring");
  },
};

export function TypeIcon({ type, className }: { type: TodoItemType; className?: string }) {
  useTodosI18n();
  const meta = TYPE_ICON[type];
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <Icon
      aria-label={TYPE_LABEL[type]}
      className={cn("size-[13px] shrink-0", meta.className, className)}
      strokeWidth={1.75}
    />
  );
}

export const PRIORITY_TONE: Record<TodoPriority, { badge: string; text: string }> = {
  high: { badge: "bg-danger-soft text-danger", text: "text-danger" },
  medium: { badge: "bg-warn-soft text-warn", text: "text-warn" },
  low: { badge: "bg-info-soft text-info", text: "text-info" },
  none: { badge: "bg-hover text-ink-3", text: "text-ink-3" },
};

/** 3 阶信号条图标：与截止旗标、逾期红圈、项目色点解耦 */
export function PriorityIcon({
  priority,
  className,
}: {
  priority: TodoPriority;
  className?: string;
}) {
  const bars = priority === "high" ? 3 : priority === "medium" ? 2 : priority === "low" ? 1 : 0;
  return (
    <svg aria-hidden viewBox="0 0 12 12" className={cn("size-[11px] shrink-0", className)}>
      <rect
        x="1"
        y="7"
        width="2"
        height="4"
        rx="0.6"
        fill="currentColor"
        opacity={bars >= 1 ? 1 : 0.25}
      />
      <rect
        x="5"
        y="4.5"
        width="2"
        height="6.5"
        rx="0.6"
        fill="currentColor"
        opacity={bars >= 2 ? 1 : 0.25}
      />
      <rect
        x="9"
        y="2"
        width="2"
        height="9"
        rx="0.6"
        fill="currentColor"
        opacity={bars >= 3 ? 1 : 0.25}
      />
    </svg>
  );
}

export function PriorityBadge({
  priority,
  dimmed = false,
  compact = false,
  className,
}: {
  priority?: TodoPriority | null;
  dimmed?: boolean;
  compact?: boolean;
  className?: string;
}) {
  useTodosI18n();
  if (!priority || priority === "none") return null;
  const label = t(`priority.${priority}`);
  const full = t(`priority.full.${priority}`);
  return (
    <span
      title={full}
      aria-label={full}
      className={cn(
        "inline-flex h-[18px] shrink-0 items-center gap-[3px] rounded-[5px] px-[5.5px] text-[10.5px] leading-none font-semibold whitespace-nowrap",
        PRIORITY_TONE[priority].badge,
        dimmed && "opacity-45",
        className
      )}
    >
      {!compact && <PriorityIcon priority={priority} className="size-[10px]" />}
      {label}
    </span>
  );
}

export function TodoTagChip({
  tag,
  active = false,
  onClick,
  className,
}: {
  tag: string;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  useTodosI18n();
  const base = cn(
    "inline-flex h-[19px] max-w-[12em] items-center rounded-full border px-[7px] text-[11px] leading-none whitespace-nowrap transition-[background-color,border-color,color] duration-150",
    active
      ? "bg-accent-soft text-accent-text border-transparent font-medium"
      : "border-line-1 bg-surface text-ink-2",
    onClick &&
      (active
        ? "cursor-pointer hover:opacity-85"
        : "hover:border-ink-3 hover:bg-surface-hover hover:text-ink-1 cursor-pointer"),
    className
  );
  if (onClick) {
    return (
      <button
        type="button"
        title={t(active ? "tags.unfilterBy" : "tags.filterBy", { tag })}
        onClick={event => {
          event.stopPropagation();
          onClick();
        }}
        className={cn(base, "outline-none focus-visible:shadow-[var(--tau-focus-ring)]")}
      >
        <span className="truncate">#{tag}</span>
      </button>
    );
  }
  return (
    <span className={base}>
      <span className="truncate">#{tag}</span>
    </span>
  );
}
