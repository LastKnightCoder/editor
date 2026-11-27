import { todosTranslator, useTodosI18n } from "@/features/todos/i18n";
import { dayWord, monthDay } from "@/utils/date-format";
/**
 * 文档条目抽屉：标题只读（在原文改），展示原文上下文（父项与前后各一项）。
 * 动作：打开原文定位 / 转为独立待办 / 本文不收集。非模态，Esc 经页面浮层仲裁关闭。
 */

import type { ReactNode } from "react";
import { Bell, ChevronDown, FileText } from "lucide-react";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import { Button, Drawer, cn, useRetainedValue } from "@tau/ui";
import { useOverlayDismiss } from "@/page/PageProvider";
import type { DocTaskItem, DocTaskSource } from "@/types/doc-tasks";
import { useDocTaskReminders, useDocTasksOf, useSetDocTaskReminders } from "@/hooks/useDocTasks";
import { reminderMessages, summarizeDocumentReminders } from "@tau/shared/reminders";
import { TaskRemindersPopover } from "@/components/TaskRemindersPopover";

import { openDocTask } from "./DocTaskBits";
import { TodoCheck } from "./TodoBits";
const t = todosTranslator.t;

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
  const { locale } = useTodosI18n();
  const { t: tReminder } = useI18n(reminderMessages, desktopI18n);
  const open = task !== null;
  useOverlayDismiss(onClose, open);
  const current = useRetainedValue(task);
  const currentSource = useRetainedValue(source);
  const siblings = useDocTasksOf(current?.contentId ?? null).data ?? [];
  const liveReminders = useDocTaskReminders(
    open && current ? current.contentId : null,
    open && current ? current.taskId : null
  );
  const saveDocReminders = useSetDocTaskReminders();
  const reminderDetail = liveReminders.data?.ok ? liveReminders.data : null;
  const reminders = reminderDetail?.reminders ?? current?.reminders ?? [];
  const recurring = reminderDetail?.recurring ?? current?.recurring ?? false;
  const remindersWritable = reminderDetail ? reminderDetail.writable : false;
  const reminderDigest = reminderDetail?.digest ?? "";
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
      label={t("doc.title")}
      className="top-0"
      icon={
        current && (
          <TodoCheck
            size="lg"
            className="mt-1"
            checked={current.checked}
            label={current.checked ? t("doc.uncheck") : t("doc.check")}
            onToggle={() => onToggle(current)}
          />
        )
      }
      title={
        current && (
          <span className="text-[16px] leading-[1.5] font-semibold tracking-[-0.005em]">
            {current.title || t("common.untitled")}
          </span>
        )
      }
      subtitle={<span className="text-ink-3 text-[11.5px]">{t("doc.editTitleInSource")}</span>}
    >
      {current && currentSource && (
        <div className="flex flex-col gap-4 text-[13px]">
          <Field label={t("doc.source")}>
            <button
              type="button"
              onClick={() => openDocTask(currentSource, current)}
              className="text-accent-text flex min-w-0 items-center gap-1.5 hover:underline"
            >
              <FileText className="size-[13px] shrink-0" strokeWidth={1.75} />
              <span className="truncate">{currentSource.title}</span>
            </button>
          </Field>
          <Field label={t("repeat.date")}>
            {current.dueAt != null
              ? `${dayWord(current.dueAt, now, locale)}（${monthDay(current.dueAt, locale)}）`
              : "—"}
          </Field>
          <Field label={t("doc.group")}>{groupTitle ?? "—"}</Field>
          <Field label={t("field.reminder")}>
            {recurring ? (
              <TaskRemindersPopover
                mode="clock"
                value={reminders.flatMap(item => ("offsetMs" in item ? [item.offsetMs] : []))}
                disabled={!remindersWritable || !reminderDigest}
                onChange={async offsets => {
                  await saveDocReminders(
                    current.contentId,
                    current.taskId,
                    offsets.map(offsetMs => ({ offsetMs })),
                    reminderDigest
                  );
                }}
                trigger={
                  <button
                    type="button"
                    className={cn(
                      "border-line-1 bg-surface hover:border-ink-3 inline-flex h-[26px] items-center gap-1.5 rounded-[7px] border px-2.5 text-[12.5px] tabular-nums outline-none focus-visible:shadow-[var(--tau-focus-ring)]",
                      reminders.length ? "text-ink-1" : "text-ink-3"
                    )}
                  >
                    <Bell className="text-ink-3 size-[12px] shrink-0" strokeWidth={1.75} />
                    <span>
                      {summarizeDocumentReminders(reminders, true, now, { locale, t: tReminder })}
                    </span>
                    <ChevronDown className="text-ink-3 size-[13px]" strokeWidth={1.75} />
                  </button>
                }
              />
            ) : (
              <TaskRemindersPopover
                mode="absolute"
                value={reminders}
                dueAt={current.dueAt}
                disabled={!remindersWritable || !reminderDigest}
                onChange={async next => {
                  await saveDocReminders(current.contentId, current.taskId, next, reminderDigest);
                }}
                trigger={
                  <button
                    type="button"
                    className={cn(
                      "border-line-1 bg-surface hover:border-ink-3 inline-flex h-[26px] items-center gap-1.5 rounded-[7px] border px-2.5 text-[12.5px] tabular-nums outline-none focus-visible:shadow-[var(--tau-focus-ring)]",
                      reminders.length ? "text-ink-1" : "text-ink-3"
                    )}
                  >
                    <Bell className="text-ink-3 size-[12px] shrink-0" strokeWidth={1.75} />
                    <span>
                      {summarizeDocumentReminders(reminders, false, now, { locale, t: tReminder })}
                    </span>
                    <ChevronDown className="text-ink-3 size-[13px]" strokeWidth={1.75} />
                  </button>
                }
              />
            )}
          </Field>
          {context.length > 0 && (
            <div>
              <div className="text-ink-3 mb-1.5 text-[11.5px]">{t("doc.context")}</div>
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
          <p className="text-ink-3 text-[11.5px]">{t("doc.help")}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="sm" onClick={() => openDocTask(currentSource, current)}>
              {t("doc.locate")}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => onPromote(current)}>
              {t("doc.promote")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              title={t("doc.excludeHint")}
              onClick={() => onExclude(currentSource)}
            >
              {t("doc.exclude")}
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
