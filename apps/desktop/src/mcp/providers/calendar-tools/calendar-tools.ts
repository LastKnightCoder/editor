import {
  createCalendar,
  deleteCalendar,
  getAllCalendars,
  getCalendarById,
  mergeCalendars,
  updateCalendar,
} from "@/commands";
import type { ProjectColorName } from "@/constants/project-colors";
import type { ToolDefinition } from "@/types";
import { CALENDAR_MUTATION_ACTIONS } from "@/mcp/calendar/mutation";
import {
  buildCalendarMessage,
  ensureEditableCalendar,
  nullableNumberSchema,
  persistMarkdownContent,
  toFailureResult,
  toMutationResult,
} from "./shared";

export const buildCalendarTools = (): ToolDefinition[] => [
  {
    name: "create_calendar",
    description:
      "创建日历。支持指定颜色、归属分组、可见性、置顶和 Markdown 描述。",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        color: { type: "string" },
        groupId: nullableNumberSchema,
        pinned: { type: "boolean" },
        visible: { type: "boolean" },
        archived: { type: "boolean" },
        markdown: { type: "string" },
      },
      required: ["title"],
      additionalProperties: false,
    },
    executor: async (args) => {
      const descriptionContentId = await persistMarkdownContent(
        args.markdown as string | undefined,
      );
      const calendar = await createCalendar({
        title: args.title as string,
        color: (args.color as ProjectColorName | undefined) ?? "blue",
        descriptionContentId,
        archived: (args.archived as boolean | undefined) ?? false,
        pinned: (args.pinned as boolean | undefined) ?? false,
        visible: (args.visible as boolean | undefined) ?? true,
        orderIndex: 0,
        groupId: (args.groupId as number | null | undefined) ?? undefined,
      });
      return toMutationResult({
        source: "calendar-mcp",
        entityType: "calendar",
        entityId: calendar.id,
        groupId: calendar.groupId ?? null,
        calendarId: calendar.id,
        action: CALENDAR_MUTATION_ACTIONS.CREATE_CALENDAR,
        changedFields: [
          "title",
          "color",
          "descriptionContentId",
          "archived",
          "pinned",
          "visible",
          "groupId",
        ],
        data: calendar,
        message: "已创建日历。",
      });
    },
  },
  {
    name: "update_calendar",
    description:
      "更新日历基础信息。支持修改标题、颜色、置顶、归档、可见性、分组和 Markdown 描述。",
    parameters: {
      type: "object",
      properties: {
        id: { type: "number" },
        title: { type: "string" },
        color: { type: "string" },
        groupId: nullableNumberSchema,
        pinned: { type: "boolean" },
        visible: { type: "boolean" },
        archived: { type: "boolean" },
        markdown: { type: "string" },
      },
      required: ["id"],
      additionalProperties: false,
    },
    executor: async (args) => {
      const current = await getCalendarById(args.id as number);
      const errorCode = ensureEditableCalendar(current);
      if (errorCode) {
        return toFailureResult({
          entityType: "calendar",
          action: CALENDAR_MUTATION_ACTIONS.UPDATE_CALENDAR,
          message: buildCalendarMessage(errorCode),
          data: current,
        });
      }

      const descriptionContentId = await persistMarkdownContent(
        args.markdown as string | undefined,
        current.descriptionContentId,
      );
      const calendar = await updateCalendar({
        ...current,
        title: (args.title as string | undefined) ?? current.title,
        color: (args.color as ProjectColorName | undefined) ?? current.color,
        groupId:
          args.groupId === null
            ? undefined
            : ((args.groupId as number | undefined) ?? current.groupId),
        pinned: (args.pinned as boolean | undefined) ?? current.pinned,
        visible: (args.visible as boolean | undefined) ?? current.visible,
        archived: (args.archived as boolean | undefined) ?? current.archived,
        descriptionContentId,
      });
      return toMutationResult({
        source: "calendar-mcp",
        entityType: "calendar",
        entityId: calendar.id,
        groupId: calendar.groupId ?? null,
        previousGroupId: current.groupId ?? null,
        calendarId: calendar.id,
        action: CALENDAR_MUTATION_ACTIONS.UPDATE_CALENDAR,
        changedFields: [
          "title",
          "color",
          "groupId",
          "pinned",
          "visible",
          "archived",
          "descriptionContentId",
        ],
        data: calendar,
        message: "已更新日历。",
      });
    },
  },
  {
    name: "archive_calendar",
    description: "归档或取消归档日历。系统日历默认只读。",
    parameters: {
      type: "object",
      properties: {
        id: { type: "number" },
        archived: { type: "boolean" },
      },
      required: ["id", "archived"],
      additionalProperties: false,
    },
    executor: async (args) => {
      const current = await getCalendarById(args.id as number);
      const errorCode = ensureEditableCalendar(current);
      if (errorCode) {
        return toFailureResult({
          entityType: "calendar",
          action: CALENDAR_MUTATION_ACTIONS.ARCHIVE_CALENDAR,
          message: buildCalendarMessage(errorCode),
          data: current,
        });
      }

      const archived = args.archived as boolean;
      const calendar = await updateCalendar({
        ...current,
        archived,
      });
      return toMutationResult({
        source: "calendar-mcp",
        entityType: "calendar",
        entityId: calendar.id,
        groupId: calendar.groupId ?? null,
        calendarId: calendar.id,
        action: archived
          ? CALENDAR_MUTATION_ACTIONS.ARCHIVE_CALENDAR
          : CALENDAR_MUTATION_ACTIONS.UNARCHIVE_CALENDAR,
        changedFields: ["archived"],
        data: calendar,
        message: archived ? "已归档日历。" : "已取消归档日历。",
      });
    },
  },
  {
    name: "toggle_calendar_visibility",
    description:
      "设置日历是否可见。适用于聊天里直接控制某个日历在日历页中的显隐状态。",
    parameters: {
      type: "object",
      properties: {
        id: { type: "number" },
        visible: { type: "boolean" },
      },
      required: ["id", "visible"],
      additionalProperties: false,
    },
    executor: async (args) => {
      const current = await getCalendarById(args.id as number);
      const errorCode = ensureEditableCalendar(current);
      if (errorCode) {
        return toFailureResult({
          entityType: "calendar",
          action: CALENDAR_MUTATION_ACTIONS.TOGGLE_CALENDAR_VISIBILITY,
          message: buildCalendarMessage(errorCode),
          data: current,
        });
      }

      const calendar = await updateCalendar({
        ...current,
        visible: args.visible as boolean,
      });
      return toMutationResult({
        source: "calendar-mcp",
        entityType: "calendar",
        entityId: calendar.id,
        groupId: calendar.groupId ?? null,
        calendarId: calendar.id,
        action: CALENDAR_MUTATION_ACTIONS.TOGGLE_CALENDAR_VISIBILITY,
        changedFields: ["visible"],
        data: calendar,
        message: (args.visible as boolean) ? "已显示日历。" : "已隐藏日历。",
      });
    },
  },
  {
    name: "delete_calendar",
    description:
      "删除日历。系统日历默认只读，删除后其事件会随底层命令策略一并处理。",
    parameters: {
      type: "object",
      properties: {
        id: { type: "number" },
      },
      required: ["id"],
      additionalProperties: false,
    },
    executor: async (args) => {
      const current = await getCalendarById(args.id as number);
      const errorCode = ensureEditableCalendar(current);
      if (errorCode) {
        return toFailureResult({
          entityType: "calendar",
          action: CALENDAR_MUTATION_ACTIONS.DELETE_CALENDAR,
          message: buildCalendarMessage(errorCode),
          data: current,
        });
      }

      await deleteCalendar(current.id);
      return toMutationResult({
        source: "calendar-mcp",
        entityType: "calendar",
        entityId: current.id,
        groupId: current.groupId ?? null,
        calendarId: current.id,
        action: CALENDAR_MUTATION_ACTIONS.DELETE_CALENDAR,
        data: {
          id: current.id,
          title: current.title,
          groupId: current.groupId ?? null,
        },
        message: "已删除日历。",
      });
    },
  },
  {
    name: "merge_calendars",
    description: "合并多个日历到目标日历。仅支持普通日历，不支持系统日历。",
    parameters: {
      type: "object",
      properties: {
        sourceCalendarIds: {
          type: "array",
          items: { type: "number" },
        },
        targetCalendarId: { type: "number" },
      },
      required: ["sourceCalendarIds", "targetCalendarId"],
      additionalProperties: false,
    },
    executor: async (args) => {
      const sourceCalendarIds = (args.sourceCalendarIds as number[]) ?? [];
      const targetCalendarId = args.targetCalendarId as number;
      const calendars = await getAllCalendars();
      const target = calendars.find(
        (calendar) => calendar.id === targetCalendarId,
      );
      const targetError = ensureEditableCalendar(target);
      if (targetError) {
        return toFailureResult({
          entityType: "calendar",
          action: CALENDAR_MUTATION_ACTIONS.MERGE_CALENDARS,
          message: buildCalendarMessage(targetError),
          data: target ?? null,
        });
      }

      const readonlySource = calendars.find((calendar) => {
        if (!sourceCalendarIds.includes(calendar.id)) {
          return false;
        }
        return ensureEditableCalendar(calendar) !== null;
      });
      if (readonlySource) {
        return toFailureResult({
          entityType: "calendar",
          action: CALENDAR_MUTATION_ACTIONS.MERGE_CALENDARS,
          message: buildCalendarMessage("SYSTEM_CALENDAR_READONLY"),
          data: readonlySource,
        });
      }

      const result = await mergeCalendars(sourceCalendarIds, targetCalendarId);
      return toMutationResult({
        source: "calendar-mcp",
        entityType: "calendar",
        entityId: targetCalendarId,
        groupId: target?.groupId ?? null,
        calendarId: targetCalendarId,
        action: CALENDAR_MUTATION_ACTIONS.MERGE_CALENDARS,
        changedFields: ["calendarId"],
        data: {
          targetCalendarId,
          sourceCalendarIds,
          ...result,
        },
        message: "已合并日历。",
      });
    },
  },
];
