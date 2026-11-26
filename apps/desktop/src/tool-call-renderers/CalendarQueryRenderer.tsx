import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, RotateCw } from "lucide-react";
import { Button, cn } from "@tau/ui";
import type { ToolCallCustomRendererProps } from "./types";
import {
  getCalendarDashboardData,
  getCalendarDetail,
  getCalendarEventDetail,
  getCalendarGroupDetail,
  queryCalendarEvents,
  queryCalendarGroups,
  queryCalendars,
  type CalendarDashboardResult,
  type CalendarDetailResult,
  type CalendarEventDetailResult,
  type CalendarEventListItem,
  type CalendarGroupDetailResult,
  type CalendarGroupListItem,
  type CalendarListItem,
  type CalendarQueryListResult,
} from "@/mcp/calendar/query";
import { subscribeCalendarMutationEvent } from "@/mcp/calendar/events";
import { shouldRefreshCalendarResult } from "@/mcp/calendar/mutation";
import {
  ToolBadge,
  ToolCard,
  ToolCardBody,
  ToolCardHeader,
  ToolDividerList,
  ToolDividerListItem,
  ToolMutedText,
  ToolSectionTitle,
  ToolValuePill,
} from "@tau/chat-ui";

import {
  useCalendarToolI18n,
  type CalendarToolTranslate,
  type CalendarToolMessageKey,
} from "./calendar.i18n";

import { toolDateLabel } from "./date-format";

type CalendarRendererData =
  | CalendarDashboardResult
  | CalendarQueryListResult<CalendarGroupListItem | CalendarListItem | CalendarEventListItem>
  | CalendarGroupDetailResult
  | CalendarDetailResult
  | CalendarEventDetailResult;

