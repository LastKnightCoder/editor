/**
 * 文档待办的行与小件：勾选写回原文（乐观更新）；行尾显示来源文档，点来源打开原文并定位到该项。
 * 文档条目没有删除 / 改期 / 移动菜单——这些都在原文里改。
 */

import { FileText } from "lucide-react";
import { cn } from "@tau/ui";
import { openEntity } from "@/services/open-content";
import type { DocTaskItem, DocTaskSource } from "@/types/doc-tasks";
import { bucketForDay, dayDiff, dayWord, monthDay } from "../model";
import type { BucketKey } from "../types";
import { TodoCheck } from "./TodoBits";

export function docTaskBucket(task: DocTaskItem, now: number): BucketKey {
  return task.dueAt == null ? "none" : bucketForDay(dayDiff(task.dueAt, now), now);
}

export function openDocTask(source: DocTaskSource, task?: DocTaskItem) {
  void openEntity(source.ref, {
    ...(task ? { at: { taskId: task.taskId } } : {}),
    momentId: source.momentId,
  });
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
  const overdue = !task.checked && task.dueAt != null && dayDiff(task.dueAt, now) < 0;
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
        label={task.checked ? "在原文中取消勾选" : "在原文中勾选"}
        onToggle={() => onToggle(task)}
      />
      <span className="flex min-w-0 flex-col">
        <span className={cn("text-tau-body truncate", task.checked && "text-ink-3 line-through")}>
          {task.title || "未命名任务"}
        </span>
        {task.dueAt != null && (
          <span className={cn("text-ink-3 text-[11.5px] tabular-nums", overdue && "text-danger")}>
            {overdue ? `${monthDay(task.dueAt)} · 已逾期` : dayWord(task.dueAt, now)}
          </span>
        )}
      </span>
      {showSource && source && (
        <button
          type="button"
          title={`打开《${source.title}》并定位`}
          onClick={e => {
            e.stopPropagation();
            openDocTask(source, task);
          }}
          className="text-ink-3 hover:text-accent-text flex max-w-[16em] items-center gap-1 whitespace-nowrap text-[11.5px]"
        >
          <FileText className="size-[11px] shrink-0" strokeWidth={1.75} />
          <span className="truncate">{source.title}</span>
        </button>
      )}
    </div>
  );
}
