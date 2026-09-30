import type { ToolJsonSchema, ToolParameterSchema } from "@/types";
import type { TodoMutationEntityType } from "@/types";
import type { TodoMutationAction } from "@/mcp/todo/mutation";
import { emitTodoMutation } from "@/mcp/todo/mutation";

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

export const toMutationResult = <T>(params: {
  source: string;
  entityType: TodoMutationEntityType;
  entityId?: number;
  groupId?: number | null;
  relatedItemId?: number | null;
  action: TodoMutationAction;
  changedFields?: string[];
  data?: T;
}) => {
  const event = emitTodoMutation({
    source: params.source,
    entityType: params.entityType,
    entityId: params.entityId,
    groupId: params.groupId,
    relatedItemId: params.relatedItemId,
    action: params.action,
    changedFields: params.changedFields,
  });

  return toJson({
    success: true,
    event,
    data: params.data,
  });
};

export const todoQuerySchema: ToolJsonSchema = {
  type: "object",
  properties: {
    filter: {
      type: "object",
      properties: {
        groupIds: { type: "array", items: { type: "number" } },
        groupNames: {
          type: "array",
          items: { type: "string" },
          description:
            "按分组名称精确筛选，可传多个分组名称。用户明确说出组名时优先使用此字段，而不是 keyword。",
        },
        systemGroupTypes: {
          type: "array",
          items: {
            type: "string",
            enum: ["all", "normal", "deadline", "planned", "recurring"],
          },
        },
        todoIds: { type: "array", items: { type: "number" } },
        types: {
          type: "array",
          items: {
            type: "string",
            enum: ["normal", "deadline", "planned", "recurring"],
          },
        },
        isCompleted: { type: "boolean" },
        isArchived: { type: "boolean" },
        isOverdue: { type: "boolean" },
        hasDueAt: { type: "boolean" },
        hasStartAt: { type: "boolean" },
        parentId: nullableNumberSchema,
        rootOnly: { type: "boolean" },
        includeChildren: { type: "boolean" },
        keyword: {
          type: "string",
          description:
            "模糊搜索关键词，会匹配任务标题、描述文本、分组名称和关联笔记标题。若用户明确按分组过滤，请优先使用 groupNames。",
        },
        timeField: {
          type: "string",
          enum: ["createTime", "updateTime", "dueAt", "completedAt", "startAt"],
          description:
            "时间筛选字段。用户提到“最近”时，应优先明确是按创建时间、更新时间、完成时间还是截止时间查询。",
        },
        start: {
          type: "string",
          description:
            "可选开始时间。支持 Unix 时间戳毫秒，或日期字符串如 2026-01-20、2026-01-20 18:30。",
          nullable: true,
          oneOf: [{ type: "number" }, { type: "string" }],
        },
        end: {
          type: "string",
          description:
            "可选结束时间。支持 Unix 时间戳毫秒，或日期字符串如 2026-01-20、2026-01-20 18:30。纯日期会按当天结束处理。",
          nullable: true,
          oneOf: [{ type: "number" }, { type: "string" }],
        },
      } as Record<string, ToolParameterSchema>,
      additionalProperties: false,
    },
    groupBy: {
      type: "string",
      enum: ["none", "group", "status", "type", "due_date", "completion_date"],
    },
    sort: {
      type: "string",
      enum: ["manual", "dueAtAsc", "updateTimeDesc", "createTimeDesc", "completedAtDesc"],
    },
    page: { type: "number" },
    pageSize: { type: "number" },
  } as Record<string, ToolParameterSchema>,
  required: [],
  additionalProperties: false,
};

export const recurrenceObjectSchema: ToolParameterSchema = {
  type: "object",
  properties: {
    type: {
      type: "string",
      enum: ["daily", "weekdays", "weekly", "monthly", "yearly", "custom"],
    },
    interval: { type: "number" },
    weekdays: { type: "array", items: { type: "number" } },
    monthDay: nullableNumberSchema,
    yearMonth: nullableNumberSchema,
    yearDay: nullableNumberSchema,
    excludeHolidays: { type: "boolean" },
    startDate: { type: "number" },
    endDate: nullableNumberSchema,
    maxOccurrences: nullableNumberSchema,
  } as Record<string, ToolParameterSchema>,
  required: ["type", "startDate"],
  additionalProperties: false,
};
