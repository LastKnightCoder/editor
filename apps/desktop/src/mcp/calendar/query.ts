import dayjs from "dayjs";
import type { Descendant } from "slate";
import {
  getAllCalendarGroups,
  getAllCalendars,
  getCalendarById,
  getCalendarEventById,
  getCalendarGroupById,
  getEventsByDateRange,
  getEventsWithContent,
} from "@/commands";
import { getContentById } from "@/commands/content";
import type { Calendar, CalendarEvent, CalendarGroup } from "@/types";
import { truncateMarkdown } from "@/utils/mcp-helpers";
import { getMarkdown } from "@/utils/markdown";

export interface CalendarDashboardResult {
  kind: "calendar-dashboard";
  summary: {
    totalGroups: number;
    totalCalendars: number;
    visibleCalendars: number;
    archivedCalendars: number;
    upcomingEventCount: number;
  };
  groups: Array<{
    id: number;
    name: string;
    isSystem: boolean;
    calendarCount: number;
  }>;
  calendars: Array<{
    id: number;
    title: string;
    color: string;
    visible: boolean;
    archived: boolean;
    groupId?: number;
    groupName?: string | null;
  }>;
  upcomingEvents: CalendarEventListItem[];
}

export interface CalendarQueryListResult<T> {
  kind: "calendar-query-result";
  entityType: "calendar-group" | "calendar" | "calendar-event";
  summary: {
    totalCount: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
  };
  items: T[];
}

export interface CalendarGroupListItem {
  id: number;
  name: string;
  isSystem: boolean;
  parentGroupId: number | null;
  orderIndex: number;
  calendarCount: number;
}

export interface CalendarListItem {
  id: number;
  title: string;
  color: string;
  archived: boolean;
  pinned: boolean;
  visible: boolean;
  groupId?: number;
  groupName?: string | null;
  descriptionPreview?: string;
}

export interface CalendarEventListItem {
  id: number;
  title: string;
  calendarId: number;
  calendarTitle?: string;
  color: string | null;
  startDate: string;
  endDate: string | null;
  startTime: number | null;
  endTime: number | null;
  allDay: boolean;
  detailPreview?: string;
}

export interface CalendarGroupDetailResult {
  kind: "calendar-group-detail";
  entityType: "calendar-group";
  id: number;
  data: {
    id: number;
    name: string;
    isSystem: boolean;
    parentGroupId: number | null;
    orderIndex: number;
    calendars: CalendarListItem[];
  };
}

export interface CalendarDetailResult {
  kind: "calendar-detail";
  entityType: "calendar";
  id: number;
  data: {
    id: number;
    title: string;
    color: string;
    archived: boolean;
    pinned: boolean;
    visible: boolean;
    groupId?: number;
    groupName?: string | null;
    markdown: string;
    preview: string;
    recentEvents: CalendarEventListItem[];
  };
}

export interface CalendarEventDetailResult {
  kind: "calendar-event-detail";
  entityType: "calendar-event";
  id: number;
  data: {
    id: number;
    title: string;
    calendarId: number;
    calendarTitle?: string;
    color: string | null;
    startDate: string;
    endDate: string | null;
    startTime: number | null;
    endTime: number | null;
    allDay: boolean;
    markdown: string;
    preview: string;
  };
}

const normalizeText = (value: string) => value.trim().toLowerCase();

const safeMarkdownFromContent = async (contentId: number, preloaded?: Descendant[] | null) => {
  if (preloaded?.length) {
    return getMarkdown(preloaded).trim();
  }

  if (!contentId) {
    return "";
  }

  const content = await getContentById(contentId);
  if (!content?.content?.length) {
    return "";
  }

  return getMarkdown(content.content).trim();
};

const buildPreview = (markdown: string, maxLength = 140) => {
  if (!markdown.trim()) {
    return "";
  }
  return truncateMarkdown(markdown.trim(), maxLength).content.replace(/\n+/g, " ").trim();
};

const formatDate = (timestamp: number) => dayjs(timestamp).format("YYYY-MM-DD");

const toRangeTimestamps = (params: { startDate?: string; endDate?: string; dates?: string[] }) => {
  if (params.dates?.length) {
    const values = params.dates.map(date => dayjs(date).startOf("day").valueOf());
    return {
      start: Math.min(...values),
      end: dayjs(Math.max(...values))
        .endOf("day")
        .valueOf(),
    };
  }

  const start = params.startDate
    ? dayjs(params.startDate).startOf("day").valueOf()
    : dayjs().startOf("month").valueOf();
  const end = params.endDate
    ? dayjs(params.endDate).endOf("day").valueOf()
    : dayjs(start).endOf("month").valueOf();
  return { start, end };
};

