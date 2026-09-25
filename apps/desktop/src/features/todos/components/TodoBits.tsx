/**
 * 待办域小件：圆形勾选（一次性任务 = 完成；周期任务虚线圈 = 今日打卡，打卡后 ok 绿）、
 * 项目色点、类型图标（截止 warn 旗 / 计划 info 钟 / 周期 ok 循环）。
 */

import { Check, Clock, Flag, Repeat, type LucideIcon } from "lucide-react";
import { cn } from "@tau/ui";
import type { TodoItemType } from "@/types";
import { groupDotClass } from "@/utils/groupTone";

export function TodoCheck({
  checked,
  recurring = false,
  overdue = false,
  size = "md",
  label,
  onToggle,
  className,
}: {
  checked: boolean;
  recurring?: boolean;
  overdue?: boolean;
  size?: "sm" | "md" | "lg";
  label: string;
  onToggle(): void;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      title={label}
      onClick={event => {
        event.stopPropagation();
        onToggle();
      }}
      className={cn(
        "ease-tau-out relative grid shrink-0 cursor-pointer place-items-center rounded-full border-[1.5px] outline-none transition-[background-color,border-color,color] duration-150 focus-visible:shadow-[var(--tau-focus-ring)]",
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
  planned: { icon: Clock, className: "text-info" },
  recurring: { icon: Repeat, className: "text-ok" },
};

const TYPE_LABEL: Record<TodoItemType, string> = {
  normal: "普通",
  deadline: "截止",
  planned: "计划",
  recurring: "周期",
};

export function TypeIcon({ type, className }: { type: TodoItemType; className?: string }) {
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
