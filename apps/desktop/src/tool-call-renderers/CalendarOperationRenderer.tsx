import { Check, X } from "lucide-react";
import { cn } from "@tau/ui";
import type { ToolCallCustomRendererProps } from "./types";
import {
  ToolBadge,
  ToolCard,
  ToolCardBody,
  ToolCardHeader,
  ToolMutedText,
  ToolSectionTitle,
  ToolValuePill,
} from "./ui";

type CalendarOperationPayload = {
  kind?: string;
  success?: boolean;
  entityType?: "calendar-group" | "calendar" | "calendar-event";
  action?: string;
  message?: string;
  data?: Record<string, unknown> | null;
  event?: {
    entityId?: number;
    groupId?: number | null;
    calendarId?: number | null;
  } | null;
};

const parsePayload = (output?: string): CalendarOperationPayload | null => {
  if (!output) return null;
  try {
    const parsed = JSON.parse(output) as CalendarOperationPayload;
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
};

const entityTypeLabelMap: Record<string, string> = {
  "calendar-group": "日历分组",
  calendar: "日历",
  "calendar-event": "日历事件",
};

const actionLabelMap: Record<string, string> = {
  "create-group": "已创建日历分组",
  "update-group": "已更新日历分组",
  "delete-group": "已删除日历分组",
  "create-calendar": "已创建日历",
  "update-calendar": "已更新日历",
  "archive-calendar": "已归档日历",
  "unarchive-calendar": "已取消归档日历",
  "toggle-calendar-visibility": "已更新日历显隐",
  "delete-calendar": "已删除日历",
  "merge-calendars": "已合并日历",
  "create-event": "已创建日历事件",
  "update-event": "已更新日历事件",
  "delete-event": "已删除日历事件",
};

const getPrimaryText = (payload: CalendarOperationPayload) => {
  if (payload.success === false) {
    return "操作失败";
  }

  if (payload.action && actionLabelMap[payload.action]) {
    return actionLabelMap[payload.action];
  }

  return "操作已完成";
};

const getTitle = (payload: CalendarOperationPayload) => {
  const data = payload.data;
  if (!data || typeof data !== "object") {
    return null;
  }

  const titleCandidates = ["title", "name", "calendarTitle"] as const;
  for (const key of titleCandidates) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
};

const renderDataSummary = (payload: CalendarOperationPayload, isDark: boolean) => {
  const data = payload.data;
  if (!data || typeof data !== "object") {
    return null;
  }

  if (typeof data.targetCalendarId === "number" && Array.isArray(data.sourceCalendarIds)) {
    return (
      <ToolValuePill isDark={isDark}>
        目标日历 #{data.targetCalendarId} · 来源 {data.sourceCalendarIds.length} 个
      </ToolValuePill>
    );
  }

  if (typeof data.calendarTitle === "string" && data.calendarTitle.trim()) {
    return <ToolValuePill isDark={isDark}>所属日历：{data.calendarTitle}</ToolValuePill>;
  }

  if (typeof data.title === "string" && data.title.trim()) {
    return <ToolValuePill isDark={isDark}>标题：{data.title}</ToolValuePill>;
  }

  if (typeof data.name === "string" && data.name.trim()) {
    return <ToolValuePill isDark={isDark}>名称：{data.name}</ToolValuePill>;
  }

  return null;
};

const CalendarOperationRenderer = ({
  execution,
  isDark,
  renderDefault,
}: ToolCallCustomRendererProps) => {
  const payload = parsePayload(execution.output);
  if (!payload || payload.kind !== "calendar-mutation-result") {
    return <>{renderDefault()}</>;
  }

  const failed = payload.success === false;
  const primaryText = getPrimaryText(payload);
  const displayTitle = getTitle(payload);
  const entityLabel = payload.entityType ? entityTypeLabelMap[payload.entityType] : null;
  const dataSummary = renderDataSummary(payload, isDark);
  const StatusIcon = failed ? X : Check;

  return (
    <ToolCard isDark={isDark}>
      <ToolCardHeader isDark={isDark}>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <StatusIcon
            aria-hidden
            size={14}
            strokeWidth={2}
            className={cn("shrink-0", failed ? "text-danger" : "text-ok")}
          />
          <div
            className={cn(
              "text-tau-body min-w-0 flex-1 font-medium",
              failed ? "text-danger" : "text-ink-1"
            )}
          >
            {primaryText}
          </div>
          {entityLabel ? <ToolBadge isDark={isDark}>{entityLabel}</ToolBadge> : null}
        </div>
      </ToolCardHeader>
      {displayTitle || payload.message || dataSummary ? (
        <ToolCardBody>
          {displayTitle || payload.message ? (
            <div className="space-y-0.5">
              {displayTitle ? (
                <ToolSectionTitle isDark={isDark}>对象：{displayTitle}</ToolSectionTitle>
              ) : null}
              {payload.message ? (
                <ToolMutedText isDark={isDark} className="break-words">
                  {payload.message}
                </ToolMutedText>
              ) : null}
            </div>
          ) : null}
          {dataSummary}
        </ToolCardBody>
      ) : null}
    </ToolCard>
  );
};

export default CalendarOperationRenderer;