const paginate = <T>(items: T[], page = 1, pageSize = 20) => {
  const safePage = page > 0 ? page : 1;
  const safePageSize = pageSize > 0 ? pageSize : 20;
  const startIndex = (safePage - 1) * safePageSize;
  const pagedItems = items.slice(startIndex, startIndex + safePageSize);
  return {
    items: pagedItems,
    summary: {
      totalCount: items.length,
      page: safePage,
      pageSize: safePageSize,
      hasMore: startIndex + safePageSize < items.length,
    },
  };
};

const buildCalendarItem = async (
  calendar: Calendar,
  groupsById: Map<number, CalendarGroup>,
  includeDescription = false
) => {
  const markdown = includeDescription
    ? await safeMarkdownFromContent(calendar.descriptionContentId, calendar.description)
    : "";

  return {
    id: calendar.id,
    title: calendar.title,
    color: calendar.color,
    archived: calendar.archived,
    pinned: calendar.pinned,
    visible: calendar.visible,
    groupId: calendar.groupId,
    groupName: calendar.groupId != null ? (groupsById.get(calendar.groupId)?.name ?? null) : null,
    ...(includeDescription ? { descriptionPreview: buildPreview(markdown) } : {}),
  } satisfies CalendarListItem;
};

const buildEventListItem = (
  event: CalendarEvent,
  calendarsById: Map<number, Calendar>,
  detailMarkdown?: string
) =>
  ({
    id: event.id,
    title: event.title,
    calendarId: event.calendarId,
    calendarTitle: calendarsById.get(event.calendarId)?.title,
    color: event.color,
    startDate: formatDate(event.startDate),
    endDate: event.endDate ? formatDate(event.endDate) : null,
    startTime: event.startTime,
    endTime: event.endTime,
    allDay: event.allDay,
    ...(detailMarkdown ? { detailPreview: buildPreview(detailMarkdown) } : {}),
  }) satisfies CalendarEventListItem;

export const getCalendarDashboardData = async (): Promise<CalendarDashboardResult> => {
  const [groups, calendars] = await Promise.all([getAllCalendarGroups(), getAllCalendars()]);
  const calendarsById = new Map(calendars.map(calendar => [calendar.id, calendar]));
  const rangeStart = dayjs().startOf("day").valueOf();
  const rangeEnd = dayjs().add(30, "day").endOf("day").valueOf();
  const events = await getEventsByDateRange(rangeStart, rangeEnd);

  return {
    kind: "calendar-dashboard",
    summary: {
      totalGroups: groups.length,
      totalCalendars: calendars.length,
      visibleCalendars: calendars.filter(calendar => calendar.visible).length,
      archivedCalendars: calendars.filter(calendar => calendar.archived).length,
      upcomingEventCount: events.length,
    },
    groups: groups.map(group => ({
      id: group.id,
      name: group.name,
      isSystem: group.isSystem,
      calendarCount: calendars.filter(calendar => calendar.groupId === group.id).length,
    })),
    calendars: calendars.map(calendar => ({
      id: calendar.id,
      title: calendar.title,
      color: calendar.color,
      visible: calendar.visible,
      archived: calendar.archived,
      groupId: calendar.groupId,
      groupName:
        calendar.groupId != null
          ? (groups.find(group => group.id === calendar.groupId)?.name ?? null)
          : null,
    })),
    upcomingEvents: events
      .sort((left, right) => left.startDate - right.startDate)
      .slice(0, 8)
      .map(event => buildEventListItem(event, calendarsById)),
  };
};

export const queryCalendarGroups = async (args: {
  ids?: number[];
  names?: string[];
  includeSystem?: boolean;
  page?: number;
  pageSize?: number;
}): Promise<CalendarQueryListResult<CalendarGroupListItem>> => {
  const [groups, calendars] = await Promise.all([getAllCalendarGroups(), getAllCalendars()]);
  const ids = Array.isArray(args.ids) ? new Set(args.ids) : null;
  const names = Array.isArray(args.names)
    ? new Set(args.names.map(item => normalizeText(item)))
    : null;
  const includeSystem = args.includeSystem ?? true;

  const filtered = groups.filter(group => {
    if (!includeSystem && group.isSystem) {
      return false;
    }
    if (ids && !ids.has(group.id)) {
      return false;
    }
    if (names && !names.has(normalizeText(group.name))) {
      return false;
    }
    return true;
  });

  const { items, summary } = paginate(filtered, args.page, args.pageSize);

  return {
    kind: "calendar-query-result",
    entityType: "calendar-group",
    summary,
    items: items.map(group => ({
      id: group.id,
      name: group.name,
      isSystem: group.isSystem,
      parentGroupId: group.parentGroupId,
      orderIndex: group.orderIndex,
      calendarCount: calendars.filter(calendar => calendar.groupId === group.id).length,
    })),
  };
};

