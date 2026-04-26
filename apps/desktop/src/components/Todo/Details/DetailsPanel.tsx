import { useEffect, useMemo, useRef, useState } from "react";
import { Descendant } from "slate";
import { DatePicker, Empty, Select, Spin, Tooltip } from "antd";
import dayjs from "dayjs";
import classNames from "classnames";
import CustomModal from "@/components/CustomModal";
import EditText, { EditTextHandle } from "@/components/EditText";
import { Editor, EditorRef } from "@tau/editor/src";
import useEditContent from "@/hooks/useEditContent";
import { createContent } from "@/commands";
import { getContentLength } from "@/utils";
import { useTodoStore } from "@/stores/useTodoStore";
import useThemeColors from "@/hooks/useThemeColors";
import {
  TodoItemType,
  TodoRecurrence,
  TodoRecurrenceCompletion,
} from "@/types";
import {
  getRecurrenceByItemId,
  getRecurrenceCompletions,
  completeRecurrence,
  uncompleteRecurrence,
} from "@/commands/todo";
import {
  isDateScheduledForRecurrence,
  getStartOfDayTimestamp,
} from "@/utils/recurrence";
import { emitTodoMutation, TODO_MUTATION_ACTIONS } from "@/mcp/todo/mutation";

const DEFAULT_DESCRIPTION_CONTENT: Descendant[] = [
  {
    type: "paragraph",
    disableDrag: false,
    children: [{ type: "formatted", text: "" }],
  },
];

type HeatmapStatus = "completed" | "missed" | "upcoming" | "skipped";

interface RecurrenceStats {
  durationDays: number;
  completedDays: number;
  missedDays: number;
  heatmap: Array<{ date: string; status: HeatmapStatus }>;
}

const statusColorMap: Record<HeatmapStatus, string> = {
  completed: "bg-emerald-500",
  missed: "bg-rose-400",
  skipped: "bg-amber-400",
  upcoming: "bg-slate-300 dark:bg-zinc-700",
};

const statusLabelMap: Record<HeatmapStatus, string> = {
  completed: "已完成",
  missed: "缺卡",
  skipped: "已跳过",
  upcoming: "待完成",
};

const formatDateTime = (value?: number | null) =>
  value ? dayjs(value).format("YYYY-MM-DD HH:mm") : "未设置";

const buildRecurrenceStats = (
  recurrence: TodoRecurrence,
  completions: TodoRecurrenceCompletion[],
): RecurrenceStats => {
  const completionMap = new Map<string, TodoRecurrenceCompletion>();
  completions.forEach((c) => {
    const key = dayjs(c.scheduledDate).format("YYYY-MM-DD");
    completionMap.set(key, c);
  });

  const start = dayjs(recurrence.startDate).startOf("day");
  const today = dayjs().startOf("day");
  const rawEnd = recurrence.endDate
    ? dayjs(recurrence.endDate).startOf("day")
    : today;
  const end = rawEnd.isAfter(today) ? today : rawEnd;

  const heatmapStartCandidate = end.subtract(180, "day");
  const heatmapStart = start.isAfter(heatmapStartCandidate)
    ? start
    : heatmapStartCandidate;

  const maxOccurrences = recurrence.maxOccurrences ?? Number.MAX_SAFE_INTEGER;

  const stats: RecurrenceStats = {
    durationDays: 0,
    completedDays: 0,
    missedDays: 0,
    heatmap: [],
  };

  let occurrenceCount = 0;

  for (
    let cursor = start.clone();
    cursor.isSame(end, "day") || cursor.isBefore(end, "day");
    cursor = cursor.add(1, "day")
  ) {
    if (!isDateScheduledForRecurrence(recurrence, cursor)) continue;

    occurrenceCount += 1;
    if (occurrenceCount > maxOccurrences) break;

    stats.durationDays += 1;

    const key = cursor.format("YYYY-MM-DD");
    const completion = completionMap.get(key);
    const isPast = cursor.isBefore(today, "day");
    const isToday = cursor.isSame(today, "day");

    let status: HeatmapStatus = "upcoming";
    if (completion?.completedAt) {
      status = "completed";
      stats.completedDays += 1;
    } else if (completion?.skipped) {
      status = "skipped";
      stats.missedDays += 1;
    } else if (isPast) {
      status = "missed";
      stats.missedDays += 1;
    } else if (isToday) {
      status = "upcoming";
    }

    if (!cursor.isBefore(heatmapStart)) {
      stats.heatmap.push({ date: key, status });
    }
  }

  return stats;
};

