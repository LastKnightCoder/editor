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
} from "@tau/chat-ui";

import {
  useCalendarToolI18n,
  type CalendarToolTranslate,
  type CalendarToolMessageKey,
} from "./calendar.i18n";

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

const entityTypeMessages: Record<string, CalendarToolMessageKey> = {
  "calendar-group": "calendar.entity.calendar-group",
  calendar: "calendar.entity.calendar",
  "calendar-event": "calendar.entity.calendar-event",
};

const actionMessages: Record<string, CalendarToolMessageKey> = {
  "create-group": "calendar.action.create-group",
  "update-group": "calendar.action.update-group",
  "delete-group": "calendar.action.delete-group",
  "create-calendar": "calendar.action.create-calendar",
  "update-calendar": "calendar.action.update-calendar",
  "archive-calendar": "calendar.action.archive-calendar",
  "unarchive-calendar": "calendar.action.unarchive-calendar",
  "toggle-calendar-visibility": "calendar.action.toggle-calendar-visibility",
  "delete-calendar": "calendar.action.delete-calendar",
  "merge-calendars": "calendar.action.merge-calendars",
  "create-event": "calendar.action.create-event",
  "update-event": "calendar.action.update-event",
  "delete-event": "calendar.action.delete-event",
};

const getPrimaryText = (payload: CalendarOperationPayload, t: CalendarToolTranslate) => {
  if (payload.success === false) {
    return t("calendar.failed");
  }

  if (payload.action && actionMessages[payload.action]) {
    return t(actionMessages[payload.action]);
  }

  return t("calendar.done");
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

const renderDataSummary = (
  payload: CalendarOperationPayload,
  isDark: boolean,
  t: CalendarToolTranslate
) => {
  const data = payload.data;
  if (!data || typeof data !== "object") {
    return null;
  }

  if (typeof data.targetCalendarId === "number" && Array.isArray(data.sourceCalendarIds)) {
    return (
      <ToolValuePill isDark={isDark}>
        {t("calendar.merge", { id: data.targetCalendarId, count: data.sourceCalendarIds.length })}
      </ToolValuePill>
    );
  }

  if (typeof data.calendarTitle === "string" && data.calendarTitle.trim()) {
    return (
      <ToolValuePill isDark={isDark}>
        {t("calendar.belongsCalendar", { title: data.calendarTitle })}
      </ToolValuePill>
    );
  }

  if (typeof data.title === "string" && data.title.trim()) {
    return (
      <ToolValuePill isDark={isDark}>{t("calendar.title", { title: data.title })}</ToolValuePill>
    );
  }

  if (typeof data.name === "string" && data.name.trim()) {
    return <ToolValuePill isDark={isDark}>{t("calendar.name", { name: data.name })}</ToolValuePill>;
  }

  return null;
};

const CalendarOperationRenderer = ({
  execution,
  isDark,
  renderDefault,
}: ToolCallCustomRendererProps) => {
  const { t } = useCalendarToolI18n();
  const payload = parsePayload(execution.output);
  if (!payload || payload.kind !== "calendar-mutation-result") {
    return <>{renderDefault()}</>;
  }

  const failed = payload.success === false;
  const primaryText = getPrimaryText(payload, t);
  const displayTitle = getTitle(payload);
  const entityLabel = payload.entityType
    ? entityTypeMessages[payload.entityType]
      ? t(entityTypeMessages[payload.entityType])
      : null
    : null;
  const dataSummary = renderDataSummary(payload, isDark, t);
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
                <ToolSectionTitle isDark={isDark}>
                  {t("calendar.object", { title: displayTitle })}
                </ToolSectionTitle>
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