export const getCalendarGroupDetail = async (id: number): Promise<CalendarGroupDetailResult> => {
  const [group, calendars, groups] = await Promise.all([
    getCalendarGroupById(id),
    getAllCalendars(),
    getAllCalendarGroups(),
  ]);
  const groupsById = new Map(groups.map(item => [item.id, item]));
  const groupCalendars = await Promise.all(
    calendars
      .filter(calendar => calendar.groupId === id)
      .map(calendar => buildCalendarItem(calendar, groupsById))
  );

  return {
    kind: "calendar-group-detail",
    entityType: "calendar-group",
    id: group.id,
    data: {
      id: group.id,
      name: group.name,
      isSystem: group.isSystem,
      parentGroupId: group.parentGroupId,
      orderIndex: group.orderIndex,
      calendars: groupCalendars,
    },
  };
};

export const queryCalendars = async (args: {
  ids?: number[];
  titles?: string[];
  groupIds?: number[];
  groupNames?: string[];
  visible?: boolean;
  archived?: boolean;
  pinned?: boolean;
  includeSystem?: boolean;
  includeDescription?: boolean;
  page?: number;
  pageSize?: number;
}): Promise<CalendarQueryListResult<CalendarListItem>> => {
  const [calendars, groups] = await Promise.all([getAllCalendars(), getAllCalendarGroups()]);
  const ids = Array.isArray(args.ids) ? new Set(args.ids) : null;
  const titles = Array.isArray(args.titles)
    ? new Set(args.titles.map(item => normalizeText(item)))
    : null;
  const groupIds = Array.isArray(args.groupIds) ? new Set(args.groupIds) : null;
  const groupNames = Array.isArray(args.groupNames)
    ? new Set(args.groupNames.map(item => normalizeText(item)))
    : null;
  const includeSystem = args.includeSystem ?? true;
  const groupsById = new Map(groups.map(group => [group.id, group]));

  const filtered = calendars.filter(calendar => {
    if (!includeSystem && calendar.isInSystemGroup) {
      return false;
    }
    if (ids && !ids.has(calendar.id)) {
      return false;
    }
    if (titles && !titles.has(normalizeText(calendar.title))) {
      return false;
    }
    if (groupIds && !groupIds.has(calendar.groupId ?? -1)) {
      return false;
    }
    if (
      groupNames &&
      !groupNames.has(normalizeText(groupsById.get(calendar.groupId ?? -1)?.name ?? ""))
    ) {
      return false;
    }
    if (typeof args.visible === "boolean" && calendar.visible !== args.visible) {
      return false;
    }
    if (typeof args.archived === "boolean" && calendar.archived !== args.archived) {
      return false;
    }
    if (typeof args.pinned === "boolean" && calendar.pinned !== args.pinned) {
      return false;
    }
    return true;
  });

  const { items, summary } = paginate(filtered, args.page, args.pageSize);

  return {
    kind: "calendar-query-result",
    entityType: "calendar",
    summary,
    items: await Promise.all(
      items.map(calendar => buildCalendarItem(calendar, groupsById, args.includeDescription))
    ),
  };
};

export const getCalendarDetail = async (id: number): Promise<CalendarDetailResult> => {
  const calendar = await getCalendarById(id);
  const [groups, events] = await Promise.all([
    getAllCalendarGroups(),
    getEventsByDateRange(
      dayjs().subtract(30, "day").startOf("day").valueOf(),
      dayjs().add(30, "day").endOf("day").valueOf(),
      [id]
    ),
  ]);
  const calendarsById = new Map([[calendar.id, calendar]]);
  const markdown = await safeMarkdownFromContent(
    calendar.descriptionContentId,
    calendar.description
  );

  return {
    kind: "calendar-detail",
    entityType: "calendar",
    id: calendar.id,
    data: {
      id: calendar.id,
      title: calendar.title,
      color: calendar.color,
      archived: calendar.archived,
      pinned: calendar.pinned,
      visible: calendar.visible,
      groupId: calendar.groupId,
      groupName:
        calendar.groupId != null
          ? (groups.find(group => group.id === calendar.groupId)?.name ?? null)
          : null,
      markdown,
      preview: buildPreview(markdown, 220),
      recentEvents: events
        .sort((left, right) => right.startDate - left.startDate)
        .slice(0, 8)
        .map(event => buildEventListItem(event, calendarsById)),
    },
  };
};

