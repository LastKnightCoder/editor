import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Editor } from "@tau/editor/src";
import type { Descendant } from "slate";
import { resolveScreenMotion } from "../../navigation/screenTransition";
import type { PageTransitionConfig } from "../../navigation/types";
import * as tauri from "../../services/tauri";
import type {
  RecurrenceType,
  TodoItem,
  TodoRecurrence,
  TodoRecurrenceCompletion,
} from "../../types";
import {
  EMPTY_EDITOR_CONTENT,
  getContentLength,
  isEditorContentEmpty,
  normalizeEditorContent,
} from "../cards/editorContentUtils";
import { useEditContent } from "../../hooks/useEditContent";
import {
  getStartOfDayTimestamp,
  getTodayNormalized,
  isDateScheduledForRecurrence,
  isTodayScheduled,
} from "./recurrence";
import { useRecurringTaskStatus } from "./useRecurringTaskStatus";
import { useTodoStore } from "./store/useTodoStore";
import { BottomSheet } from "../../components/BottomSheet";
import { ActionSheet } from "../../components/ActionSheet";
import type { ActionSheetItem } from "../../components/ActionSheet";

type TodoDetailPageProps = {
  todoId: number;
  groupId?: number;
  onBack: () => void;
  onError: (error: unknown, fallback: string) => void;
  transition?: PageTransitionConfig;
};

type HeatmapCellStatus = "completed" | "skipped" | "missed" | "upcoming";

type HeatmapCell = {
  date: number;
  status: HeatmapCellStatus;
};

const REMINDER_OPTIONS: Array<{ label: string; value: number }> = [
  { label: "准时", value: 0 },
  { label: "5 分钟前", value: 5 * 60 * 1000 },
  { label: "10 分钟前", value: 10 * 60 * 1000 },
  { label: "15 分钟前", value: 15 * 60 * 1000 },
  { label: "30 分钟前", value: 30 * 60 * 1000 },
  { label: "1 小时前", value: 60 * 60 * 1000 },
  { label: "1 天前", value: 24 * 60 * 60 * 1000 },
];

const TYPE_LABELS: Record<TodoItem["type"], string> = {
  normal: "普通任务",
  deadline: "截止任务",
  planned: "计划任务",
  recurring: "周期任务",
};

function formatDateTime(ts?: number | null): string {
  if (!ts) return "";
  return new Date(ts).toLocaleString();
}

