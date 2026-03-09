import type { ToolCallCustomRendererProps } from "./types";
import { ToolBadge, ToolCard, ToolCardBody, ToolCardHeader } from "./ui";

type OperationPayload = {
  success?: boolean;
  todoId?: number;
  todoItemId?: number;
  recurrence?: {
    id: number;
    type: string;
    interval: number;
  } | null;
  notes?: Array<{
    id: number;
    title?: string;
    type?: string;
    contentId: number;
  }>;
  mappings?: Array<{
    id: number;
    calendarEventId: number;
    syncType: string;
    recurrenceDate?: number | null;
  }>;
  event?: {
    action?: string;
    entityType?: string;
    entityId?: number;
    groupId?: number | null;
    relatedItemId?: number | null;
  };
  data?: Record<string, unknown> | null;
};

const entityTypeLabelMap: Record<string, string> = {
  item: "任务",
  group: "分组",
  recurrence: "周期",
  "note-link": "笔记",
  "calendar-mapping": "日历",
};

const getDisplayTitle = (payload: OperationPayload) => {
  const data = payload.data;
  if (!data || typeof data !== "object") return null;
  const title = typeof data.title === "string" ? data.title : null;
  return title && title.trim() ? title.trim() : null;
};

const getDisplayGroupTitle = (payload: OperationPayload) => {
  const data = payload.data;
  if (!data || typeof data !== "object") return null;
  const groupTitle =
    typeof data.groupTitle === "string" ? data.groupTitle : null;
  return groupTitle && groupTitle.trim() ? groupTitle.trim() : null;
};

const parsePayload = (output?: string): OperationPayload | null => {
  if (!output) return null;
  try {
    const parsed = JSON.parse(output) as OperationPayload;
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
};

const actionLabelMap: Record<string, string> = {
  "create-group": "已创建分组",
  "update-group": "已更新分组",
  "archive-group": "已归档分组",
  "unarchive-group": "已取消归档分组",
  "reorder-groups": "已重排分组",
  "create-item": "已创建任务",
  "create-item-above": "已在上方创建任务",
  "create-item-below": "已在下方创建任务",
  "create-item-child": "已创建子任务",
  "update-item": "已更新任务",
  "complete-item": "已标记完成",
  "uncomplete-item": "已取消完成",
  "move-item": "已移动任务",
  "archive-item": "已归档任务",
  "unarchive-item": "已取消归档任务",
  "delete-item": "已删除任务",
  "delete-item-cascade": "已删除任务树",
  "create-recurrence": "已创建周期规则",
  "update-recurrence": "已更新周期规则",
  "delete-recurrence": "已删除周期规则",
  "complete-occurrence": "已完成周期实例",
  "uncomplete-occurrence": "已撤销周期实例",
  "skip-occurrence": "已跳过周期实例",
  "attach-note": "已关联笔记",
  "create-and-attach-note": "已新建并关联笔记",
  "detach-note": "已解除笔记关联",
  "reorder-notes": "已更新笔记顺序",
  "update-note-title-snapshot": "已更新笔记标题快照",
  "create-calendar-mapping": "已创建日历映射",
  "delete-calendar-mapping": "已删除日历映射",
  "delete-calendar-mappings-by-todo": "已清空日历映射",
  "sync-item-to-calendar": "已同步到任务日历",
  "remove-item-from-calendar": "已从任务日历移除",
};

const getPrimaryText = (payload: OperationPayload) => {
  const action = payload.event?.action;
  if (action && actionLabelMap[action]) {
    return actionLabelMap[action];
  }

  if (Array.isArray(payload.notes)) {
    return `共 ${payload.notes.length} 条关联笔记`;
  }

  if (Array.isArray(payload.mappings)) {
    return `共 ${payload.mappings.length} 条日历映射`;
  }

  if (payload.recurrence) {
    return "已读取周期规则";
  }

  return payload.success === false ? "操作失败" : "操作已完成";
};

const renderDataSummary = (payload: OperationPayload, isDark: boolean) => {
  if (Array.isArray(payload.notes)) {
    return (
      <div className="space-y-2">
        {payload.notes.slice(0, 6).map((note) => (
          <div
            key={note.id}
            className={`rounded-md px-3 py-2 text-xs ${
              isDark
                ? "bg-slate-950/50 text-slate-300"
                : "bg-slate-50 text-slate-600"
            }`}
          >
            {note.title || `内容 ${note.contentId}`}
            {note.type ? ` · ${note.type}` : ""}
          </div>
        ))}
      </div>
    );
  }

  if (Array.isArray(payload.mappings)) {
    return (
      <div className="space-y-2">
        {payload.mappings.slice(0, 6).map((mapping) => (
          <div
            key={mapping.id}
            className={`rounded-md px-3 py-2 text-xs ${
              isDark
                ? "bg-slate-950/50 text-slate-300"
                : "bg-slate-50 text-slate-600"
            }`}
          >
            事件 #{mapping.calendarEventId} · {mapping.syncType}
          </div>
        ))}
      </div>
    );
  }

  if (payload.recurrence) {
    return (
      <div
        className={`rounded-md px-3 py-2 text-xs ${
          isDark
            ? "bg-slate-950/50 text-slate-300"
            : "bg-slate-50 text-slate-600"
        }`}
      >
        类型：{payload.recurrence.type} · 间隔：{payload.recurrence.interval}
      </div>
    );
  }

  const data = payload.data;
  if (data && typeof data === "object") {
    const title = typeof data.title === "string" ? data.title : null;
    if (title) {
      return (
        <div
          className={`rounded-md px-3 py-2 text-xs ${
            isDark
              ? "bg-slate-950/50 text-slate-300"
              : "bg-slate-50 text-slate-600"
          }`}
        >
          标题：{title}
        </div>
      );
    }
  }

  return null;
};

const TodoOperationRenderer = ({
  execution,
  isDark,
  renderDefault,
}: ToolCallCustomRendererProps) => {
  const payload = parsePayload(execution.output);
  if (!payload) {
    return <>{renderDefault()}</>;
  }

  const primaryText = getPrimaryText(payload);
  const dataSummary = renderDataSummary(payload, isDark);
  const displayTitle = getDisplayTitle(payload);
  const displayGroupTitle = getDisplayGroupTitle(payload);
  const entityLabel = payload.event?.entityType
    ? entityTypeLabelMap[payload.event.entityType] || null
    : null;
  const hasSecondaryContent = Boolean(
    displayTitle || displayGroupTitle || dataSummary,
  );

  return (
    <ToolCard isDark={isDark}>
      <ToolCardHeader isDark={isDark} divided={hasSecondaryContent}>
        <div className="flex items-center gap-2">
          <div
            className={`text-sm font-medium ${isDark ? "text-slate-100" : "text-slate-800"}`}
          >
            {primaryText}
          </div>
          {entityLabel ? (
            <ToolBadge isDark={isDark}>{entityLabel}</ToolBadge>
          ) : null}
        </div>
      </ToolCardHeader>
      {hasSecondaryContent ? (
        <ToolCardBody>
          {displayTitle ? (
            <div
              className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}
            >
              关联对象：{displayTitle}
            </div>
          ) : null}
          {displayGroupTitle ? (
            <div
              className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}
            >
              所属分组：{displayGroupTitle}
            </div>
          ) : null}
          {dataSummary}
        </ToolCardBody>
      ) : null}
    </ToolCard>
  );
};

export default TodoOperationRenderer;
