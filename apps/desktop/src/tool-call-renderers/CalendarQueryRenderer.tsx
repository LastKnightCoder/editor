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
  loading,
  onRefresh,
}: {
  isDark?: boolean;
  loading: boolean;
  onRefresh: () => void;
}) => (
  <Button
    variant="ghost"
    size="sm"
    icon={RotateCw}
    loading={loading}
    loadingText="刷新中..."
    onClick={onRefresh}
    className="-my-1 -mr-1.5 h-[26px] px-2"
  >
    刷新
  </Button>
);

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
  const [expanded, setExpanded] = useState(false);

  if (items.length === 0) {
    return <ToolMutedText>当前没有符合条件的日历事件。</ToolMutedText>;
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
              {formatEventTime(item)}
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
            {expanded ? "收起事件列表" : `展开剩余 ${items.length - 5} 条事件`}
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

  const refreshAction = (
    <QueryRefreshButton isDark={isDark} loading={loading} onRefresh={() => void refresh()} />
  );

  if (unavailableMessage) {
    return (
      <ToolCard isDark={isDark}>
        <ToolCardHeader isDark={isDark}>
          <ToolSectionTitle isDark={isDark} action={refreshAction}>
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
        <ToolCardHeader isDark={isDark}>
          <ToolSectionTitle isDark={isDark} action={refreshAction}>
            日历总览
          </ToolSectionTitle>
        </ToolCardHeader>
        <ToolCardBody>
          <div className="grid grid-cols-2 gap-1.5 tabular-nums">
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
          <div className="space-y-1.5">
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
        <ToolCardHeader isDark={isDark}>
          <ToolSectionTitle isDark={isDark} action={refreshAction}>
            {titleMap[currentData.entityType]}
          </ToolSectionTitle>
          <ToolMutedText isDark={isDark} className="mt-0.5 tabular-nums">
            共 {currentData.summary.totalCount} 条，当前第 {currentData.summary.page} 页
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
                          <ToolBadge>{item.visible ? "可见" : "隐藏"}</ToolBadge>
                        ) : null}
                      </div>
                      {"groupName" in item && item.groupName ? (
                        <ToolMutedText className="mt-0.5">分组：{item.groupName}</ToolMutedText>
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
                        {item.isSystem ? "系统分组" : "普通分组"} · 日历 {item.calendarCount} 个
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
            分组详情
          </ToolSectionTitle>
        </ToolCardHeader>
        <ToolCardBody>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <ItemTitle>{currentData.data.name}</ItemTitle>
              <ToolBadge isDark={isDark}>
                {currentData.data.isSystem ? "系统分组" : "普通分组"}
              </ToolBadge>
            </div>
            <ToolMutedText isDark={isDark} className="tabular-nums">
              包含日历 {currentData.data.calendars.length} 个
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
            日历详情
          </ToolSectionTitle>
        </ToolCardHeader>
        <ToolCardBody>
          <div className="space-y-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <ItemTitle truncate>{currentData.data.title}</ItemTitle>
              <ToolBadge isDark={isDark}>{currentData.data.visible ? "可见" : "隐藏"}</ToolBadge>
              {currentData.data.archived ? <ToolBadge isDark={isDark}>已归档</ToolBadge> : null}
            </div>
            {currentData.data.groupName ? (
              <ToolMutedText isDark={isDark}>分组：{currentData.data.groupName}</ToolMutedText>
            ) : null}
          </div>
          {currentData.data.preview ? (
            <ToolValuePill isDark={isDark}>{currentData.data.preview}</ToolValuePill>
          ) : null}
          <div className="space-y-1.5">
            <ToolSectionTitle isDark={isDark}>最近事件</ToolSectionTitle>
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
          事件详情
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
            {formatEventTime(currentData.data)}
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
