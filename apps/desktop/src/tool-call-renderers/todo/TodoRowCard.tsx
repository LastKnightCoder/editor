import { CalendarDays, FileText, Repeat, type LucideIcon } from "lucide-react";
import { Tooltip, cn } from "@tau/ui";
import { TodoCheck, TypeIcon } from "@/features/todos/components/TodoBits";
import { typeLabelMap } from "./constants";
import { formatTime, isOverdue, getSecondaryInfoItems, type SecondaryInfoKind } from "./utils";
import type { TodoRowCardProps } from "./types";

const SECONDARY_ICONS: Record<SecondaryInfoKind, LucideIcon> = {
  notes: FileText,
  calendar: CalendarDays,
  recurrence: Repeat,
};

/**
 * 对话内的待办行（D-048）：沿用待办页口径——圆形勾选（TodoCheck）、类型小图标（截止 warn 旗 /
 * 计划 info 钟 / 周期 ok 循环）、meta 行 ink-3；逾期只染 danger 字，不上彩色徽章。
 * isDark 保留仅为接口兼容，不参与取色。
 */
const TodoRowCard = ({ item, onToggleComplete }: TodoRowCardProps) => {
  const overdueStatus = Boolean(isOverdue(item));
  const secondaryInfoItems = getSecondaryInfoItems(item);
  const meta = [
    item.group?.title ?? item.groupId,
    item.dueAt ? formatTime(item.dueAt) : null,
    formatTime(item.updateTime),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex items-start gap-2.5">
      <TodoCheck
        className="mt-[2px]"
        checked={item.isCompleted}
        recurring={item.type === "recurring"}
        overdue={overdueStatus}
        label={item.isCompleted ? "标记为未完成" : "标记为已完成"}
        onToggle={() => void onToggleComplete(item)}
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <div
            className={cn(
              "text-tau-body min-w-0 flex-1 font-medium",
              item.isCompleted ? "text-ink-3 line-through" : "text-ink-1"
            )}
          >
            {item.title}
          </div>
          {item.type !== "normal" ? (
            <Tooltip content={typeLabelMap[item.type]}>
              <span className="inline-flex items-center">
                <TypeIcon type={item.type} />
              </span>
            </Tooltip>
          ) : null}
          {secondaryInfoItems.map(info => {
            const Icon = SECONDARY_ICONS[info.kind];
            return (
              <Tooltip key={info.kind} content={info.tooltip}>
                <span className="text-tau-tiny text-ink-3 inline-flex items-center gap-0.5 tabular-nums">
                  <Icon className="size-3" strokeWidth={1.75} />
                  {info.text}
                </span>
              </Tooltip>
            );
          })}
        </div>

        {overdueStatus && (
          <div className="text-tau-sm text-danger mt-0.5 tabular-nums">
            逾期：{formatTime(item.dueAt)}
          </div>
        )}

        <div className="text-tau-tiny text-ink-3 mt-0.5 tabular-nums">{meta}</div>

        {item.descriptionMarkdown ? (
          <div className="text-tau-sm text-ink-2 mt-1.5 line-clamp-2">
            {item.descriptionMarkdown}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default TodoRowCard;