const parseOutput = (output?: string): CalendarRendererData | null => {
  if (!output) return null;
  try {
    const parsed = JSON.parse(output) as CalendarRendererData;
    if (parsed && typeof parsed === "object" && "kind" in parsed) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
};

const formatMinutes = (value: number | null | undefined) => {
  if (value == null) return "";
  const hours = Math.floor(value / 60)
    .toString()
    .padStart(2, "0");
  const minutes = (value % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
};

const formatEventTime = (item: CalendarEventListItem, locale: string, t: CalendarToolTranslate) => {
  const startDate = toolDateLabel(item.startDate, locale);
  const endDate = item.endDate ? toolDateLabel(item.endDate, locale) : null;
  if (item.allDay) {
    return item.endDate && item.endDate !== item.startDate
      ? `${startDate} - ${endDate} · ${t("calendar.allDay")}`
      : `${startDate} · ${t("calendar.allDay")}`;
  }

  const start = formatMinutes(item.startTime);
  const end = formatMinutes(item.endTime);
  const dateText =
    item.endDate && item.endDate !== item.startDate ? `${startDate} - ${endDate}` : startDate;
  return `${dateText}${start ? ` · ${start}` : ""}${end ? ` - ${end}` : ""}`;
};

const QueryRefreshButton = ({
  loading,
  onRefresh,
}: {
  isDark?: boolean;
  loading: boolean;
  onRefresh: () => void;
}) => {
  const { t } = useCalendarToolI18n();
  return (
    <Button
      variant="ghost"
      size="sm"
      icon={RotateCw}
      loading={loading}
      loadingText={t("calendar.refreshing")}
      onClick={onRefresh}
      className="-my-1 -mr-1.5 h-[26px] px-2"
    >
      {t("calendar.refresh")}
    </Button>
  );
};

/** 列表行 / 详情的主标题：正文档 + medium 字重 */
const ItemTitle = ({ children, truncate = false }: { children: ReactNode; truncate?: boolean }) => (
  <div
    className={cn(
      "text-tau-body text-ink-1 min-w-0 font-medium",
      truncate ? "flex-1 truncate" : "break-words"
    )}
  >
    {children}
  </div>
);

const EventList = ({ items }: { items: CalendarEventListItem[]; isDark?: boolean }) => {
  const { t, locale } = useCalendarToolI18n();
  const [expanded, setExpanded] = useState(false);

  if (items.length === 0) {
    return <ToolMutedText>{t("calendar.emptyEvents")}</ToolMutedText>;
  }

  const visibleItems = expanded ? items : items.slice(0, 5);

  return (
    <div>
      <ToolDividerList>
        {visibleItems.map(item => (
          <ToolDividerListItem key={item.id}>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <ItemTitle truncate>{item.title}</ItemTitle>
              {item.calendarTitle ? <ToolBadge>{item.calendarTitle}</ToolBadge> : null}
            </div>
            <ToolMutedText className="mt-0.5 break-words tabular-nums">
              <time dateTime={item.startDate}>{formatEventTime(item, locale, t)}</time>
            </ToolMutedText>
            {item.detailPreview ? (
              <ToolMutedText className="text-ink-2 mt-1 break-words">
                {item.detailPreview}
              </ToolMutedText>
            ) : null}
          </ToolDividerListItem>
        ))}
      </ToolDividerList>
      {items.length > 5 ? (
        <div className="mt-2 flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            icon={expanded ? ChevronUp : ChevronDown}
            onClick={() => setExpanded(value => !value)}
          >
            {expanded
              ? t("calendar.collapseEvents")
              : t("calendar.moreEvents", { count: items.length - 5 })}
          </Button>
        </div>
      ) : null}
    </div>
  );
};

const CalendarQueryRenderer = ({
  execution,
  isDark,
  parsedInput,
  renderDefault,
}: ToolCallCustomRendererProps) => {
  const { t, locale } = useCalendarToolI18n();
  const initialData = useMemo(() => parseOutput(execution.output), [execution.output]);
  const [data, setData] = useState<CalendarRendererData | null>(initialData);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const queryInput = (parsedInput ?? null) as Record<string, unknown> | null;
  const isDetailTool =
    execution.toolName === "get_calendar_group_detail" ||
    execution.toolName === "get_calendar_detail" ||
    execution.toolName === "get_calendar_event_detail";

  const refresh = async () => {
    setLoading(true);
    try {
      setUnavailable(false);
      let next: CalendarRendererData | null = null;
      switch (execution.toolName) {
        case "get_calendar_dashboard":
          next = await getCalendarDashboardData();
          break;
        case "query_calendar_groups":
          next = await queryCalendarGroups(queryInput ?? {});
          break;
        case "get_calendar_group_detail":
          next = await getCalendarGroupDetail(Number(queryInput?.id));
          break;
        case "query_calendars":
          next = await queryCalendars(queryInput ?? {});
          break;
        case "get_calendar_detail":
          next = await getCalendarDetail(Number(queryInput?.id));
          break;
        case "query_calendar_events":
        case "get_events_by_dates":
        case "get_events_by_date_range":
          next = await queryCalendarEvents(queryInput ?? {});
          break;
        case "get_calendar_event_detail":
          next = await getCalendarEventDetail(Number(queryInput?.id));
          break;
      }

      if (next) {
        setData(next);
      }
    } catch (error) {
      console.error("[calendar-renderer] refresh failed", error);
      if (isDetailTool) {
        setData(null);
        setUnavailable(true);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setData(initialData);
    setUnavailable(false);
  }, [initialData]);

  useEffect(() => {
    if (!data) return;
    return subscribeCalendarMutationEvent(event => {
      if (
        shouldRefreshCalendarResult({
          event,
          toolName: execution.toolName,
          parsedInput: queryInput,
          payloadKind: data.kind,
          payloadEntityType: "entityType" in data ? data.entityType : undefined,
          payloadId: "id" in data ? data.id : null,
        })
      ) {
        void refresh();
      }
    });
  }, [data, execution.toolName, queryInput]);

  if (!data && !unavailable) {
    return <>{renderDefault()}</>;
  }

  const refreshAction = (
    <QueryRefreshButton isDark={isDark} loading={loading} onRefresh={() => void refresh()} />
  );

  if (unavailable) {
    return (
      <ToolCard isDark={isDark}>
        <ToolCardHeader isDark={isDark}>
          <ToolSectionTitle isDark={isDark} action={refreshAction}>
            {t("calendar.unavailableTitle")}
          </ToolSectionTitle>
        </ToolCardHeader>
        <ToolCardBody>
          <ToolMutedText isDark={isDark}>{t("calendar.unavailable")}</ToolMutedText>
        </ToolCardBody>
      </ToolCard>
    );
  }

  if (!data) {
    return <>{renderDefault()}</>;
  }

  const currentData = data;

  if (currentData.kind === "calendar-dashboard") {
    return (
      <ToolCard isDark={isDark}>
        <ToolCardHeader isDark={isDark}>
          <ToolSectionTitle isDark={isDark} action={refreshAction}>
            {t("calendar.dashboard")}
          </ToolSectionTitle>
        </ToolCardHeader>
        <ToolCardBody>
          <div className="grid grid-cols-2 gap-1.5 tabular-nums">
            <ToolValuePill isDark={isDark}>
              {t("calendar.calendars", { count: currentData.summary.totalCalendars })}
            </ToolValuePill>
            <ToolValuePill isDark={isDark}>
              {t("calendar.groups", { count: currentData.summary.totalGroups })}
            </ToolValuePill>
            <ToolValuePill isDark={isDark}>
              {t("calendar.visibleCount", { count: currentData.summary.visibleCalendars })}
            </ToolValuePill>
            <ToolValuePill isDark={isDark}>
              {t("calendar.upcomingCount", { count: currentData.summary.upcomingEventCount })}
            </ToolValuePill>
          </div>
          <div className="space-y-1.5">
            <ToolSectionTitle isDark={isDark}>{t("calendar.futureEvents")}</ToolSectionTitle>
            <EventList items={currentData.upcomingEvents} isDark={isDark} />
          </div>
        </ToolCardBody>
      </ToolCard>
    );
  }

  if (currentData.kind === "calendar-query-result") {
    const titleMessages: Record<string, CalendarToolMessageKey> = {
      "calendar-group": "calendar.query.calendar-group",
      calendar: "calendar.query.calendar",
      "calendar-event": "calendar.query.calendar-event",
    };

    return (
      <ToolCard isDark={isDark}>
        <ToolCardHeader isDark={isDark}>
          <ToolSectionTitle isDark={isDark} action={refreshAction}>
            {t(titleMessages[currentData.entityType])}
          </ToolSectionTitle>
          <ToolMutedText isDark={isDark} className="mt-0.5 tabular-nums">
            {t("calendar.page", {
              count: currentData.summary.totalCount,
              page: currentData.summary.page,
            })}
          </ToolMutedText>
        </ToolCardHeader>
        <ToolCardBody>
          {currentData.entityType === "calendar-event" ? (
            <EventList items={currentData.items as CalendarEventListItem[]} isDark={isDark} />
          ) : (
            <ToolDividerList>
              {(currentData.items as Array<CalendarGroupListItem | CalendarListItem>).map(item => (
                <ToolDividerListItem key={item.id}>
                  {"title" in item ? (
                    <>
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <ItemTitle truncate>{item.title}</ItemTitle>
                        {"visible" in item ? (
                          <ToolBadge>
                            {item.visible ? t("calendar.visible") : t("calendar.hidden")}
                          </ToolBadge>
                        ) : null}
                      </div>
                      {"groupName" in item && item.groupName ? (
                        <ToolMutedText className="mt-0.5">
                          {t("calendar.group", { name: item.groupName })}
                        </ToolMutedText>
                      ) : null}
                      {"descriptionPreview" in item && item.descriptionPreview ? (
                        <ToolMutedText className="text-ink-2 mt-1 break-words">
                          {item.descriptionPreview}
                        </ToolMutedText>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <ItemTitle>{item.name}</ItemTitle>
                      <ToolMutedText className="mt-0.5 tabular-nums">
                        {t("calendar.groupCalendars", {
                          kind: t(item.isSystem ? "calendar.systemGroup" : "calendar.regularGroup"),
                          count: item.calendarCount,
                        })}
                      </ToolMutedText>
                    </>
                  )}
                </ToolDividerListItem>
              ))}
            </ToolDividerList>
          )}
        </ToolCardBody>
      </ToolCard>
    );
  }

  if (currentData.kind === "calendar-group-detail") {
    return (
      <ToolCard isDark={isDark}>
        <ToolCardHeader isDark={isDark}>
          <ToolSectionTitle isDark={isDark} action={refreshAction}>
            {t("calendar.groupDetail")}
          </ToolSectionTitle>
        </ToolCardHeader>
        <ToolCardBody>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <ItemTitle>{currentData.data.name}</ItemTitle>
              <ToolBadge isDark={isDark}>
                {currentData.data.isSystem ? t("calendar.systemGroup") : t("calendar.regularGroup")}
              </ToolBadge>
            </div>
            <ToolMutedText isDark={isDark} className="tabular-nums">
              {t("calendar.containsCalendars", { count: currentData.data.calendars.length })}
            </ToolMutedText>
          </div>
          <div className="space-y-1.5">
            {currentData.data.calendars.map(calendar => (
              <ToolValuePill key={calendar.id} isDark={isDark}>
                {calendar.title}
                {calendar.groupName ? ` · ${calendar.groupName}` : ""}
              </ToolValuePill>
            ))}
          </div>
        </ToolCardBody>
      </ToolCard>
    );
  }

  if (currentData.kind === "calendar-detail") {
    return (
      <ToolCard isDark={isDark}>
        <ToolCardHeader isDark={isDark}>
          <ToolSectionTitle isDark={isDark} action={refreshAction}>
            {t("calendar.calendarDetail")}
          </ToolSectionTitle>
        </ToolCardHeader>
        <ToolCardBody>
          <div className="space-y-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <ItemTitle truncate>{currentData.data.title}</ItemTitle>
              <ToolBadge isDark={isDark}>
                {currentData.data.visible ? t("calendar.visible") : t("calendar.hidden")}
              </ToolBadge>
              {currentData.data.archived ? (
                <ToolBadge isDark={isDark}>{t("calendar.archived")}</ToolBadge>
              ) : null}
            </div>
            {currentData.data.groupName ? (
              <ToolMutedText isDark={isDark}>
                {t("calendar.group", { name: currentData.data.groupName })}
              </ToolMutedText>
            ) : null}
          </div>
          {currentData.data.preview ? (
            <ToolValuePill isDark={isDark}>{currentData.data.preview}</ToolValuePill>
          ) : null}
          <div className="space-y-1.5">
            <ToolSectionTitle isDark={isDark}>{t("calendar.recentEvents")}</ToolSectionTitle>
            <EventList items={currentData.data.recentEvents} isDark={isDark} />
          </div>
        </ToolCardBody>
      </ToolCard>
    );
  }

  return (
    <ToolCard isDark={isDark}>
      <ToolCardHeader isDark={isDark}>
        <ToolSectionTitle isDark={isDark} action={refreshAction}>
          {t("calendar.eventDetail")}
        </ToolSectionTitle>
      </ToolCardHeader>
      <ToolCardBody>
        <div className="space-y-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <ItemTitle truncate>{currentData.data.title}</ItemTitle>
            {currentData.data.calendarTitle ? (
              <ToolBadge isDark={isDark}>{currentData.data.calendarTitle}</ToolBadge>
            ) : null}
          </div>
          <ToolMutedText isDark={isDark} className="tabular-nums">
            <time dateTime={currentData.data.startDate}>
              {formatEventTime(currentData.data, locale, t)}
            </time>
          </ToolMutedText>
        </div>
        {currentData.data.preview ? (
          <ToolValuePill isDark={isDark}>{currentData.data.preview}</ToolValuePill>
        ) : null}
      </ToolCardBody>
    </ToolCard>
  );
};

export default CalendarQueryRenderer;