export const queryCalendarEvents = async (args: {
  ids?: number[];
  calendarIds?: number[];
  calendarTitles?: string[];
  dates?: string[];
  startDate?: string;
  endDate?: string;
  keyword?: string;
  allDay?: boolean;
  includeDetail?: boolean;
  maxLength?: number;
  page?: number;
  pageSize?: number;
}): Promise<CalendarQueryListResult<CalendarEventListItem>> => {
  const calendars = await getAllCalendars();
  const calendarsById = new Map(calendars.map(calendar => [calendar.id, calendar]));
  const ids = Array.isArray(args.ids) ? new Set(args.ids) : null;
  const calendarIds = Array.isArray(args.calendarIds) ? new Set(args.calendarIds) : null;
  const calendarTitles = Array.isArray(args.calendarTitles)
    ? new Set(args.calendarTitles.map(item => normalizeText(item)))
    : null;
  const explicitDates = Array.isArray(args.dates)
    ? new Set(args.dates.map(item => dayjs(item).format("YYYY-MM-DD")))
    : null;
  const includeDetail = args.includeDetail ?? Boolean(args.keyword);

  const hasExplicitRange = Boolean(args.dates?.length || args.startDate || args.endDate);
  const baseEvents =
    ids && ids.size > 0 && !hasExplicitRange
      ? await Promise.all(
          Array.from(ids).map(async id => {
            const event = await getCalendarEventById(id);
            if (!includeDetail) {
              return event;
            }
            const detailContent = await safeMarkdownFromContent(
              event.detailContentId,
              event.detailContent
            );
            return {
              ...event,
              detailContent,
            };
          })
        )
      : includeDetail
        ? await getEventsWithContent({
            dates: args.dates,
            startDate: args.startDate,
            endDate: args.endDate,
            calendarIds: args.calendarIds,
            maxLength: args.maxLength,
          })
        : await (() => {
            const { start, end } = toRangeTimestamps(args);
            return getEventsByDateRange(start, end, args.calendarIds);
          })();

  const filtered = baseEvents.filter(event => {
    if (ids && !ids.has(event.id)) {
      return false;
    }
    if (calendarIds && !calendarIds.has(event.calendarId)) {
      return false;
    }
    if (
      calendarTitles &&
      !calendarTitles.has(normalizeText(calendarsById.get(event.calendarId)?.title ?? ""))
    ) {
      return false;
    }
    if (typeof args.allDay === "boolean" && event.allDay !== args.allDay) {
      return false;
    }
    if (explicitDates?.size) {
      const eventDate =
        typeof event.startDate === "string"
          ? dayjs(event.startDate).format("YYYY-MM-DD")
          : formatDate(event.startDate);
      if (!explicitDates.has(eventDate)) {
        return false;
      }
    }
    if (args.keyword) {
      const keyword = normalizeText(args.keyword);
      const detailContent =
        "detailContent" in event && typeof event.detailContent === "string"
          ? event.detailContent
          : "";
      const combined = normalizeText(`${event.title}\n${detailContent}`);
      if (!combined.includes(keyword)) {
        return false;
      }
    }
    return true;
  });

  const sorted = filtered.sort((left, right) => {
    const leftValue = dayjs(left.startDate).valueOf();
    const rightValue = dayjs(right.startDate).valueOf();
    return leftValue - rightValue || (left.startTime ?? 0) - (right.startTime ?? 0);
  });
  const { items, summary } = paginate(sorted, args.page, args.pageSize);

  return {
    kind: "calendar-query-result",
    entityType: "calendar-event",
    summary,
    items: items.map(event =>
      buildEventListItem(
        {
          ...event,
          startDate:
            typeof event.startDate === "string"
              ? dayjs(event.startDate).valueOf()
              : event.startDate,
          endDate:
            typeof event.endDate === "string" && event.endDate
              ? dayjs(event.endDate).valueOf()
              : event.endDate,
        } as CalendarEvent,
        calendarsById,
        "detailContent" in event && typeof event.detailContent === "string"
          ? event.detailContent
          : undefined
      )
    ),
  };
};

export const getCalendarEventDetail = async (id: number): Promise<CalendarEventDetailResult> => {
  const [event, calendars] = await Promise.all([getCalendarEventById(id), getAllCalendars()]);
  const calendarsById = new Map(calendars.map(calendar => [calendar.id, calendar]));
  const markdown = await safeMarkdownFromContent(event.detailContentId, event.detailContent);

  return {
    kind: "calendar-event-detail",
    entityType: "calendar-event",
    id: event.id,
    data: {
      id: event.id,
      title: event.title,
      calendarId: event.calendarId,
      calendarTitle: calendarsById.get(event.calendarId)?.title,
      color: event.color,
      startDate: formatDate(event.startDate),
      endDate: event.endDate ? formatDate(event.endDate) : null,
      startTime: event.startTime,
      endTime: event.endTime,
      allDay: event.allDay,
      markdown,
      preview: buildPreview(markdown, 260),
    },
  };
};
