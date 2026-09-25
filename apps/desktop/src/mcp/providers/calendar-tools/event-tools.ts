import {
  createCalendarEvent,
  deleteCalendarEvent,
  getAllCalendars,
  getCalendarEventById,
  updateCalendarEvent,
} from "@/commands";
import type { ProjectColorName } from "@/constants/project-colors";
import type { ToolDefinition } from "@/types";
import { CALENDAR_MUTATION_ACTIONS } from "@/mcp/calendar/mutation";
import {
  buildCalendarMessage,
  ensureEditableCalendar,
  parseDateStringToTimestamp,
  parseTimeStringToMinutes,
  persistMarkdownContent,
  timeStringSchema,
  toFailureResult,
  toMutationResult,
} from "./shared";

const ensureEventEditable = async (calendarId: number) => {
  const calendars = await getAllCalendars();
  const calendar = calendars.find(item => item.id === calendarId);
  const errorCode = ensureEditableCalendar(calendar);
  return {
    calendar,
    errorCode: errorCode
      ? errorCode === "CALENDAR_NOT_FOUND"
        ? "EVENT_NOT_FOUND"
        : "SYSTEM_EVENT_READONLY"
      : null,
  };
};

export const buildCalendarEventTools = (): ToolDefinition[] => [
  {
    name: "create_calendar_event",
    description: "创建日历事件。支持全天事件、时间段事件、颜色和 Markdown 详情。",
    parameters: {
      type: "object",
      properties: {
        calendarId: { type: "number" },
        title: { type: "string" },
        startDate: { type: "string", description: "开始日期，格式 YYYY-MM-DD" },
        endDate: { type: "string", description: "结束日期，格式 YYYY-MM-DD" },
        startTime: timeStringSchema,
        endTime: timeStringSchema,
        allDay: { type: "boolean" },
        color: { type: "string" },
        markdown: { type: "string" },
      },
      required: ["calendarId", "title", "startDate"],
      additionalProperties: false,
    },
    executor: async args => {
      const { calendar, errorCode } = await ensureEventEditable(args.calendarId as number);
      if (errorCode) {
        return toFailureResult({
          entityType: "calendar-event",
          action: CALENDAR_MUTATION_ACTIONS.CREATE_EVENT,
          message: buildCalendarMessage(errorCode),
          data: { calendarId: args.calendarId },
        });
      }

      const startDate = parseDateStringToTimestamp(args.startDate as string);
      const endDate = parseDateStringToTimestamp(
        (args.endDate as string | undefined) ?? (args.startDate as string)
      );
      if (startDate == null || endDate == null) {
        return toFailureResult({
          entityType: "calendar-event",
          action: CALENDAR_MUTATION_ACTIONS.CREATE_EVENT,
          message: "日期格式无效，请使用 YYYY-MM-DD。",
        });
      }

      const allDay = (args.allDay as boolean | undefined) ?? false;
      const startTime = allDay
        ? null
        : parseTimeStringToMinutes(args.startTime as string | undefined);
      const endTime = allDay ? null : parseTimeStringToMinutes(args.endTime as string | undefined);
      if (!allDay && args.startTime && startTime == null) {
        return toFailureResult({
          entityType: "calendar-event",
          action: CALENDAR_MUTATION_ACTIONS.CREATE_EVENT,
          message: "开始时间格式无效，请使用 HH:mm。",
        });
      }
      if (!allDay && args.endTime && endTime == null) {
        return toFailureResult({
          entityType: "calendar-event",
          action: CALENDAR_MUTATION_ACTIONS.CREATE_EVENT,
          message: "结束时间格式无效，请使用 HH:mm。",
        });
      }

      const detailContentId = await persistMarkdownContent(args.markdown as string | undefined);
      const event = await createCalendarEvent({
        calendarId: args.calendarId as number,
        title: args.title as string,
        detailContentId,
        startDate,
        endDate,
        startTime,
        endTime,
        color: (args.color as ProjectColorName | null | undefined) ?? null,
        allDay,
      });
      return toMutationResult({
        source: "calendar-mcp",
        entityType: "calendar-event",
        entityId: event.id,
        groupId: calendar?.groupId ?? null,
        calendarId: event.calendarId,
        action: CALENDAR_MUTATION_ACTIONS.CREATE_EVENT,
        changedFields: [
          "title",
          "detailContentId",
          "startDate",
          "endDate",
          "startTime",
          "endTime",
          "color",
          "allDay",
        ],
        data: {
          id: event.id,
          title: event.title,
          calendarId: event.calendarId,
          calendarTitle: calendar?.title,
        },
        message: "已创建日历事件。",
      });
    },
  },
  {
    name: "update_calendar_event",
    description: "更新日历事件。支持修改标题、时间、所属日历、颜色和 Markdown 详情。",
    parameters: {
      type: "object",
      properties: {
        id: { type: "number" },
        calendarId: { type: "number" },
        title: { type: "string" },
        startDate: { type: "string", description: "开始日期，格式 YYYY-MM-DD" },
        endDate: { type: "string", description: "结束日期，格式 YYYY-MM-DD" },
        startTime: timeStringSchema,
        endTime: timeStringSchema,
        allDay: { type: "boolean" },
        color: { type: "string" },
        markdown: { type: "string" },
      },
      required: ["id"],
      additionalProperties: false,
    },
    executor: async args => {
      const current = await getCalendarEventById(args.id as number);
      const nextCalendarId = (args.calendarId as number | undefined) ?? current.calendarId;
      const { calendar, errorCode } = await ensureEventEditable(nextCalendarId);
      if (errorCode) {
        return toFailureResult({
          entityType: "calendar-event",
          action: CALENDAR_MUTATION_ACTIONS.UPDATE_EVENT,
          message: buildCalendarMessage(errorCode),
          data: {
            id: current.id,
            title: current.title,
            calendarId: current.calendarId,
          },
        });
      }

      const startDate =
        parseDateStringToTimestamp(args.startDate as string | undefined) ?? current.startDate;
      const parsedEndDate = parseDateStringToTimestamp(args.endDate as string | undefined);
      const endDate = parsedEndDate ?? current.endDate;
      const allDay = (args.allDay as boolean | undefined) ?? current.allDay;
      const startTime = allDay
        ? null
        : args.startTime !== undefined
          ? parseTimeStringToMinutes(args.startTime as string | undefined)
          : current.startTime;
      const endTime = allDay
        ? null
        : args.endTime !== undefined
          ? parseTimeStringToMinutes(args.endTime as string | undefined)
          : current.endTime;
      if (!allDay && args.startTime !== undefined && startTime == null) {
        return toFailureResult({
          entityType: "calendar-event",
          action: CALENDAR_MUTATION_ACTIONS.UPDATE_EVENT,
          message: "开始时间格式无效，请使用 HH:mm。",
        });
      }
      if (!allDay && args.endTime !== undefined && endTime == null) {
        return toFailureResult({
          entityType: "calendar-event",
          action: CALENDAR_MUTATION_ACTIONS.UPDATE_EVENT,
          message: "结束时间格式无效，请使用 HH:mm。",
        });
      }

      const detailContentId = await persistMarkdownContent(
        args.markdown as string | undefined,
        current.detailContentId
      );
      const event = await updateCalendarEvent({
        ...current,
        calendarId: nextCalendarId,
        title: (args.title as string | undefined) ?? current.title,
        detailContentId,
        startDate,
        endDate,
        startTime,
        endTime,
        color: (args.color as ProjectColorName | null | undefined) ?? current.color,
        allDay,
      });
      return toMutationResult({
        source: "calendar-mcp",
        entityType: "calendar-event",
        entityId: event.id,
        groupId: calendar?.groupId ?? null,
        previousGroupId: (await ensureEventEditable(current.calendarId)).calendar?.groupId ?? null,
        calendarId: event.calendarId,
        previousCalendarId: current.calendarId,
        action: CALENDAR_MUTATION_ACTIONS.UPDATE_EVENT,
        changedFields: [
          "calendarId",
          "title",
          "detailContentId",
          "startDate",
          "endDate",
          "startTime",
          "endTime",
          "color",
          "allDay",
        ],
        data: {
          id: event.id,
          title: event.title,
          calendarId: event.calendarId,
          calendarTitle: calendar?.title,
        },
        message: "已更新日历事件。",
      });
    },
  },
  {
    name: "delete_calendar_event",
    description: "删除日历事件。系统日历中的事件默认只读。",
    parameters: {
      type: "object",
      properties: {
        id: { type: "number" },
      },
      required: ["id"],
      additionalProperties: false,
    },
    executor: async args => {
      const current = await getCalendarEventById(args.id as number);
      const { calendar, errorCode } = await ensureEventEditable(current.calendarId);
      if (errorCode) {
        return toFailureResult({
          entityType: "calendar-event",
          action: CALENDAR_MUTATION_ACTIONS.DELETE_EVENT,
          message: buildCalendarMessage(errorCode),
          data: {
            id: current.id,
            title: current.title,
            calendarId: current.calendarId,
          },
        });
      }

      await deleteCalendarEvent(current.id);
      return toMutationResult({
        source: "calendar-mcp",
        entityType: "calendar-event",
        entityId: current.id,
        groupId: calendar?.groupId ?? null,
        calendarId: current.calendarId,
        action: CALENDAR_MUTATION_ACTIONS.DELETE_EVENT,
        data: {
          id: current.id,
          title: current.title,
          calendarId: current.calendarId,
          calendarTitle: calendar?.title,
        },
        message: "已删除日历事件。",
      });
    },
  },
];
