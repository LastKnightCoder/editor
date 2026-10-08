/**
 * 文档条目抽屉：标题只读（在原文改），展示原文上下文（父项与前后各一项）。
 * 动作：打开原文定位 / 转为独立待办 / 本文不收集。非模态，Esc 经页面浮层仲裁关闭。
 */

import type { ReactNode } from "react";
import { FileText } from "lucide-react";
import { Button, Drawer, cn, useRetainedValue } from "@tau/ui";
import { useOverlayDismiss } from "@/page/PageProvider";
import type { DocTaskItem, DocTaskSource } from "@/types/doc-tasks";
import { useDocTasksOf } from "@/hooks/useDocTasks";
import { dayWord, monthDay } from "../model";
import { openDocTask } from "./DocTaskBits";
import { TodoCheck } from "./TodoBits";

export function DocTaskDrawer({
  task,
  source,
  groupTitle,
  now,
  onClose,
  onToggle,
  onPromote,
  onExclude,
}: {
  task: DocTaskItem | null;
  source: DocTaskSource | undefined;
  groupTitle: string | undefined;
  now: number;
  onClose(): void;
  onToggle(task: DocTaskItem): void;
  onPromote(task: DocTaskItem): void;
  onExclude(source: DocTaskSource): void;
}) {
  const open = task !== null;
  useOverlayDismiss(onClose, open);
  const current = useRetainedValue(task);
  const currentSource = useRetainedValue(source);
  const siblings = useDocTasksOf(current?.contentId ?? null).data ?? [];
  const index = current ? siblings.findIndex(t => t.taskId === current.taskId) : -1;
  const parent = current?.parentTaskId
    ? siblings.find(t => t.taskId === current.parentTaskId)
    : undefined;
  const context = index >= 0 ? siblings.slice(Math.max(0, index - 1), index + 2) : [];

  return (
    <Drawer
      modal={false}
      open={open}
      onOpenChange={next => !next && onClose()}
      size="sm"
      label="文档待办"
      className="top-0"
      icon={
        current && (
          <TodoCheck
            size="lg"
            className="mt-1"
            checked={current.checked}
            label={current.checked ? "在原文中取消勾选" : "在原文中勾选"}
            onToggle={() => onToggle(current)}
          />
        )
      }
      title={
        current && (
          <span className="text-[16px] font-semibold leading-[1.5] tracking-[-0.005em]">
            {current.title || "未命名任务"}
          </span>
        )
      }
      subtitle={<span className="text-ink-3 text-[11.5px]">标题在原文中修改</span>}
    >
      {current && currentSource && (
        <div className="flex flex-col gap-4 text-[13px]">
          <Field label="来源">
            <button
              type="button"
              onClick={() => openDocTask(currentSource, current)}
              className="text-accent-text flex min-w-0 items-center gap-1.5 hover:underline"
            >
              <FileText className="size-[13px] shrink-0" strokeWidth={1.75} />
              <span className="truncate">{currentSource.title}</span>
            </button>
          </Field>
          <Field label="日期">
            {current.dueAt != null
              ? `${dayWord(current.dueAt, now)}（${monthDay(current.dueAt)}）`
              : "—"}
          </Field>
          <Field label="项目">{groupTitle ?? "—"}</Field>
          {context.length > 0 && (
            <div>
              <div className="text-ink-3 mb-1.5 text-[11.5px]">原文上下文</div>
              <div className="bg-page rounded-tau-sm text-ink-2 flex flex-col gap-1 px-3 py-2.5 text-[12.5px]">
                {parent && !context.includes(parent) && (
                  <span className="text-ink-3">{parent.title}</span>
                )}
                {context.map(t => (
                  <span
                    key={t.taskId}
                    style={{ paddingLeft: t.depth * 14 }}
                    className={cn(
                      "truncate",
                      t.taskId === current.taskId && "text-ink-1 font-medium",
                      t.checked && "line-through"
                    )}
                  >
                    {t.checked ? "☑" : "☐"} {t.title}
                  </span>
                ))}
              </div>
            </div>
          )}
          <p className="text-ink-3 text-[11.5px]">
            在正文里写 #项目名 归入项目、写日期（如「周五」）排进议程；改动会同步到这里。
            需要周期、番茄或日程时，转为独立待办（原文保持不变）。
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="sm" onClick={() => openDocTask(currentSource, current)}>
              打开原文定位
            </Button>
            <Button variant="secondary" size="sm" onClick={() => onPromote(current)}>
              转为独立待办
            </Button>
            <Button
              variant="ghost"
              size="sm"
              title="这篇文档的勾选项都不再出现在待办里，可在原文底部恢复"
              onClick={() => onExclude(currentSource)}
            >
              本文不收集
            </Button>
          </div>
        </div>
      )}
    </Drawer>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-ink-3 shrink-0 text-[12px]">{label}</span>
      <span className="text-ink-1 min-w-0 truncate text-right">{children}</span>
    </div>
  );
}
