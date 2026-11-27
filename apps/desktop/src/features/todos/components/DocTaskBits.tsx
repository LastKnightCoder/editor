import { todosTranslator, useTodosI18n } from "@/features/todos/i18n";
import { dayWord, monthDay } from "@/utils/date-format";
/**
 * 文档待办的行与小件：勾选写回原文（乐观更新）；行尾显示来源文档，点来源打开原文并定位到该项。
 * 文档条目没有删除 / 改期 / 移动菜单——这些都在原文里改。
 */

import { Bell, FileText } from "lucide-react";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import { cn } from "@tau/ui";
import { reminderMessages, summarizeDocumentReminders } from "@tau/shared/reminders";
import { openEntity } from "@/services/open-content";
import type { DocTaskItem, DocTaskSource } from "@/types/doc-tasks";
import { bucketForDay, dayDiff } from "../model";
import type { BucketKey } from "../types";
import { TodoCheck } from "./TodoBits";
const t = todosTranslator.t;

export function docTaskBucket(task: DocTaskItem, now: number): BucketKey {
  return task.dueAt == null ? "none" : bucketForDay(dayDiff(task.dueAt, now), now);
}

export function openDocTask(source: DocTaskSource, task?: DocTaskItem) {
  void openEntity(source.ref, task ? { at: { taskId: task.taskId } } : {});
}

export function DocTaskRow({
  task,
  source,
  now,
  showSource,
  indent = 0,
  selected = false,
  onToggle,
  onOpen,
}: {
  task: DocTaskItem;
  source: DocTaskSource | undefined;
  now: number;
  /** 混排在议程里时行尾显示来源文档 */
  showSource: boolean;
  indent?: number;
  selected?: boolean;
  onToggle(task: DocTaskItem): void;
  onOpen(task: DocTaskItem): void;
}) {
  const { locale } = useTodosI18n();
  const { t: tReminder } = useI18n(reminderMessages, desktopI18n);
  const overdue = !task.checked && task.dueAt != null && dayDiff(task.dueAt, now) < 0;
  const hasReminders = Boolean(task.reminders?.length);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={selected || undefined}
      data-doc-task={task.taskId}
      onClick={() => onOpen(task)}
      onKeyDown={e => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter") {
          e.preventDefault();
          onOpen(task);
        } else if (e.key === " ") {
          e.preventDefault();
          onToggle(task);
        }
      }}
      style={indent ? { paddingLeft: `calc(1.25rem + ${indent * 22}px)` } : undefined}
      className={cn(
        "ease-tau-out grid min-h-[38px] cursor-pointer select-none grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-2 rounded-[9px] py-[3px] pl-5 pr-2.5 outline-none transition-[background] duration-150 focus-visible:shadow-[var(--tau-focus-ring)]",
        selected ? "bg-selected" : "hover:bg-hover"
      )}
    >
      <TodoCheck
        checked={task.checked}
        overdue={overdue}
        label={task.checked ? t("doc.uncheck") : t("doc.check")}
        onToggle={() => onToggle(task)}
      />
      <span className="flex min-w-0 flex-col">
        <span className={cn("text-tau-body truncate", task.checked && "text-ink-3 line-through")}>
          {task.title || t("common.untitled")}
        </span>
        {(task.dueAt != null || hasReminders) && (
          <span className="text-ink-3 flex flex-wrap items-center gap-2 text-[11.5px] tabular-nums">
            {task.dueAt != null && (
              <span className={cn(overdue && "text-danger")}>
                {overdue
                  ? t("doc.overdueDate", { date: monthDay(task.dueAt, locale) })
                  : dayWord(task.dueAt, now, locale)}
              </span>
            )}
            {hasReminders && (
              <span className="inline-flex items-center gap-1">
                <Bell className="size-[11px] shrink-0" strokeWidth={1.75} />
                {summarizeDocumentReminders(task.reminders ?? [], Boolean(task.recurring), now, {
                  locale,
                  t: tReminder,
                })}
              </span>
            )}
          </span>
        )}
      </span>
      {showSource && source && (
        <button
          type="button"
          title={t("doc.locateSource", { title: source.title })}
          onClick={e => {
            e.stopPropagation();
            openDocTask(source, task);
          }}
          className="text-ink-3 hover:text-accent-text flex max-w-[16em] items-center gap-1 text-[11.5px] whitespace-nowrap"
        >
          <FileText className="size-[11px] shrink-0" strokeWidth={1.75} />
          <span className="truncate">{source.title}</span>
        </button>
      )}
    </div>
  );
}
