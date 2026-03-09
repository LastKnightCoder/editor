import dayjs from "dayjs";
import type { Descendant } from "slate";
import { createContent, updateContent } from "@/commands/content";
import type {
  Calendar,
  CalendarGroup,
  CalendarMutationEntityType,
  ToolJsonSchema,
  ToolParameterSchema,
} from "@/types";
import { getContentLength } from "@/utils/helper";
import { markdownToContent } from "@/services/content-editing/persist";
import {
  emitCalendarMutation,
  type CalendarMutationAction,
} from "@/mcp/calendar/mutation";

export const toJson = (payload: unknown) => ({
  content: JSON.stringify(payload, null, 2),
});

export const nullableNumberSchema: ToolParameterSchema = {
  type: "number",
  nullable: true,
};

export const nullableStringSchema: ToolParameterSchema = {
  type: "string",
  nullable: true,
};

export const dateStringSchema: ToolParameterSchema = {
  type: "string",
  description: "日期字符串，格式 YYYY-MM-DD",
};

export const timeStringSchema: ToolParameterSchema = {
  type: "string",
  description: "时间字符串，格式 HH:mm",
};

export const toFailureResult = (params: {
  entityType?: CalendarMutationEntityType;
  action?: string;
  message: string;
  data?: unknown;
}) =>
  toJson({
    kind: "calendar-mutation-result",
    success: false,
    entityType: params.entityType,
    action: params.action,
    message: params.message,
    data: params.data ?? null,
  });

export const toMutationResult = <T>(params: {
  source: string;
  entityType: CalendarMutationEntityType;
  entityId?: number;
  groupId?: number | null;
  previousGroupId?: number | null;
  calendarId?: number | null;
  previousCalendarId?: number | null;
  action: CalendarMutationAction;
  changedFields?: string[];
  data?: T;
  message?: string;
}) => {
  const event = emitCalendarMutation({
    source: params.source,
    entityType: params.entityType,
    entityId: params.entityId,
    groupId: params.groupId,
    previousGroupId: params.previousGroupId,
    calendarId: params.calendarId,
    previousCalendarId: params.previousCalendarId,
    action: params.action,
    changedFields: params.changedFields,
  });

  return toJson({
    kind: "calendar-mutation-result",
    success: true,
    entityType: params.entityType,
    action: params.action,
    event,
    data: params.data ?? null,
    message: params.message ?? "",
  });
};

export const persistMarkdownContent = async (
  markdown: string | null | undefined,
  existingContentId = 0,
) => {
  if (markdown === undefined) {
    return existingContentId;
  }

  const content = markdownToContent(markdown ?? "");
  const count = getContentLength(content as Descendant[]);

  if (existingContentId) {
    await updateContent(existingContentId, content);
    return existingContentId;
  }

  if (count === 0) {
    return 0;
  }

  return (await createContent(content, count)) ?? 0;
};

export const ensureEditableCalendar = (
  calendar: Calendar | null | undefined,
) => {
  if (!calendar) {
    return "CALENDAR_NOT_FOUND";
  }

  if (calendar.isInSystemGroup) {
    return "SYSTEM_CALENDAR_READONLY";
  }

  return null;
};

export const ensureEditableGroup = (
  group: CalendarGroup | null | undefined,
) => {
  if (!group) {
    return "GROUP_NOT_FOUND";
  }

  if (group.isSystem) {
    return "SYSTEM_GROUP_READONLY";
  }

  return null;
};

export const buildCalendarMessage = (code: string) => {
  switch (code) {
    case "CALENDAR_NOT_FOUND":
      return "未找到对应日历。";
    case "GROUP_NOT_FOUND":
      return "未找到对应日历分组。";
    case "EVENT_NOT_FOUND":
      return "未找到对应日历事件。";
    case "SYSTEM_CALENDAR_READONLY":
      return "系统日历默认只读，不支持通过聊天修改。";
    case "SYSTEM_GROUP_READONLY":
      return "系统日历分组默认只读，不支持通过聊天修改。";
    case "SYSTEM_EVENT_READONLY":
      return "系统日历中的事件默认只读，不支持通过聊天修改。";
    default:
      return code;
  }
};

export const parseDateStringToTimestamp = (
  value: string | null | undefined,
  boundary: "start" | "end" = "start",
) => {
  if (!value) {
    return null;
  }

  const date =
    boundary === "end"
      ? dayjs(value).endOf("day")
      : dayjs(value).startOf("day");
  return date.isValid() ? date.valueOf() : null;
};

export const parseTimeStringToMinutes = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  const match = /^(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours > 23 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
};

export const calendarQuerySchema: ToolJsonSchema = {
  type: "object",
  properties: {
    ids: { type: "array", items: { type: "number" } },
    titles: { type: "array", items: { type: "string" } },
    groupIds: { type: "array", items: { type: "number" } },
    groupNames: { type: "array", items: { type: "string" } },
    visible: { type: "boolean" },
    archived: { type: "boolean" },
    pinned: { type: "boolean" },
    includeSystem: { type: "boolean" },
    includeDescription: { type: "boolean" },
    page: { type: "number" },
    pageSize: { type: "number" },
  },
  required: [],
  additionalProperties: false,
};