function toDateTimeInputValue(ts?: number | null): string {
  if (!ts) return "";
  const date = new Date(ts);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hour = `${date.getHours()}`.padStart(2, "0");
  const minute = `${date.getMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function parseDateTimeInputValue(value: string): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.getTime();
}

function resolveCurrentItem(
  itemsByGroupId: Record<string, TodoItem[]>,
  todoId: number,
): TodoItem | null {
  const groups = Object.values(itemsByGroupId);
  for (const list of groups) {
    const found = list.find((item) => item.id === todoId);
    if (found) return found;
  }
  return null;
}

function buildHeatmap(
  recurrence: TodoRecurrence,
  completions: TodoRecurrenceCompletion[],
): HeatmapCell[] {
  const completionMap = new Map<number, TodoRecurrenceCompletion>();
  completions.forEach((completion) => {
    completionMap.set(
      getStartOfDayTimestamp(completion.scheduledDate),
      completion,
    );
  });
  const today = getTodayNormalized();
  const cells: HeatmapCell[] = [];
  for (let offset = 29; offset >= 0; offset -= 1) {
    const date = today - offset * 24 * 60 * 60 * 1000;
    if (!isDateScheduledForRecurrence(recurrence, date)) continue;
    const completion = completionMap.get(date);
    let status: HeatmapCellStatus = "upcoming";
    if (completion?.completedAt != null) {
      status = "completed";
    } else if (completion?.skipped) {
      status = "skipped";
    } else if (date < today) {
      status = "missed";
    }
    cells.push({ date, status });
  }
  return cells;
}

function recurrenceTypeLabel(type: RecurrenceType): string {
  if (type === "daily") return "每天";
  if (type === "weekdays") return "工作日";
  if (type === "weekly") return "每周";
  if (type === "monthly") return "每月";
  if (type === "yearly") return "每年";
  return "自定义";
}

export function TodoDetailPage({
  todoId,
  groupId,
  onBack,
  onError,
  transition,
}: TodoDetailPageProps) {
  const reducedMotion = useReducedMotion();
  const motionProps = resolveScreenMotion(transition, reducedMotion === true);

  const store = useTodoStore();
  const current = useMemo(
    () => resolveCurrentItem(store.itemsByGroupId, todoId),
    [store.itemsByGroupId, todoId],
  );
  const recurringStatus = useRecurringTaskStatus(current);

  const [title, setTitle] = useState("");
  const [descriptionContentId, setDescriptionContentId] = useState<
    number | null
  >(null);
  const [heatmap, setHeatmap] = useState<HeatmapCell[]>([]);
  const [recurrenceCompletions, setRecurrenceCompletions] = useState<
    TodoRecurrenceCompletion[]
  >([]);

  // Sheets
  const [typeSheetOpen, setTypeSheetOpen] = useState(false);
  const [startTimeSheetOpen, setStartTimeSheetOpen] = useState(false);
  const [dueTimeSheetOpen, setDueTimeSheetOpen] = useState(false);
  const [reminderSheetOpen, setReminderSheetOpen] = useState(false);
  const [startTimeValue, setStartTimeValue] = useState("");
  const [dueTimeValue, setDueTimeValue] = useState("");

  const { content, syncVersion, throttleHandleEditorContentChange } =
    useEditContent(descriptionContentId ?? undefined, {
      onContentSync: (next) => {
        if (current) {
          store.patchItemDescriptionContent(current.id, current.groupId, next);
        }
      },
    });

  useEffect(() => {
    if (!current) return;
    setTitle(current.title);
    setDescriptionContentId(current.descriptionContentId ?? null);
    setStartTimeValue(toDateTimeInputValue(current.startAt));
    setDueTimeValue(toDateTimeInputValue(current.dueAt));
  }, [current]);

  useEffect(() => {
    if (current) return;
    if (groupId != null) {
      void store.loadItems(groupId).catch((error) => {
        onError(error, "加载任务详情失败");
      });
      return;
    }
    void store.refreshActiveItems().catch((error) => {
      onError(error, "加载任务详情失败");
    });
  }, [current, groupId, onError, store]);

  useEffect(() => {
    const recurrence = recurringStatus.recurrence;
    if (!recurrence) {
      setHeatmap([]);
      setRecurrenceCompletions([]);
      return;
    }
    let cancelled = false;
    const loadCompletions = async () => {
      try {
        const endDate = getTodayNormalized();
        const startDate = endDate - 60 * 24 * 60 * 60 * 1000;
        const completions = await tauri.todoGetRecurrenceCompletions(
          recurrence.id,
          startDate,
          endDate,
        );
        if (cancelled) return;
        setRecurrenceCompletions(completions);
        setHeatmap(buildHeatmap(recurrence, completions));
      } catch (error) {
        if (!cancelled) onError(error, "加载周期任务记录失败");
      }
    };
    void loadCompletions();
    return () => {
      cancelled = true;
    };
  }, [recurringStatus.recurrence, onError]);

  const handleSaveTitle = async () => {
    if (!current) return;
    const trimmed = title.trim();
    if (!trimmed || trimmed === current.title) {
      setTitle(current.title);
      return;
    }
    try {
      await store.updateItem({ id: current.id, title: trimmed });
    } catch (error) {
      onError(error, "更新任务标题失败");
      setTitle(current.title);
    }
  };

  const handleUpdateItemField = async (
    patch: Partial<{
      type: TodoItem["type"];
      startAt: number | null;
      dueAt: number | null;
      remindBefore: number | null;
    }>,
  ) => {
    if (!current) return;
    try {
      await store.updateItem({ id: current.id, ...patch });
    } catch (error) {
      onError(error, "更新任务信息失败");
    }
  };

  const handleDescriptionChange = async (nextContent: Descendant[]) => {
    if (!current) return;
    const normalized = normalizeEditorContent(nextContent);
    store.patchItemDescriptionContent(current.id, current.groupId, normalized);
    if (descriptionContentId != null && descriptionContentId > 0) {
      throttleHandleEditorContentChange(normalized);
      return;
    }
    if (isEditorContentEmpty(normalized)) return;
    try {
      const contentId = await tauri.createContent({
        content: normalized,
        count: getContentLength(normalized),
      });
      await store.updateItem({
        id: current.id,
        descriptionContentId: contentId,
      });
      setDescriptionContentId(contentId);
    } catch (error) {
      onError(error, "创建任务描述失败");
    }
  };

  const reloadRecurrence = async () => {
    const recurrence = await tauri.todoGetRecurrenceByItem(todoId);
    if (!recurrence) {
      setHeatmap([]);
      setRecurrenceCompletions([]);
      return;
    }
    const endDate = getTodayNormalized();
    const startDate = endDate - 60 * 24 * 60 * 60 * 1000;
    const completions = await tauri.todoGetRecurrenceCompletions(
      recurrence.id,
      startDate,
      endDate,
    );
    setRecurrenceCompletions(completions);
    setHeatmap(buildHeatmap(recurrence, completions));
    await Promise.all([store.refreshActiveItems(), store.loadGroupStats()]);
  };

  const handleEnsureRecurrence = async (): Promise<TodoRecurrence> => {
    if (!current) throw new Error("TODO_NOT_FOUND: todo item does not exist");
    const existing = await tauri.todoGetRecurrenceByItem(current.id);
    if (existing) return existing;
    return await tauri.todoCreateRecurrence({
      todoItemId: current.id,
      type: "daily",
      interval: 1,
      startDate: getTodayNormalized(),
    });
  };

  const handleToggleTodayRecurring = async () => {
    if (!current || current.type !== "recurring") return;
    try {
      const recurrence = await handleEnsureRecurrence();
      if (!isTodayScheduled(recurrence))
        throw new Error("TODO_RECURRENCE_INVALID: today is not scheduled");
      const today = getTodayNormalized();
      const completion = await tauri.todoGetRecurrenceCompletion(
        recurrence.id,
        today,
      );
      if (completion?.completedAt != null) {
        await tauri.todoUncompleteRecurrence(recurrence.id, today);
      } else {
        await tauri.todoCompleteRecurrence(recurrence.id, today);
      }
      await reloadRecurrence();
    } catch (error) {
      onError(error, "更新周期任务打卡失败");
    }
  };

  const handleHeatmapClick = async (cell: HeatmapCell) => {
    if (!recurringStatus.recurrence || cell.date > getTodayNormalized()) return;
    try {
      if (cell.status === "completed" || cell.status === "skipped") {
        await tauri.todoUncompleteRecurrence(
          recurringStatus.recurrence.id,
          cell.date,
        );
      } else {
        await tauri.todoCompleteRecurrence(
          recurringStatus.recurrence.id,
          cell.date,
        );
      }
      await reloadRecurrence();
    } catch (error) {
      onError(error, "更新周期热力记录失败");
    }
  };

  const typeSheetItems: ActionSheetItem[] = (
    ["normal", "deadline", "planned", "recurring"] as TodoItem["type"][]
  ).map((t) => ({
    label: TYPE_LABELS[t],
    onClick: () => void handleUpdateItemField({ type: t }),
  }));

  const reminderSheetItems: ActionSheetItem[] = [
    {
      label: "不提醒",
      onClick: () => void handleUpdateItemField({ remindBefore: null }),
    },
    ...REMINDER_OPTIONS.map((opt) => ({
      label: opt.label,
      onClick: () => void handleUpdateItemField({ remindBefore: opt.value }),
    })),
  ];

  const reminderLabel =
    current?.remindBefore != null
      ? (REMINDER_OPTIONS.find((o) => o.value === current.remindBefore)
          ?.label ?? "自定义")
      : "不提醒";

  const headerContent = (
    <header className="mobile-topbar topbar-immersive flex items-center px-2">
      <button
        type="button"
        onClick={onBack}
        className="flex h-10 w-10 items-center justify-center rounded-full text-gray-600 transition-colors active:bg-gray-100 dark:text-neutral-300 dark:active:bg-neutral-800"
      >
        <ChevronLeft size={20} aria-hidden="true" />
      </button>
      <h1 className="flex-1 text-center text-base font-semibold text-gray-900 dark:text-neutral-100">
        任务详情
      </h1>
      <div className="w-10" />
    </header>
  );

  if (!current) {
    return (
      <motion.div
        initial={motionProps.initial}
        animate={motionProps.animate}
        exit={motionProps.exit}
        className="mobile-kb-screen fixed inset-0 z-50 flex flex-col bg-gray-50 dark:bg-black"
      >
        {headerContent}
        <div className="flex flex-1 items-center justify-center text-sm text-gray-500 dark:text-neutral-400">
          任务不存在或已被删除
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={motionProps.initial}
      animate={motionProps.animate}
      exit={motionProps.exit}
      className="mobile-kb-screen fixed inset-0 z-50 flex flex-col bg-gray-50 dark:bg-black"
    >
      {headerContent}

      <div className="mobile-kb-scroll flex-1 overflow-y-auto px-4 pb-8">
        <section className="mt-3 rounded-xl bg-white p-3 dark:bg-neutral-900">
          <div className="text-xs text-gray-400">标题</div>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => {
              void handleSaveTitle();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") void handleSaveTitle();
            }}
            className="mt-1 w-full border-none bg-transparent text-base font-semibold text-gray-900 outline-none dark:text-neutral-100"
          />
        </section>

        <section className="list-group mt-3">
          <button
            type="button"
            className="list-item"
            onClick={() => setTypeSheetOpen(true)}
          >
            <span className="text-sm text-gray-500 dark:text-neutral-400">
              类型
            </span>
            <span className="ml-auto flex items-center gap-1 text-sm text-gray-900 dark:text-neutral-100">
              {TYPE_LABELS[current.type]}
              <ChevronRight size={16} className="text-gray-400" />
            </span>
          </button>

          {(current.type === "deadline" || current.type === "planned") && (
            <>
              <button
                type="button"
                className="list-item"
                onClick={() => {
                  setStartTimeValue(toDateTimeInputValue(current.startAt));
                  setStartTimeSheetOpen(true);
                }}
              >
                <span className="text-sm text-gray-500 dark:text-neutral-400">
                  开始时间
                </span>
                <span className="ml-auto flex items-center gap-1 text-sm text-gray-900 dark:text-neutral-100">
                  {formatDateTime(current.startAt) || "未设置"}
                  <ChevronRight size={16} className="text-gray-400" />
                </span>
              </button>
              <button
                type="button"
                className="list-item"
                onClick={() => {
                  setDueTimeValue(toDateTimeInputValue(current.dueAt));
                  setDueTimeSheetOpen(true);
                }}
              >
                <span className="text-sm text-gray-500 dark:text-neutral-400">
                  截止时间
                </span>
                <span className="ml-auto flex items-center gap-1 text-sm text-gray-900 dark:text-neutral-100">
                  {formatDateTime(current.dueAt) || "未设置"}
                  <ChevronRight size={16} className="text-gray-400" />
                </span>
              </button>
              <button
                type="button"
                className="list-item"
                onClick={() => setReminderSheetOpen(true)}
              >
                <span className="text-sm text-gray-500 dark:text-neutral-400">
                  提醒
                </span>
                <span className="ml-auto flex items-center gap-1 text-sm text-gray-900 dark:text-neutral-100">
                  {reminderLabel}
                  <ChevronRight size={16} className="text-gray-400" />
                </span>
              </button>
            </>
          )}

          <div className="list-item">
            <span className="text-sm text-gray-500 dark:text-neutral-400">
              创建时间
            </span>
            <span className="ml-auto text-sm text-gray-900 dark:text-neutral-100">
              {formatDateTime(current.createTime) || "-"}
            </span>
          </div>
          <div className="list-item">
            <span className="text-sm text-gray-500 dark:text-neutral-400">
              完成时间
            </span>
            <span className="ml-auto text-sm text-gray-900 dark:text-neutral-100">
              {formatDateTime(current.completedAt) || "未完成"}
            </span>
          </div>
        </section>

        {current.type === "recurring" && (
          <section className="mt-3 rounded-xl bg-white p-3 dark:bg-neutral-900">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-gray-900 dark:text-neutral-100">
                  周期打卡
                </div>
                <div className="text-xs text-gray-500 dark:text-neutral-400">
                  {recurringStatus.recurrence
                    ? `${recurrenceTypeLabel(recurringStatus.recurrence.type)} · 间隔 ${Math.max(1, recurringStatus.recurrence.interval)}`
                    : "尚未配置周期规则"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  void handleToggleTodayRecurring();
                }}
                className={`px-5 py-2.5 rounded-xl text-sm font-semibold ${
                  recurringStatus.isTodayCompleted
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-(--color-primary) text-white"
                } active:opacity-80`}
              >
                {recurringStatus.isTodayCompleted ? "取消今日打卡" : "今日打卡"}
              </button>
            </div>
            {recurringStatus.isLoading ? (
              <div className="mt-3 text-xs text-gray-500 dark:text-neutral-400">
                正在加载周期状态...
              </div>
            ) : (
              <div className="mt-2 text-xs text-gray-500 dark:text-neutral-400">
                今日{recurringStatus.isTodayScheduled ? "" : "不"}
                在周期范围内，状态：
                {recurringStatus.isTodayCompleted ? "已完成" : "未完成"}
              </div>
            )}
            {recurrenceCompletions.length > 0 && (
              <div className="mt-2 text-xs text-gray-400">
                近 60 天记录：{recurrenceCompletions.length} 条
              </div>
            )}
            {heatmap.length > 0 && (
              <div className="mt-3">
                <div className="mb-1 flex gap-1">
                  {heatmap.map((cell, index) => (
                    <div
                      key={cell.date}
                      className="flex-1 text-center text-[9px] text-gray-400"
                    >
                      {index % 5 === 0 ? new Date(cell.date).getDate() : ""}
                    </div>
                  ))}
                </div>
                <div
                  className="grid gap-1"
                  style={{
                    gridTemplateColumns: `repeat(${heatmap.length}, 1fr)`,
                  }}
                >
                  {heatmap.map((cell) => (
                    <button
                      key={cell.date}
                      type="button"
                      onClick={() => {
                        void handleHeatmapClick(cell);
                      }}
                      className={`h-6 rounded-md active:opacity-70 ${
                        cell.status === "completed"
                          ? "bg-emerald-500"
                          : cell.status === "skipped"
                            ? "bg-amber-500"
                            : cell.status === "missed"
                              ? "bg-rose-500"
                              : "bg-gray-200 dark:bg-neutral-700"
                      }`}
                      title={new Date(cell.date).toLocaleDateString()}
                    />
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        <section className="mt-3 rounded-xl bg-white p-3 dark:bg-neutral-900">
          <div className="mb-2 text-xs text-gray-500 dark:text-neutral-400">
            <span>描述</span>
          </div>
          <div className="min-h-[220px] rounded-lg border border-gray-100 bg-white px-2 py-2 dark:border-neutral-800 dark:bg-neutral-950">
            <Editor
              key={`todo-description-${todoId}-${syncVersion}-${descriptionContentId ?? 0}`}
              initValue={normalizeEditorContent(
                content ?? EMPTY_EDITOR_CONTENT,
              )}
              onChange={(next) => {
                void handleDescriptionChange(next);
              }}
            />
          </div>
        </section>
      </div>

      {/* 类型选择 */}
      <ActionSheet
        open={typeSheetOpen}
        title="选择任务类型"
        items={typeSheetItems}
        onClose={() => setTypeSheetOpen(false)}
      />

      {/* 提醒选择 */}
      <ActionSheet
        open={reminderSheetOpen}
        title="选择提醒时间"
        items={reminderSheetItems}
        onClose={() => setReminderSheetOpen(false)}
      />

      {/* 开始时间 */}
      <BottomSheet
        open={startTimeSheetOpen}
        title="开始时间"
        onClose={() => setStartTimeSheetOpen(false)}
      >
        <input
          type="datetime-local"
          value={startTimeValue}
          onChange={(e) => setStartTimeValue(e.target.value)}
          className="input-base h-11 w-full rounded-xl px-4 text-sm"
        />
        <button
          type="button"
          onClick={() => {
            void handleUpdateItemField({
              startAt: parseDateTimeInputValue(startTimeValue),
            });
            setStartTimeSheetOpen(false);
          }}
          className="mt-3 h-11 w-full rounded-xl bg-(--color-primary) text-sm font-semibold text-white active:opacity-80"
        >
          确认
        </button>
        {current.startAt && (
          <button
            type="button"
            onClick={() => {
              void handleUpdateItemField({ startAt: null });
              setStartTimeSheetOpen(false);
            }}
            className="mt-2 h-10 w-full rounded-xl text-sm text-gray-500 dark:text-neutral-400"
          >
            清除
          </button>
        )}
      </BottomSheet>

      {/* 截止时间 */}
      <BottomSheet
        open={dueTimeSheetOpen}
        title="截止时间"
        onClose={() => setDueTimeSheetOpen(false)}
      >
        <input
          type="datetime-local"
          value={dueTimeValue}
          onChange={(e) => setDueTimeValue(e.target.value)}
          className="input-base h-11 w-full rounded-xl px-4 text-sm"
        />
        <button
          type="button"
          onClick={() => {
            void handleUpdateItemField({
              dueAt: parseDateTimeInputValue(dueTimeValue),
            });
            setDueTimeSheetOpen(false);
          }}
          className="mt-3 h-11 w-full rounded-xl bg-(--color-primary) text-sm font-semibold text-white active:opacity-80"
        >
          确认
        </button>
        {current.dueAt && (
          <button
            type="button"
            onClick={() => {
              void handleUpdateItemField({ dueAt: null });
              setDueTimeSheetOpen(false);
            }}
            className="mt-2 h-10 w-full rounded-xl text-sm text-gray-500 dark:text-neutral-400"
          >
            清除
          </button>
        )}
      </BottomSheet>
    </motion.div>
  );
}

export default TodoDetailPage;
