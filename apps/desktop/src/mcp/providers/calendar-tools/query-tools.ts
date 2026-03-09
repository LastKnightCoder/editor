import type { ToolDefinition, ToolParameterSchema } from "@/types";
import {
  getCalendarDashboardData,
  getCalendarDetail,
  getCalendarEventDetail,
  getCalendarGroupDetail,
  queryCalendarEvents,
  queryCalendarGroups,
  queryCalendars,
} from "@/mcp/calendar/query";
import { calendarQuerySchema, dateStringSchema, toJson } from "./shared";

export const buildCalendarQueryTools = (): ToolDefinition[] => [
  {
    name: "get_calendar_dashboard",
    description:
      "获取日历总览。返回分组数量、日历数量、可见状态和未来 30 天的近期事件摘要，适合回答“我的日历概况如何”。",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    executor: async () => toJson(await getCalendarDashboardData()),
  },
  {
    name: "query_calendar_groups",
    description:
      "查询日历分组。支持按分组 ID、名称和是否包含系统分组筛选，适合在创建或调整日历前先定位目标分组。",
    parameters: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "number" } },
        names: { type: "array", items: { type: "string" } },
        includeSystem: { type: "boolean" },
        page: { type: "number" },
        pageSize: { type: "number" },
      },
      required: [],
      additionalProperties: false,
    },
    executor: async (args) =>
      toJson(
        await queryCalendarGroups({
          ids: args.ids as number[] | undefined,
          names: args.names as string[] | undefined,
          includeSystem: args.includeSystem as boolean | undefined,
          page: args.page as number | undefined,
          pageSize: args.pageSize as number | undefined,
        }),
      ),
  },
  {
    name: "get_calendar_group_detail",
    description:
      "获取单个日历分组详情。返回分组本身和其下日历列表，适合在修改或删除分组前读取上下文。",
    parameters: {
      type: "object",
      properties: {
        id: { type: "number" },
      },
      required: ["id"],
      additionalProperties: false,
    },
    executor: async (args) =>
      toJson(await getCalendarGroupDetail(args.id as number)),
  },
  {
    name: "query_calendars",
    description:
      "查询日历列表。支持按标题、分组、显隐、归档、置顶和系统日历过滤，适合定位要操作的日历。",
    parameters: calendarQuerySchema,
    executor: async (args) =>
      toJson(
        await queryCalendars({
          ids: args.ids as number[] | undefined,
          titles: args.titles as string[] | undefined,
          groupIds: args.groupIds as number[] | undefined,
          groupNames: args.groupNames as string[] | undefined,
          visible: args.visible as boolean | undefined,
          archived: args.archived as boolean | undefined,
          pinned: args.pinned as boolean | undefined,
          includeSystem: args.includeSystem as boolean | undefined,
          includeDescription: args.includeDescription as boolean | undefined,
          page: args.page as number | undefined,
          pageSize: args.pageSize as number | undefined,
        }),
      ),
  },
  {
    name: "get_calendar_detail",
    description:
      "获取单个日历详情。返回日历属性、分组、描述 Markdown 和最近事件摘要，适合在编辑前读取完整上下文。",
    parameters: {
      type: "object",
      properties: {
        id: { type: "number" },
      },
      required: ["id"],
      additionalProperties: false,
    },
    executor: async (args) =>
      toJson(await getCalendarDetail(args.id as number)),
  },
  {
    name: "query_calendar_events",
    description:
      "查询日历事件。支持按事件 ID、日历、日期范围、关键字和是否全天筛选，可选返回详情摘要。",
    parameters: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "number" } },
        calendarIds: { type: "array", items: { type: "number" } },
        calendarTitles: { type: "array", items: { type: "string" } },
        dates: { type: "array", items: dateStringSchema },
        startDate: dateStringSchema,
        endDate: dateStringSchema,
        keyword: { type: "string" },
        allDay: { type: "boolean" },
        includeDetail: { type: "boolean" },
        maxLength: { type: "number" },
        page: { type: "number" },
        pageSize: { type: "number" },
      } as Record<string, ToolParameterSchema>,
      required: [],
      additionalProperties: false,
    },
    executor: async (args) =>
      toJson(
        await queryCalendarEvents({
          ids: args.ids as number[] | undefined,
          calendarIds: args.calendarIds as number[] | undefined,
          calendarTitles: args.calendarTitles as string[] | undefined,
          dates: args.dates as string[] | undefined,
          startDate: args.startDate as string | undefined,
          endDate: args.endDate as string | undefined,
          keyword: args.keyword as string | undefined,
          allDay: args.allDay as boolean | undefined,
          includeDetail: args.includeDetail as boolean | undefined,
          maxLength: args.maxLength as number | undefined,
          page: args.page as number | undefined,
          pageSize: args.pageSize as number | undefined,
        }),
      ),
  },
  {
    name: "get_calendar_event_detail",
    description:
      "获取单个日历事件详情。返回时间、所属日历和详情 Markdown，适合在修改或解释事件前读取。",
    parameters: {
      type: "object",
      properties: {
        id: { type: "number" },
      },
      required: ["id"],
      additionalProperties: false,
    },
    executor: async (args) =>
      toJson(await getCalendarEventDetail(args.id as number)),
  },
  {
    name: "get_events_by_dates",
    description:
      "兼容旧工具名：根据日期数组获取日历事件。底层使用统一的 query_calendar_events 结果结构。",
    parameters: {
      type: "object",
      properties: {
        dates: {
          type: "array",
          items: dateStringSchema,
        },
        calendarIds: {
          type: "array",
          items: { type: "number" },
        },
        maxLength: {
          type: "number",
        },
      },
      required: ["dates"],
      additionalProperties: false,
    },
    executor: async (args) =>
      toJson(
        await queryCalendarEvents({
          dates: args.dates as string[],
          calendarIds: args.calendarIds as number[] | undefined,
          includeDetail: true,
          maxLength: args.maxLength as number | undefined,
        }),
      ),
  },
  {
    name: "get_events_by_date_range",
    description:
      "兼容旧工具名：根据日期范围获取日历事件。底层使用统一的 query_calendar_events 结果结构。",
    parameters: {
      type: "object",
      properties: {
        startDate: dateStringSchema,
        endDate: dateStringSchema,
        calendarIds: {
          type: "array",
          items: { type: "number" },
        },
        maxLength: {
          type: "number",
        },
      },
      required: ["startDate", "endDate"],
      additionalProperties: false,
    },
    executor: async (args) =>
      toJson(
        await queryCalendarEvents({
          startDate: args.startDate as string,
          endDate: args.endDate as string,
          calendarIds: args.calendarIds as number[] | undefined,
          includeDetail: true,
          maxLength: args.maxLength as number | undefined,
        }),
      ),
  },
];