const InfoItem = ({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) => (
  <div className="rounded-lg border border-gray-100 dark:border-slate-800 bg-gray-50/60 dark:bg-zinc-800/40 px-3 py-2">
    <div className="text-[11px] text-gray-500 dark:text-slate-400">{label}</div>
    <div className="text-sm text-gray-900 dark:text-gray-50 mt-0.5 break-all">
      {value}
    </div>
  </div>
);

const HeatmapGrid = ({
  stats,
  onCellClick,
}: {
  stats: RecurrenceStats;
  recurrenceId: number;
  onCellClick: (date: string, currentStatus: HeatmapStatus) => Promise<void>;
}) => {
  const [clickingDate, setClickingDate] = useState<string | null>(null);

  if (!stats.heatmap.length) {
    return (
      <div className="text-xs text-gray-500 dark:text-slate-400">
        暂无可展示的打卡记录
      </div>
    );
  }

  const handleCellClick = async (cell: {
    date: string;
    status: HeatmapStatus;
  }) => {
    // Don't allow clicking on future dates (upcoming)
    const cellDate = dayjs(cell.date);
    const today = dayjs().startOf("day");

    if (cellDate.isAfter(today)) {
      // Future dates - do nothing
      return;
    }

    setClickingDate(cell.date);
    try {
      await onCellClick(cell.date, cell.status);
    } finally {
      setClickingDate(null);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-14 gap-1">
        {stats.heatmap.map((cell) => {
          const isClickable = !dayjs(cell.date).isAfter(dayjs().startOf("day"));
          const isClicking = clickingDate === cell.date;

          return (
            <Tooltip
              key={`${cell.date}-${cell.status}`}
              title={`${cell.date} · ${statusLabelMap[cell.status]}${isClickable ? " · 点击切换状态" : ""}`}
            >
              <div
                className={classNames(
                  "h-3 w-full rounded transition-all duration-200",
                  statusColorMap[cell.status],
                  isClickable &&
                    "cursor-pointer hover:opacity-80 hover:scale-110",
                  isClicking && "opacity-50",
                )}
                onClick={() => isClickable && handleCellClick(cell)}
              />
            </Tooltip>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-3 text-[11px] text-gray-500 dark:text-slate-400">
        {Object.entries(statusLabelMap).map(([status, label]) => (
          <span key={status} className="inline-flex items-center gap-1">
            <span
              className={classNames(
                "inline-block h-3 w-3 rounded",
                statusColorMap[status as HeatmapStatus],
              )}
            />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
};

const ListRow = ({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) => (
  <div className="flex items-center justify-between gap-4 py-3 border-b last:border-b-0 border-gray-100 dark:border-slate-800">
    <div className="flex-1 min-w-0">
      <div className="text-sm font-medium text-gray-800 dark:text-gray-200">
        {label}
      </div>
      {description && (
        <div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
          {description}
        </div>
      )}
    </div>
    <div className="flex-none flex justify-end">{children}</div>
  </div>
);

const SectionBlock = ({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) => (
  <div className="rounded-xl border border-gray-100 dark:border-slate-800 px-4 py-3 space-y-2">
    <div className="flex flex-col gap-1">
      <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
        {title}
      </div>
      {description && (
        <div className="text-xs text-gray-500 dark:text-slate-400">
          {description}
        </div>
      )}
    </div>
    <div className="divide-y divide-gray-100 dark:divide-slate-800">
      {children}
    </div>
  </div>
);

const DetailsPanel = () => {
  const {
    ui,
    setRightOpen,
    activeGroupId,
    itemsByGroupId,
    systemGroups,
    activeTodoId,
    updateItem,
    updateItemDescriptionContent,
    loadItems,
    loadGroupStats,
  } = useTodoStore();
  const themeColors = useThemeColors();

  const itemsKey = useMemo(() => {
    if (!activeGroupId) return -1;
    const systemGroup = systemGroups.find((g) => g.id === activeGroupId);
    if (systemGroup?.systemType) {
      return `_system_${systemGroup.systemType}`;
    }
    return activeGroupId;
  }, [activeGroupId, systemGroups]);

  const current = useMemo(() => {
    const items = itemsByGroupId[itemsKey as any] || [];
    return items.find((it) => it.id === activeTodoId);
  }, [activeTodoId, itemsByGroupId, itemsKey]);

  const [title, setTitle] = useState(current?.title || "");
  const [recurrenceStats, setRecurrenceStats] =
    useState<RecurrenceStats | null>(null);
  const [recurrenceConfig, setRecurrenceConfig] =
    useState<TodoRecurrence | null>(null);
  const [recurrenceLoading, setRecurrenceLoading] = useState(false);

  const titleRef = useRef<EditTextHandle>(null);
  const descriptionEditorRef = useRef<EditorRef>(null);

  const { throttleHandleEditorContentChange } = useEditContent(
    current?.descriptionContentId ?? undefined,
    (content) => {
      descriptionEditorRef.current?.setEditorValue(content);
    },
  );

  useEffect(() => {
    if (current) {
      titleRef.current?.setValue?.(current.title);
      setTitle(current.title);
    } else {
      setTitle("");
    }
  }, [current?.id, current?.title]);

  useEffect(() => {
    if (!current || current.type !== "recurring") {
      setRecurrenceStats(null);
      setRecurrenceConfig(null);
      return;
    }

    let cancelled = false;
    const loadRecurrence = async () => {
      setRecurrenceLoading(true);
      try {
        const recurrence =
          current.recurrence || (await getRecurrenceByItemId(current.id));
        if (cancelled) return;

        setRecurrenceConfig(recurrence);

        if (!recurrence) {
          setRecurrenceStats(null);
          return;
        }

        const completions = await getRecurrenceCompletions(
          recurrence.id,
          recurrence.startDate,
          dayjs().endOf("day").valueOf(),
        );
        if (cancelled) return;
        setRecurrenceStats(buildRecurrenceStats(recurrence, completions));
      } catch (error) {
        console.error("加载周期任务统计失败", error);
        if (!cancelled) {
          setRecurrenceStats(null);
        }
      } finally {
        if (!cancelled) {
          setRecurrenceLoading(false);
        }
      }
    };

    loadRecurrence();
    return () => {
      cancelled = true;
    };
  }, [current]);

  const handleTitleChange = () => {
    if (!activeTodoId) return;
    const trimmed = title.trim();
    if (!trimmed) return;
    updateItem({ id: activeTodoId, title: trimmed });
  };

  const handleDescriptionChange = async (content: Descendant[]) => {
    if (!activeTodoId || !current) return;

    updateItemDescriptionContent(activeTodoId, current.groupId, content);

    const isEmpty =
      JSON.stringify(content) === JSON.stringify(DEFAULT_DESCRIPTION_CONTENT);

    if (current.descriptionContentId) {
      if (!isEmpty) {
        throttleHandleEditorContentChange(content);
      }
    } else if (!isEmpty) {
      const contentId = await createContent(content, getContentLength(content));
      if (contentId) {
        await updateItem({ id: activeTodoId, descriptionContentId: contentId });
      }
    }
  };

  const handleHeatmapCellClick = async (
    date: string,
    currentStatus: HeatmapStatus,
  ) => {
    if (!recurrenceConfig) return;

    const dateTimestamp = getStartOfDayTimestamp(dayjs(date));

    try {
      if (currentStatus === "completed") {
        // Uncomplete
        await uncompleteRecurrence(recurrenceConfig.id, dateTimestamp);
        emitTodoMutation({
          source: "todo-details",
          entityType: "recurrence",
          entityId: recurrenceConfig.id,
          relatedItemId: current?.id,
          groupId: current?.groupId,
          action: TODO_MUTATION_ACTIONS.UNCOMPLETE_OCCURRENCE,
          changedFields: ["completedAt"],
        });
      } else if (currentStatus === "missed" || currentStatus === "upcoming") {
        // Complete
        await completeRecurrence(recurrenceConfig.id, dateTimestamp);
        emitTodoMutation({
          source: "todo-details",
          entityType: "recurrence",
          entityId: recurrenceConfig.id,
          relatedItemId: current?.id,
          groupId: current?.groupId,
          action: TODO_MUTATION_ACTIONS.COMPLETE_OCCURRENCE,
          changedFields: ["completedAt"],
        });
      } else if (currentStatus === "skipped") {
        // Toggle between skipped and completed
        // First uncomplete (removes skip), then complete
        await uncompleteRecurrence(recurrenceConfig.id, dateTimestamp);
        await completeRecurrence(recurrenceConfig.id, dateTimestamp);
        emitTodoMutation({
          source: "todo-details",
          entityType: "recurrence",
          entityId: recurrenceConfig.id,
          relatedItemId: current?.id,
          groupId: current?.groupId,
          action: TODO_MUTATION_ACTIONS.COMPLETE_OCCURRENCE,
          changedFields: ["completedAt", "skipped"],
        });
      }

      // Reload recurrence data
      if (current) {
        const completions = await getRecurrenceCompletions(
          recurrenceConfig.id,
          recurrenceConfig.startDate,
          dayjs().endOf("day").valueOf(),
        );
        setRecurrenceStats(buildRecurrenceStats(recurrenceConfig, completions));

        // Also reload the items to update the main list
        const gid = activeGroupId;
        if (gid != null) {
          const systemGroup = systemGroups.find((g) => g.id === gid);
          if (systemGroup?.systemType) {
            await useTodoStore
              .getState()
              .loadItemsByType(systemGroup.systemType);
          } else {
            await loadItems(gid);
          }
        }
        await loadGroupStats();
      }
    } catch (error) {
      console.error("Failed to toggle heatmap cell:", error);
    }
  };

  return (
    <CustomModal
      open={ui.rightOpen}
      onCancel={() => setRightOpen(false)}
      title="任务详情"
      subtitle={current ? "编辑并查看任务数据" : "请选择一个任务"}
      width={900}
      footer={null}
      destroyOnClose={false}
      bodyClassName="max-h-[75vh] overflow-y-auto"
    >
      {!current ? (
        <div className="py-12 flex items-center justify-center">
          <Empty description="请选择一个任务查看详情" />
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <div
              className={classNames(
                "text-xs",
                themeColors.textClass,
                "opacity-70",
              )}
            >
              标题
            </div>
            <EditText
              key={current.id}
              ref={titleRef}
              defaultValue={current.title}
              onChange={(value) => setTitle(value)}
              onPressEnter={handleTitleChange}
              contentEditable={true}
              className={classNames(
                "flex-1 min-w-0 h-9 leading-9 rounded-md px-3 text-base font-semibold transition-colors",
                themeColors.textClass,
                themeColors.hoverClass,
              )}
            />
          </div>

          <SectionBlock title="基本信息" description="任务类型与元信息">
            <ListRow label="任务类型" description="切换任务的分类或模式">
              <Select
                value={current.type || "normal"}
                onChange={(value: TodoItemType) =>
                  updateItem({ id: current.id, type: value })
                }
                className="w-[200px]"
                options={[
                  { value: "normal", label: "普通任务" },
                  { value: "deadline", label: "截止任务" },
                  { value: "planned", label: "计划任务" },
                  { value: "recurring", label: "周期任务" },
                ]}
              />
            </ListRow>
            <ListRow label="创建时间" description="记录首次创建的时间点">
              <span className={classNames("text-sm", themeColors.textClass)}>
                {formatDateTime(current.createTime)}
              </span>
            </ListRow>
            <ListRow label="完成时间" description="标记完成的时间点">
              <span className={classNames("text-sm", themeColors.textClass)}>
                {current.completedAt
                  ? formatDateTime(current.completedAt)
                  : "尚未完成"}
              </span>
            </ListRow>
          </SectionBlock>

          {current.type === "deadline" && (
            <SectionBlock title="截止任务" description="设置任务的截止与提醒">
              <ListRow label="截止日期" description="选择截止时间">
                <DatePicker
                  showTime
                  value={current.dueAt ? dayjs(current.dueAt) : null}
                  onChange={(date) =>
                    updateItem({
                      id: current.id,
                      dueAt: date ? date.valueOf() : null,
                    })
                  }
                  allowClear
                  placeholder="设置截止日期"
                  className="w-full max-w-[240px]"
                />
              </ListRow>
              {current.dueAt && (
                <ListRow label="提前提醒" description="设置提醒提前量">
                  <Select
                    value={current.remindBefore || undefined}
                    onChange={(value) =>
                      updateItem({
                        id: current.id,
                        remindBefore: value || null,
                      })
                    }
                    placeholder="不提醒"
                    allowClear
                    className="w-full max-w-[200px]"
                    options={[
                      { value: 0, label: "准时" },
                      { value: 5 * 60 * 1000, label: "5分钟前" },
                      { value: 10 * 60 * 1000, label: "10分钟前" },
                      { value: 15 * 60 * 1000, label: "15分钟前" },
                      { value: 30 * 60 * 1000, label: "30分钟前" },
                      { value: 60 * 60 * 1000, label: "1小时前" },
                      { value: 2 * 60 * 60 * 1000, label: "2小时前" },
                      { value: 24 * 60 * 60 * 1000, label: "1天前" },
                    ]}
                  />
                </ListRow>
              )}
            </SectionBlock>
          )}

          {current.type === "planned" && (
            <SectionBlock title="计划任务" description="设置开始/结束与提醒">
              <ListRow label="开始时间" description="计划的起始时间">
                <DatePicker
                  showTime
                  value={current.startAt ? dayjs(current.startAt) : null}
                  onChange={(date) =>
                    updateItem({
                      id: current.id,
                      startAt: date ? date.valueOf() : null,
                    })
                  }
                  allowClear
                  placeholder="设置开始时间"
                  className="w-full max-w-[240px]"
                />
              </ListRow>
              <ListRow label="结束时间" description="计划的结束时间">
                <DatePicker
                  showTime
                  value={current.dueAt ? dayjs(current.dueAt) : null}
                  onChange={(date) =>
                    updateItem({
                      id: current.id,
                      dueAt: date ? date.valueOf() : null,
                    })
                  }
                  allowClear
                  placeholder="设置结束时间"
                  className="w-full max-w-[240px]"
                />
              </ListRow>
              {current.dueAt && (
                <ListRow label="提前提醒" description="设置提醒提前量">
                  <Select
                    value={current.remindBefore || undefined}
                    onChange={(value) =>
                      updateItem({
                        id: current.id,
                        remindBefore: value || null,
                      })
                    }
                    placeholder="不提醒"
                    allowClear
                    className="w-full max-w-[200px]"
                    options={[
                      { value: 0, label: "准时" },
                      { value: 5 * 60 * 1000, label: "5分钟前" },
                      { value: 10 * 60 * 1000, label: "10分钟前" },
                      { value: 15 * 60 * 1000, label: "15分钟前" },
                      { value: 30 * 60 * 1000, label: "30分钟前" },
                      { value: 60 * 60 * 1000, label: "1小时前" },
                      { value: 2 * 60 * 60 * 1000, label: "2小时前" },
                      { value: 24 * 60 * 60 * 1000, label: "1天前" },
                    ]}
                  />
                </ListRow>
              )}
            </SectionBlock>
          )}

          {current.type === "recurring" && (
            <div className="rounded-xl border border-gray-100 dark:border-slate-800 bg-gray-50/60 dark:bg-zinc-900/40 px-4 py-3 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-col">
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    周期任务统计
                  </div>
                  {recurrenceConfig && (
                    <div className="text-[11px] text-gray-500 dark:text-slate-400">
                      起始：
                      {dayjs(recurrenceConfig.startDate).format("YYYY-MM-DD")}
                      {recurrenceConfig.endDate
                        ? ` · 结束：${dayjs(recurrenceConfig.endDate).format("YYYY-MM-DD")}`
                        : " · 持续进行中"}
                    </div>
                  )}
                </div>
                {recurrenceLoading && <Spin size="small" />}
              </div>
              {recurrenceLoading ? (
                <div className="py-4 text-center text-sm text-gray-500 dark:text-slate-400">
                  加载统计中...
                </div>
              ) : recurrenceStats && recurrenceConfig ? (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <InfoItem
                      label="持续天数"
                      value={`${recurrenceStats.durationDays} 天`}
                    />
                    <InfoItem
                      label="完成天数"
                      value={`${recurrenceStats.completedDays} 天`}
                    />
                    <InfoItem
                      label="缺卡天数"
                      value={`${recurrenceStats.missedDays} 天`}
                    />
                  </div>
                  <HeatmapGrid
                    stats={recurrenceStats}
                    recurrenceId={recurrenceConfig.id}
                    onCellClick={handleHeatmapCellClick}
                  />
                </>
              ) : (
                <div className="text-xs text-gray-500 dark:text-slate-400">
                  尚未配置周期规则或暂无统计数据
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <div className="text-xs text-gray-500 dark:text-slate-400">
              描述
            </div>
            <div
              className={classNames(
                "rounded-md border px-3 py-2 min-h-[120px]",
                themeColors.borderClass,
                themeColors.hoverClass,
              )}
            >
              <Editor
                key={current.id}
                ref={descriptionEditorRef}
                initValue={
                  current.descriptionContent || DEFAULT_DESCRIPTION_CONTENT
                }
                onChange={handleDescriptionChange}
                readonly={false}
                placeHolder="添加描述..."
                className={classNames("text-[12px]", themeColors.textClass)}
              />
            </div>
          </div>
        </div>
      )}
    </CustomModal>
  );
};

export default DetailsPanel;
