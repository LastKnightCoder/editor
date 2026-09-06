import { useEffect, useMemo, useState } from "react";
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
  ToolMutedText,
  ToolSectionTitle,
  ToolValuePill,
} from "./ui";

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

const formatEventTime = (item: CalendarEventListItem) => {
  if (item.allDay) {
    return item.endDate && item.endDate !== item.startDate
      ? `${item.startDate} - ${item.endDate} · 全天`
      : `${item.startDate} · 全天`;
  }

  const start = formatMinutes(item.startTime);
  const end = formatMinutes(item.endTime);
  const dateText =
    item.endDate && item.endDate !== item.startDate
      ? `${item.startDate} - ${item.endDate}`
      : item.startDate;
  return `${dateText}${start ? ` · ${start}` : ""}${end ? ` - ${end}` : ""}`;
};

const QueryRefreshButton = ({
  isDark,
  loading,
  onRefresh,
}: {
  isDark: boolean;
  loading: boolean;
  onRefresh: () => void;
}) => (
  <button
    type="button"
    className={`rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
      loading
        ? isDark
          ? "cursor-not-allowed bg-zinc-800 text-slate-500"
          : "cursor-not-allowed bg-slate-100 text-slate-400"
        : isDark
          ? "bg-zinc-800 text-slate-200 hover:bg-zinc-700"
          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
    }`}
    disabled={loading}
    onClick={onRefresh}
  >
    {loading ? "刷新中..." : "刷新"}
  </button>
);

