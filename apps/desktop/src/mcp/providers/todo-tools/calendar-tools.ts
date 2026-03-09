import type { ToolDefinition } from "@/types";
import {
  createCalendarMapping,
  deleteCalendarMapping,
  deleteCalendarMappingsByTodo,
  getCalendarMappingById,
  getCalendarMappingsByTodo,
  removeTodoItemFromCalendar,
  syncTodoItemToCalendar,
} from "@/commands/todo";
import type { TodoCalendarSyncType } from "@/types";
import { executeTodoQuery } from "@/mcp/todo/query";
import { nullableNumberSchema, toJson, toMutationResult } from "./shared";

const getTodoContext = async (todoItemId: number) => {
  const detail = await executeTodoQuery({
    filter: { todoIds: [todoItemId] },
    groupBy: "none",
    page: 1,
    pageSize: 1,
  });
  return detail.items[0] ?? null;
};

export const buildTodoCalendarTools = (): ToolDefinition[] => [
  {
    name: "get_todo_calendar_mappings",
    description:
      "获取任务关联的日历映射。返回该任务与日历事件之间的映射关系，适用于回答“这条任务有没有同步到日历”。",
    parameters: {
      type: "object",
      properties: {
        todoItemId: { type: "number" },
      },
      required: ["todoItemId"],
      additionalProperties: false,
    },
    executor: async (args) => {
      const todoItemId = args.todoItemId as number;
      return toJson({
        success: true,
        todoItemId,
        mappings: await getCalendarMappingsByTodo(todoItemId),
      });
    },
  },
  {
    name: "create_todo_calendar_mapping",
    description:
      "创建任务与日历事件的映射关系。适用于用户明确要求把已有日历事件与某条任务绑定。",
    parameters: {
      type: "object",
      properties: {
        todoItemId: { type: "number" },
        calendarEventId: { type: "number" },
        syncType: {
          type: "string",
          enum: ["deadline", "planned", "recurring"],
        },
        recurrenceDate: nullableNumberSchema,
      },
      required: ["todoItemId", "calendarEventId", "syncType"],
      additionalProperties: false,
    },
    executor: async (args) => {
      const data = await createCalendarMapping(
        args.todoItemId as number,
        args.calendarEventId as number,
        args.syncType as TodoCalendarSyncType,
        (args.recurrenceDate as number | null | undefined) ?? undefined,
      );
      const todoContext = await getTodoContext(data.todoItemId);
      return toMutationResult({
        source: "todo-mcp",
        entityType: "calendar-mapping",
        entityId: data.id,
        groupId: todoContext?.groupId ?? null,
        relatedItemId: data.todoItemId,
        action: "create-calendar-mapping",
        data: {
          id: data.todoItemId,
          title: todoContext?.title,
          groupTitle: todoContext?.group?.title,
        },
      });
    },
  },
  {
    name: "delete_todo_calendar_mapping",
    description:
      "删除单条任务日历映射。仅移除这条映射关系，不会直接删除任务本身。",
    parameters: {
      type: "object",
      properties: {
        id: { type: "number" },
        todoItemId: nullableNumberSchema,
      },
      required: ["id"],
      additionalProperties: false,
    },
    executor: async (args) => {
      const mapping = await getCalendarMappingById(args.id as number);
      await deleteCalendarMapping(args.id as number);
      const todoContext =
        mapping?.todoItemId != null
          ? await getTodoContext(mapping.todoItemId)
          : null;
      return toMutationResult({
        source: "todo-mcp",
        entityType: "calendar-mapping",
        entityId: args.id as number,
        groupId: todoContext?.groupId ?? null,
        relatedItemId:
          mapping?.todoItemId ??
          (args.todoItemId as number | null | undefined) ??
          null,
        action: "delete-calendar-mapping",
        data: {
          id: mapping?.todoItemId,
          title: todoContext?.title,
          groupTitle: todoContext?.group?.title,
        },
      });
    },
  },
  {
    name: "delete_todo_calendar_mappings_by_todo",
    description:
      "删除某个任务的全部日历映射。适用于彻底取消该任务与日历的关联。",
    parameters: {
      type: "object",
      properties: {
        todoItemId: { type: "number" },
      },
      required: ["todoItemId"],
      additionalProperties: false,
    },
    executor: async (args) => {
      const todoItemId = args.todoItemId as number;
      await deleteCalendarMappingsByTodo(todoItemId);
      const todoContext = await getTodoContext(todoItemId);
      return toMutationResult({
        source: "todo-mcp",
        entityType: "calendar-mapping",
        groupId: todoContext?.groupId ?? null,
        relatedItemId: todoItemId,
        action: "delete-calendar-mappings-by-todo",
        data: {
          id: todoItemId,
          title: todoContext?.title,
          groupTitle: todoContext?.group?.title,
        },
      });
    },
  },
  {
    name: "sync_todo_item_to_calendar",
    description:
      "将任务同步到任务日历。通常用于根据任务时间信息自动创建或更新对应的日历事件。",
    parameters: {
      type: "object",
      properties: {
        todoItemId: { type: "number" },
        recurrenceDate: nullableNumberSchema,
      },
      required: ["todoItemId"],
      additionalProperties: false,
    },
    executor: async (args) => {
      const detail = await executeTodoQuery({
        filter: { todoIds: [args.todoItemId as number] },
        groupBy: "none",
        page: 1,
        pageSize: 1,
      });
      const item = detail.items[0];
      if (!item) {
        return toJson({ success: false, error: "TODO_NOT_FOUND" });
      }
      const calendarEventId = await syncTodoItemToCalendar(
        item,
        (args.recurrenceDate as number | null | undefined) ?? undefined,
      );
      return toMutationResult({
        source: "todo-mcp",
        entityType: "calendar-mapping",
        relatedItemId: item.id,
        groupId: item.groupId,
        action: "sync-item-to-calendar",
        data: {
          id: item.id,
          title: item.title,
          groupTitle: item.group?.title,
          calendarEventId,
        },
      });
    },
  },
  {
    name: "remove_todo_item_from_calendar",
    description:
      "将任务从任务日历中移除。适用于用户明确要求取消日历同步或删除对应的任务日历事件。",
    parameters: {
      type: "object",
      properties: {
        todoItemId: { type: "number" },
        recurrenceDate: nullableNumberSchema,
      },
      required: ["todoItemId"],
      additionalProperties: false,
    },
    executor: async (args) => {
      const todoItemId = args.todoItemId as number;
      await removeTodoItemFromCalendar(
        todoItemId,
        (args.recurrenceDate as number | null | undefined) ?? undefined,
      );
      const todoContext = await getTodoContext(todoItemId);
      return toMutationResult({
        source: "todo-mcp",
        entityType: "calendar-mapping",
        groupId: todoContext?.groupId ?? null,
        relatedItemId: todoItemId,
        action: "remove-item-from-calendar",
        data: {
          id: todoItemId,
          title: todoContext?.title,
          groupTitle: todoContext?.group?.title,
        },
      });
    },
  },
];
