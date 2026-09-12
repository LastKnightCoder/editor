import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  CalendarDays,
  Check,
  Clock,
  Flag,
  MoreHorizontal,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { PageHeader, PageHeaderButton } from "../../components/PageHeader";
import { Editor } from "@tau/editor/src";
import type { Descendant } from "slate";
import * as tauri from "../../services/tauri";
import { getQueryClient } from "../../router";
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
import { useEdgeFade } from "../../hooks/useScrollState";
import { clampText } from "../../utils/richTextText";
import {
  getStartOfDayTimestamp,
  getTodayNormalized,
  isDateScheduledForRecurrence,
  isTodayScheduled,
} from "./recurrence";
import { toggleTodoComplete } from "./toggleComplete";
import { useRecurringTaskStatus } from "./useRecurringTaskStatus";
import { useTodoStore } from "./store/useTodoStore";
import { useTodoItems } from "./queries";
import { ActionSheet } from "../../components/ActionSheet";
import type { ActionSheetItem } from "../../components/ActionSheet";
import { DateTimePickerSheet } from "../../components/DateTimePickerSheet";
import { MobileConfirmDialog } from "../../components/MobileConfirmDialog";

type TodoDetailPageProps = {
  todoId: number;
  groupId?: number;
  onBack: () => void;
  onError: (error: unknown, fallback: string) => void;
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

function formatShortDateTime(ts?: number | null, withYear = false): string {
  if (!ts) return "";
  const date = new Date(ts);
  const hour = `${date.getHours()}`.padStart(2, "0");
  const minute = `${date.getMinutes()}`.padStart(2, "0");
  return `${withYear ? `${date.getFullYear()}/` : ""}${date.getMonth() + 1}/${date.getDate()} ${hour}:${minute}`;
}

function buildHeatmap(
  recurrence: TodoRecurrence,
  completions: TodoRecurrenceCompletion[]
): HeatmapCell[] {
  const completionMap = new Map<number, TodoRecurrenceCompletion>();
  completions.forEach(completion => {
    completionMap.set(getStartOfDayTimestamp(completion.scheduledDate), completion);
  });
  const today = getTodayNormalized();
  const cells: HeatmapCell[] = [];
  for (let offset = 29; offset >= 0; offset -= 1) {
    // 归一化到本地零点再查表：DST 切换日一天不足 24h，直接用 today - n*24h 会落在前一日 23 点导致错判
    const date = getStartOfDayTimestamp(today - offset * 24 * 60 * 60 * 1000);
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

export function TodoDetailPage({ todoId, groupId, onBack, onError }: TodoDetailPageProps) {
  const store = useTodoStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  useEdgeFade(scrollRef, { bottom: false });
  const activeGroupId = useTodoStore(state => state.activeGroupId);
  const resolvedGroupId = groupId ?? activeGroupId ?? undefined;
  const itemsQuery = useTodoItems({ groupId: resolvedGroupId });
  // 依赖 query 缓存的稳定数组引用，而非每次渲染重建的包装对象
  const current = useMemo(
    () => itemsQuery.data?.find(item => item.id === todoId) ?? null,
    [itemsQuery.data, todoId]
  );
  const recurringStatus = useRecurringTaskStatus(current);

  const [title, setTitle] = useState("");
  const [descriptionContentId, setDescriptionContentId] = useState<number | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapCell[]>([]);
  const [recurrenceCompletions, setRecurrenceCompletions] = useState<TodoRecurrenceCompletion[]>(
    []
  );

  // Sheets
  const [typeSheetOpen, setTypeSheetOpen] = useState(false);
  const [startTimeSheetOpen, setStartTimeSheetOpen] = useState(false);
  const [dueTimeSheetOpen, setDueTimeSheetOpen] = useState(false);
  const [reminderSheetOpen, setReminderSheetOpen] = useState(false);

  // 更多操作 / 删除
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TodoItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // 描述编辑器挂载闸门：内容首载完成前不挂载；挂载后 key 恒为 todoId——
  // 否则「新描述首字符落库（contentId null→N）/外部内容同步」会改变 key，
  // 把正在输入的 Slate 编辑器整树重建、丢焦点
  const [descriptionEditorReady, setDescriptionEditorReady] = useState(false);

  const titleTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const {
    content,
    loading: descriptionLoading,
    saving: descriptionSaving,
    error: descriptionSaveError,
    throttleHandleEditorContentChange,
  } = useEditContent(descriptionContentId ?? undefined, {
    onContentSync: next => {
      if (current) {
        store.patchItemDescriptionContent(current.id, current.groupId, next);
      }
    },
  });

  // 字段级依赖：invalidate 后 current 引用变化但值未变时，不回灌覆盖用户正在输入的内容
  const currentId = current?.id;
  const currentTitle = current?.title;
  const currentDescriptionContentId = current?.descriptionContentId;
  useEffect(() => {
    if (currentId == null) return;
    setTitle(currentTitle ?? "");
    setDescriptionContentId(currentDescriptionContentId ?? null);
  }, [currentId, currentTitle, currentDescriptionContentId]);

  useEffect(() => {
    if (current || !itemsQuery.error) return;
    onError(itemsQuery.error, "加载任务详情失败");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, itemsQuery.error]);

  // 标题 textarea 自增高（rows=1 起点，换行自动撑高）
  useEffect(() => {
    const el = titleTextareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [title]);

  useEffect(() => {
    if (!descriptionLoading) setDescriptionEditorReady(true);
  }, [descriptionLoading]);

  // onError 入 ref：父层内联回调的引用变化不应触发记录重复拉取
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
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
          endDate
        );
        if (cancelled) return;
        setRecurrenceCompletions(completions);
        setHeatmap(buildHeatmap(recurrence, completions));
      } catch (error) {
        if (!cancelled) onErrorRef.current(error, "加载周期任务记录失败");
      }
    };
    void loadCompletions();
    return () => {
      cancelled = true;
    };
  }, [recurringStatus.recurrence]);

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
    }>
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
    const completions = await tauri.todoGetRecurrenceCompletions(recurrence.id, startDate, endDate);
    setRecurrenceCompletions(completions);
    setHeatmap(buildHeatmap(recurrence, completions));
    // 完成状态变化由 invalidate 自动刷新订阅
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
      const completion = await tauri.todoGetRecurrenceCompletion(recurrence.id, today);
      if (completion?.completedAt != null) {
        await tauri.todoUncompleteRecurrence(recurrence.id, today);
      } else {
        await tauri.todoCompleteRecurrence(recurrence.id, today);
      }
      // 直调 tauri 绕过了 store 封装，手动失效缓存让列表与统计同步刷新
      getQueryClient().invalidateQueries({ queryKey: ["todo"] });
      await reloadRecurrence();
    } catch (error) {
      onError(error, "更新周期任务打卡失败");
    }
  };

  const handleHeatmapClick = async (cell: HeatmapCell) => {
    if (!recurringStatus.recurrence || cell.date > getTodayNormalized()) return;
    try {
      if (cell.status === "completed" || cell.status === "skipped") {
        await tauri.todoUncompleteRecurrence(recurringStatus.recurrence.id, cell.date);
      } else {
        await tauri.todoCompleteRecurrence(recurringStatus.recurrence.id, cell.date);
      }
      getQueryClient().invalidateQueries({ queryKey: ["todo"] });
      await reloadRecurrence();
    } catch (error) {
      onError(error, "更新周期热力记录失败");
    }
  };

  const typeSheetItems: ActionSheetItem[] = (
    ["normal", "deadline", "planned", "recurring"] as TodoItem["type"][]
  ).map(t => ({
    label: TYPE_LABELS[t],
    onClick: () => void handleUpdateItemField({ type: t }),
  }));

  const handleDeleteItem = async () => {
    if (!deleteTarget || deleteLoading) return;
    setDeleteLoading(true);
    try {
      // 与列表页一致：级联删除子任务，叶子节点等价普通删除
      await store.deleteItemCascade(deleteTarget.id);
      setDeleteTarget(null);
      onBack();
    } catch (error) {
      onError(error, "删除任务失败");
    } finally {
      setDeleteLoading(false);
    }
  };

  const moreSheetItems: ActionSheetItem[] = current
    ? [
        {
          label: "删除任务",
          danger: true,
          icon: <Trash2 size={18} />,
          onClick: () => setDeleteTarget(current),
        },
      ]
    : [];

  const reminderSheetItems: ActionSheetItem[] = [
    {
      label: "不提醒",
      onClick: () => void handleUpdateItemField({ remindBefore: null }),
    },
    ...REMINDER_OPTIONS.map(opt => ({
      label: opt.label,
      onClick: () => void handleUpdateItemField({ remindBefore: opt.value }),
    })),
  ];

  const reminderLabel =
    current?.remindBefore != null
      ? (REMINDER_OPTIONS.find(o => o.value === current.remindBefore)?.label ?? "自定义")
      : "不提醒";

  if (!current) {
    return (
      <div className="mobile-kb-screen bg-page fixed inset-0 z-50 flex flex-col">
        <PageHeader title="编辑任务" onBack={onBack} />
        <div className="text-ink-3 flex flex-1 items-center justify-center text-sm">
          任务不存在或已被删除
        </div>
      </div>
    );
  }

  // ── B1 沉浸式布局派生状态 ──
  const isOverdue = !current.isCompleted && current.dueAt != null && current.dueAt < Date.now();
  // 主完成态：recurring 走「今日打卡」语义，其余类型走条目完成态
  const mainDone =
    current.type === "recurring" ? recurringStatus.isTodayCompleted : current.isCompleted;
  const mainLabel =
    current.type === "recurring"
      ? mainDone
        ? "取消今日打卡"
        : "今日打卡"
      : mainDone
        ? "撤销完成"
        : "标记完成";

  const handleToggleMain = () => {
    if (current.type === "recurring") {
      void handleToggleTodayRecurring();
      return;
    }
    void toggleTodoComplete(current, !current.isCompleted, onError);
  };

  const chipBaseClass =
    "inline-flex items-center gap-1 rounded-full px-2.5 py-[6px] text-[11.5px] font-extrabold transition-transform active:scale-95";

  return (
    <div className="mobile-kb-screen bg-page fixed inset-0 z-50 flex flex-col">
      <PageHeader
        title="编辑任务"
        onBack={onBack}
        actions={
          <PageHeaderButton
            icon={<MoreHorizontal />}
            aria-label="更多操作"
            onClick={() => setMoreSheetOpen(true)}
          />
        }
      />

      <div
        ref={scrollRef}
        className="edge-fade-scroll mobile-kb-scroll flex-1 overflow-y-auto pb-8"
      >
        {/* 标题编辑区：大完成圈 + 无边框标题输入 */}
        <div className="flex items-start gap-3 px-4 pt-3.5">
          <button
            type="button"
            role="checkbox"
            aria-checked={mainDone}
            aria-label={mainDone ? "标记为未完成" : "标记为已完成"}
            onClick={handleToggleMain}
            className={`mt-0.5 grid h-[27px] w-[27px] shrink-0 place-items-center rounded-full border-[2.5px] transition-all duration-200 ${
              mainDone ? "border-accent bg-accent shadow-accent" : "border-ink-3/50 bg-surface"
            }`}
          >
            {mainDone ? <Check size={14} strokeWidth={3.4} className="text-white" /> : null}
          </button>
          <textarea
            ref={titleTextareaRef}
            value={title}
            rows={1}
            onChange={event => setTitle(event.target.value)}
            onBlur={() => {
              void handleSaveTitle();
            }}
            onKeyDown={event => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
            placeholder="任务标题"
            className="text-ink placeholder:text-ink-3 min-h-[27px] flex-1 resize-none border-none bg-transparent py-0 text-[18px] font-extrabold leading-[1.5] outline-none"
          />
        </div>

        {/* 属性胶囊行：点击弹 Sheet 修改，按类型展示相关字段 */}
        <div className="flex flex-wrap gap-1.5 pb-1 pl-[55px] pr-4 pt-3">
          <button
            type="button"
            onClick={() => setTypeSheetOpen(true)}
            className={`${chipBaseClass} bg-butter-soft text-butter`}
          >
            <Flag size={12} />
            {TYPE_LABELS[current.type]}
          </button>
          {/* 时间/提醒胶囊常驻（recurring 除外——其日程由周期规则决定）：
              未设置的字段以中性「设置 xx」胶囊占位，保证随时可补填 */}
          {current.type !== "recurring" && (
            <>
              <button
                type="button"
                onClick={() => setStartTimeSheetOpen(true)}
                className={`${chipBaseClass} ${
                  current.startAt ? "bg-sky-soft text-sky" : "bg-input text-ink-3"
                }`}
              >
                <CalendarDays size={12} />
                {current.startAt ? formatShortDateTime(current.startAt) : "设置开始"}
              </button>
              <button
                type="button"
                onClick={() => setDueTimeSheetOpen(true)}
                className={`${chipBaseClass} ${
                  current.dueAt
                    ? isOverdue
                      ? "bg-rose-soft text-rose"
                      : "bg-sage-soft text-sage"
                    : "bg-input text-ink-3"
                }`}
              >
                <Clock size={12} />
                {current.dueAt
                  ? `${formatShortDateTime(current.dueAt)}${isOverdue ? " · 逾期" : ""}`
                  : "设置截止"}
              </button>
              <button
                type="button"
                onClick={() => setReminderSheetOpen(true)}
                className={`${chipBaseClass} ${
                  current.remindBefore != null
                    ? "bg-apricot-soft text-apricot"
                    : "bg-input text-ink-3"
                }`}
              >
                <Bell size={12} />
                {reminderLabel}
              </button>
            </>
          )}
          {current.type === "recurring" && recurringStatus.recurrence && (
            <span className={`${chipBaseClass} bg-sage-soft text-sage`}>
              <RefreshCw size={12} />
              {recurrenceTypeLabel(recurringStatus.recurrence.type)} · 间隔{" "}
              {Math.max(1, recurringStatus.recurrence.interval)}
            </span>
          )}
        </div>

        {/* 元信息小字：创建/完成时间，与胶囊行左对齐（非交互，弱化为辅助信息） */}
        <div className="text-ink-3 pl-[55px] pr-4 pt-1.5 text-[10.5px] leading-4">
          创建于 {formatShortDateTime(current.createTime, true) || "-"}
          {current.completedAt ? ` · 完成于 ${formatShortDateTime(current.completedAt, true)}` : ""}
        </div>

        {current.type === "recurring" && (
          <section className="card mx-4 mt-3 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-ink text-sm font-bold">周期打卡</div>
                <div className="text-ink-2 text-xs">
                  {recurringStatus.recurrence
                    ? `近 60 天记录：${recurrenceCompletions.length} 条`
                    : "尚未配置周期规则"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  void handleToggleTodayRecurring();
                }}
                className={`rounded-full px-5 py-2.5 text-sm font-bold transition-transform active:scale-95 ${
                  recurringStatus.isTodayCompleted
                    ? "bg-sage-soft text-sage"
                    : "bg-accent shadow-accent text-white"
                }`}
              >
                {recurringStatus.isTodayCompleted ? "取消今日打卡" : "今日打卡"}
              </button>
            </div>
            {recurringStatus.isLoading ? (
              <div className="text-ink-2 mt-3 text-xs">正在加载周期状态...</div>
            ) : (
              <div className="text-ink-2 mt-2 text-xs">
                今日{recurringStatus.isTodayScheduled ? "" : "不"}
                在周期范围内，状态：
                {recurringStatus.isTodayCompleted ? "已完成" : "未完成"}
              </div>
            )}
            {heatmap.length > 0 && (
              <div className="mt-3">
                <div className="mb-1 flex gap-1">
                  {heatmap.map((cell, index) => (
                    <div key={cell.date} className="text-ink-3 flex-1 text-center text-[9px]">
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
                  {heatmap.map(cell => (
                    <button
                      key={cell.date}
                      type="button"
                      onClick={() => {
                        void handleHeatmapClick(cell);
                      }}
                      className={`h-6 rounded-lg transition-transform active:scale-90 ${
                        cell.status === "completed"
                          ? "bg-sage"
                          : cell.status === "skipped"
                            ? "bg-butter"
                            : cell.status === "missed"
                              ? "bg-rose"
                              : "bg-line"
                      }`}
                      title={new Date(cell.date).toLocaleDateString()}
                    />
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        <div className="bg-line mx-4 my-3.5 h-px" />

        {/* 描述：全宽内联编辑区，无小标题——语义由 placeholder 表达；
            Editor 默认 readonly=true，必须显式传 false，key 恒为 todoId 靠挂载闸门保证 initValue 拿到首载内容；
            仅在有状态要表达（保存中/失败）时出现一行轻提示 */}
        <section className="px-4">
          {descriptionSaveError ? (
            <div className="text-rose pb-1 text-xs font-bold">保存失败，稍后自动重试</div>
          ) : descriptionSaving ? (
            <div className="text-ink-3 pb-1 text-xs font-bold">保存中…</div>
          ) : null}
          <div className="min-h-[200px]">
            {descriptionEditorReady ? (
              <Editor
                key={`todo-description-${todoId}`}
                initValue={normalizeEditorContent(content ?? EMPTY_EDITOR_CONTENT)}
                readonly={false}
                placeHolder="添加备注…"
                onChange={next => {
                  void handleDescriptionChange(next);
                }}
              />
            ) : (
              <div className="text-ink-3 grid h-[200px] place-items-center text-[13px]">
                正在加载描述...
              </div>
            )}
          </div>
        </section>
      </div>

      {/* 底部操作条：完成/打卡主操作（mobile-kb-screen 随键盘收缩视口自动上移） */}
      <div className="border-line bg-surface flex shrink-0 items-center gap-2.5 border-t px-4 pb-[calc(10px+var(--mobile-safe-bottom))] pt-2.5">
        <button
          type="button"
          onClick={handleToggleMain}
          className={`h-11 flex-1 rounded-full text-sm font-bold transition-transform active:scale-[0.98] ${
            mainDone
              ? "bg-sage-soft text-sage"
              : "shadow-accent text-white [background:var(--brand-grad)]"
          }`}
        >
          {mainLabel}
        </button>
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

      {/* 更多操作 */}
      <ActionSheet
        open={moreSheetOpen}
        title={current.title}
        kind="任务"
        items={moreSheetItems}
        onClose={() => setMoreSheetOpen(false)}
      />

      <MobileConfirmDialog
        open={deleteTarget !== null}
        title="删除任务"
        description={`「${clampText(deleteTarget?.title ?? "", 18)}」及其全部子任务将被删除。`}
        danger
        loading={deleteLoading}
        onCancel={() => {
          if (deleteLoading) return;
          setDeleteTarget(null);
        }}
        onConfirm={() => {
          void handleDeleteItem();
        }}
      />

      {/* 开始时间（未设置时默认落到今天 09:00） */}
      <DateTimePickerSheet
        open={startTimeSheetOpen}
        title="开始时间"
        value={current.startAt ?? null}
        defaultHour={9}
        onConfirm={timestamp => {
          void handleUpdateItemField({ startAt: timestamp });
          setStartTimeSheetOpen(false);
        }}
        onClear={() => {
          void handleUpdateItemField({ startAt: null });
          setStartTimeSheetOpen(false);
        }}
        onClose={() => setStartTimeSheetOpen(false)}
      />

      {/* 截止时间（未设置时默认落到今天 18:00） */}
      <DateTimePickerSheet
        open={dueTimeSheetOpen}
        title="截止时间"
        value={current.dueAt ?? null}
        defaultHour={18}
        onConfirm={timestamp => {
          void handleUpdateItemField({ dueAt: timestamp });
          setDueTimeSheetOpen(false);
        }}
        onClear={() => {
          void handleUpdateItemField({ dueAt: null });
          setDueTimeSheetOpen(false);
        }}
        onClose={() => setDueTimeSheetOpen(false)}
      />
    </div>
  );
}

export default TodoDetailPage;