const EventList = ({ items, isDark }: { items: CalendarEventListItem[]; isDark: boolean }) => {
  const [expanded, setExpanded] = useState(false);

  if (items.length === 0) {
    return <ToolMutedText isDark={isDark}>当前没有符合条件的日历事件。</ToolMutedText>;
  }

  const visibleItems = expanded ? items : items.slice(0, 5);

  return (
    <div className="space-y-2">
      {visibleItems.map(item => (
        <div
          key={item.id}
          className={`rounded-xl border p-3 ${
            isDark ? "border-white/10 bg-zinc-950/40" : "border-slate-200 bg-slate-50/60"
          }`}
        >
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div
              className={`min-w-0 flex-1 truncate text-sm font-medium ${
                isDark ? "text-slate-100" : "text-slate-800"
              }`}
            >
              {item.title}
            </div>
            {item.calendarTitle ? (
              <ToolBadge isDark={isDark}>{item.calendarTitle}</ToolBadge>
            ) : null}
          </div>
          <ToolMutedText isDark={isDark} className="mt-1 break-words">
            {formatEventTime(item)}
          </ToolMutedText>
          {item.detailPreview ? (
            <ToolMutedText isDark={isDark} className="mt-2 break-words">
              {item.detailPreview}
            </ToolMutedText>
          ) : null}
        </div>
      ))}
      {items.length > 5 ? (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            className={`inline-flex items-center justify-center rounded-full border px-4 py-2 text-xs font-semibold transition-colors ${
              isDark
                ? "border-[var(--th-info)]/40 bg-[var(--th-info)]/10 hover:border-[var(--th-info)]/50 hover:bg-[var(--th-info)]/15 text-status-info hover:text-status-info"
                : "border-[var(--th-info)]/30 bg-[var(--th-info)]/10 text-status-info hover:border-[var(--th-info)]/30 hover:bg-[var(--th-info)]/15 hover:text-status-info"
            }`}
            onClick={() => setExpanded(value => !value)}
          >
            {expanded ? "收起事件列表" : `展开剩余 ${items.length - 5} 条事件`}
          </button>
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
  const initialData = useMemo(() => parseOutput(execution.output), [execution.output]);
  const [data, setData] = useState<CalendarRendererData | null>(initialData);
  const [loading, setLoading] = useState(false);
  const [unavailableMessage, setUnavailableMessage] = useState<string | null>(null);
  const queryInput = (parsedInput ?? null) as Record<string, unknown> | null;
  const isDetailTool =
    execution.toolName === "get_calendar_group_detail" ||
    execution.toolName === "get_calendar_detail" ||
    execution.toolName === "get_calendar_event_detail";

  const refresh = async () => {
    setLoading(true);
    try {
      setUnavailableMessage(null);
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
        setUnavailableMessage("对象已不可用，可能已被删除或移动。");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setData(initialData);
    setUnavailableMessage(null);
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

  if (!data && !unavailableMessage) {
    return <>{renderDefault()}</>;
  }

  if (unavailableMessage) {
    return (
      <ToolCard isDark={isDark}>
        <ToolCardHeader isDark={isDark} divided>
          <ToolSectionTitle
            isDark={isDark}
            action={
              <QueryRefreshButton
                isDark={isDark}
                loading={loading}
                onRefresh={() => void refresh()}
              />
            }
          >
            详情已失效
          </ToolSectionTitle>
        </ToolCardHeader>
        <ToolCardBody>
          <ToolMutedText isDark={isDark}>{unavailableMessage}</ToolMutedText>
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
        <ToolCardHeader isDark={isDark} divided>
          <ToolSectionTitle
            isDark={isDark}
            action={
              <QueryRefreshButton
                isDark={isDark}
                loading={loading}
                onRefresh={() => void refresh()}
              />
            }
          >
            日历总览
          </ToolSectionTitle>
        </ToolCardHeader>
        <ToolCardBody>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <ToolValuePill isDark={isDark}>
              日历 {currentData.summary.totalCalendars} 个
            </ToolValuePill>
            <ToolValuePill isDark={isDark}>分组 {currentData.summary.totalGroups} 个</ToolValuePill>
            <ToolValuePill isDark={isDark}>
              可见 {currentData.summary.visibleCalendars} 个
            </ToolValuePill>
            <ToolValuePill isDark={isDark}>
              近期事件 {currentData.summary.upcomingEventCount} 条
            </ToolValuePill>
          </div>
          <div className="space-y-2">
            <ToolSectionTitle isDark={isDark}>未来事件</ToolSectionTitle>
            <EventList items={currentData.upcomingEvents} isDark={isDark} />
          </div>
        </ToolCardBody>
      </ToolCard>
    );
  }

  if (currentData.kind === "calendar-query-result") {
    const titleMap: Record<string, string> = {
      "calendar-group": "日历分组查询结果",
      calendar: "日历查询结果",
      "calendar-event": "日历事件查询结果",
    };

    return (
      <ToolCard isDark={isDark}>
        <ToolCardHeader isDark={isDark} divided>
          <ToolSectionTitle
            isDark={isDark}
            action={
              <QueryRefreshButton
                isDark={isDark}
                loading={loading}
                onRefresh={() => void refresh()}
              />
            }
          >
            {titleMap[currentData.entityType]}
          </ToolSectionTitle>
          <ToolMutedText isDark={isDark} className="mt-1">
            共 {currentData.summary.totalCount} 条，当前第 {currentData.summary.page} 页
          </ToolMutedText>
        </ToolCardHeader>
        <ToolCardBody>
          {currentData.entityType === "calendar-event" ? (
            <EventList items={currentData.items as CalendarEventListItem[]} isDark={isDark} />
          ) : (
            <div className="space-y-2">
              {(currentData.items as Array<CalendarGroupListItem | CalendarListItem>).map(item => (
                <div
                  key={item.id}
                  className={`rounded-xl border p-3 ${
                    isDark ? "border-white/10 bg-zinc-950/40" : "border-slate-200 bg-slate-50/60"
                  }`}
                >
                  {"title" in item ? (
                    <>
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <div
                          className={`min-w-0 flex-1 truncate text-sm font-medium ${
                            isDark ? "text-slate-100" : "text-slate-800"
                          }`}
                        >
                          {item.title}
                        </div>
                        {"visible" in item ? (
                          <ToolBadge isDark={isDark}>{item.visible ? "可见" : "隐藏"}</ToolBadge>
                        ) : null}
                      </div>
                      {"groupName" in item && item.groupName ? (
                        <ToolMutedText isDark={isDark} className="mt-1">
                          分组：{item.groupName}
                        </ToolMutedText>
                      ) : null}
                      {"descriptionPreview" in item && item.descriptionPreview ? (
                        <ToolMutedText isDark={isDark} className="mt-2 break-words">
                          {item.descriptionPreview}
                        </ToolMutedText>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <div
                        className={`text-sm font-medium ${
                          isDark ? "text-slate-100" : "text-slate-800"
                        }`}
                      >
                        {item.name}
                      </div>
                      <ToolMutedText isDark={isDark} className="mt-1">
                        {item.isSystem ? "系统分组" : "普通分组"} · 日历 {item.calendarCount} 个
                      </ToolMutedText>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </ToolCardBody>
      </ToolCard>
    );
  }

  if (currentData.kind === "calendar-group-detail") {
    return (
      <ToolCard isDark={isDark}>
        <ToolCardHeader isDark={isDark} divided>
          <ToolSectionTitle
            isDark={isDark}
            action={
              <QueryRefreshButton
                isDark={isDark}
                loading={loading}
                onRefresh={() => void refresh()}
              />
            }
          >
            分组详情
          </ToolSectionTitle>
        </ToolCardHeader>
        <ToolCardBody>
          <div className="flex flex-wrap items-center gap-2">
            <div className={`text-sm font-medium ${isDark ? "text-slate-100" : "text-slate-800"}`}>
              {currentData.data.name}
            </div>
            <ToolBadge isDark={isDark}>
              {currentData.data.isSystem ? "系统分组" : "普通分组"}
            </ToolBadge>
          </div>
          <ToolMutedText isDark={isDark}>
            包含日历 {currentData.data.calendars.length} 个
          </ToolMutedText>
          <div className="space-y-2">
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
        <ToolCardHeader isDark={isDark} divided>
          <ToolSectionTitle
            isDark={isDark}
            action={
              <QueryRefreshButton
                isDark={isDark}
                loading={loading}
                onRefresh={() => void refresh()}
              />
            }
          >
            日历详情
          </ToolSectionTitle>
        </ToolCardHeader>
        <ToolCardBody>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div
              className={`min-w-0 flex-1 truncate text-sm font-medium ${isDark ? "text-slate-100" : "text-slate-800"}`}
            >
              {currentData.data.title}
            </div>
            <ToolBadge isDark={isDark}>{currentData.data.visible ? "可见" : "隐藏"}</ToolBadge>
            {currentData.data.archived ? <ToolBadge isDark={isDark}>已归档</ToolBadge> : null}
          </div>
          {currentData.data.groupName ? (
            <ToolMutedText isDark={isDark}>分组：{currentData.data.groupName}</ToolMutedText>
          ) : null}
          {currentData.data.preview ? (
            <ToolValuePill isDark={isDark}>{currentData.data.preview}</ToolValuePill>
          ) : null}
          <div className="space-y-2">
            <ToolSectionTitle isDark={isDark}>最近事件</ToolSectionTitle>
            <EventList items={currentData.data.recentEvents} isDark={isDark} />
          </div>
        </ToolCardBody>
      </ToolCard>
    );
  }

  return (
    <ToolCard isDark={isDark}>
      <ToolCardHeader isDark={isDark} divided>
        <ToolSectionTitle
          isDark={isDark}
          action={
            <QueryRefreshButton
              isDark={isDark}
              loading={loading}
              onRefresh={() => void refresh()}
            />
          }
        >
          事件详情
        </ToolSectionTitle>
      </ToolCardHeader>
      <ToolCardBody>
        <div className={`text-sm font-medium ${isDark ? "text-slate-100" : "text-slate-800"}`}>
          {currentData.data.title}
        </div>
        <ToolMutedText isDark={isDark}>{formatEventTime(currentData.data)}</ToolMutedText>
        {currentData.data.calendarTitle ? (
          <ToolBadge isDark={isDark}>{currentData.data.calendarTitle}</ToolBadge>
        ) : null}
        {currentData.data.preview ? (
          <ToolValuePill isDark={isDark}>{currentData.data.preview}</ToolValuePill>
        ) : null}
      </ToolCardBody>
    </ToolCard>
  );
};

export default CalendarQueryRenderer;
