import type { ToolDefinition } from "@/types";
import {
  completeRecurrence,
  createRecurrence,
  getRecurrence,
  deleteRecurrenceByItemId,
  getRecurrenceByItemId,
  skipRecurrence,
  uncompleteRecurrence,
  updateRecurrence,
} from "@/commands/todo";
import type {
  CreateTodoRecurrence,
  TodoQueryItem,
  UpdateTodoRecurrence,
} from "@/types";
import { executeTodoQuery } from "@/mcp/todo/query";
import {
  recurrenceObjectSchema,
  toJson,
  toMutationResult,
  nullableNumberSchema,
} from "./shared";

const getTodoGroupId = async (todoItemId: number) => {
  const detail = await executeTodoQuery({
    filter: { todoIds: [todoItemId] },
    groupBy: "none",
    page: 1,
    pageSize: 1,
  });
  return detail.items[0]?.groupId ?? null;
};

const getTodoContext = async (
  todoItemId: number,
): Promise<TodoQueryItem | null> => {
  const detail = await executeTodoQuery({
    filter: { todoIds: [todoItemId] },
    groupBy: "none",
    page: 1,
    pageSize: 1,
  });
  return detail.items[0] ?? null;
};

const buildTodoDisplayData = (
  context: TodoQueryItem | null,
  todoItemId?: number | null,
) => ({
  id: todoItemId ?? context?.id,
  title: context?.title,
  groupTitle: context?.group?.title,
});

const resolveTodoContextFromArgs = async (
  recurrenceId: number,
  todoItemId?: number | null,
) => {
  const resolvedTodoItemId =
    todoItemId ?? (await getRecurrence(recurrenceId))?.todoItemId ?? null;

  return {
    todoItemId: resolvedTodoItemId,
    groupId: resolvedTodoItemId
      ? await getTodoGroupId(resolvedTodoItemId)
      : null,
  };
};

export const buildTodoRecurrenceTools = (): ToolDefinition[] => [
  {
    name: "get_todo_recurrence",
    description:
      "获取任务的周期规则与打卡情况。返回该任务的重复规则以及相关完成记录，适用于回答“这条周期任务是怎么重复的”“最近打卡情况如何”。",
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
      const recurrence = await getRecurrenceByItemId(todoItemId);
      return toJson({ success: true, todoItemId, recurrence });
    },
  },
  {
    name: "upsert_todo_recurrence",
    description:
      "为任务创建或更新周期规则。适用于把普通任务改成周期任务，或修改已有的每日、每周、每月等重复设置。",
    parameters: {
      type: "object",
      properties: {
        todoItemId: { type: "number" },
        recurrence: recurrenceObjectSchema,
      },
      required: ["todoItemId", "recurrence"],
      additionalProperties: false,
    },
    executor: async (args) => {
      const todoItemId = args.todoItemId as number;
      const recurrencePayload = args.recurrence as CreateTodoRecurrence;
      const current = await getRecurrenceByItemId(todoItemId);
      const todoContext = await getTodoContext(todoItemId);
      const data = current
        ? await updateRecurrence({
            ...(recurrencePayload as unknown as UpdateTodoRecurrence),
            id: current.id,
          })
        : await createRecurrence({
            ...recurrencePayload,
            todoItemId,
          });
      return toMutationResult({
        source: "todo-mcp",
        entityType: "recurrence",
        entityId: data.id,
        groupId: await getTodoGroupId(todoItemId),
        relatedItemId: todoItemId,
        action: current ? "update-recurrence" : "create-recurrence",
        changedFields: [
          "type",
          "interval",
          "weekdays",
          "monthDay",
          "yearMonth",
          "yearDay",
          "excludeHolidays",
          "startDate",
          "endDate",
          "maxOccurrences",
        ],
        data: {
          ...buildTodoDisplayData(todoContext, todoItemId),
          recurrenceId: data.id,
        },
      });
    },
  },
  {
    name: "delete_todo_recurrence",
    description:
      "删除任务的周期规则。删除后该任务不再按周期重复，适用于用户明确要求取消重复。",
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
      const todoContext = await getTodoContext(todoItemId);
      await deleteRecurrenceByItemId(todoItemId);
      return toMutationResult({
        source: "todo-mcp",
        entityType: "recurrence",
        groupId: await getTodoGroupId(todoItemId),
        relatedItemId: todoItemId,
        action: "delete-recurrence",
        data: buildTodoDisplayData(todoContext, todoItemId),
      });
    },
  },
  {
    name: "complete_todo_occurrence",
    description:
      "将周期任务在指定日期标记为已完成。适用于补打卡、按天完成或指定某个周期实例已经做完的场景。",
    parameters: {
      type: "object",
      properties: {
        recurrenceId: { type: "number" },
        scheduledDate: { type: "number" },
        todoItemId: nullableNumberSchema,
      },
      required: ["recurrenceId", "scheduledDate"],
      additionalProperties: false,
    },
    executor: async (args) => {
      const context = await resolveTodoContextFromArgs(
        args.recurrenceId as number,
        (args.todoItemId as number | null | undefined) ?? null,
      );
      const todoContext = context.todoItemId
        ? await getTodoContext(context.todoItemId)
        : null;
      const data = await completeRecurrence(
        args.recurrenceId as number,
        args.scheduledDate as number,
      );
      return toMutationResult({
        source: "todo-mcp",
        entityType: "recurrence",
        entityId: args.recurrenceId as number,
        groupId: context.groupId,
        relatedItemId: context.todoItemId,
        action: "complete-occurrence",
        changedFields: ["completedAt"],
        data: {
          ...buildTodoDisplayData(todoContext, context.todoItemId),
          completionId: data.id,
        },
      });
    },
  },
  {
    name: "uncomplete_todo_occurrence",
    description:
      "撤销周期任务在指定日期的完成记录。适用于用户误点完成后恢复未完成状态。",
    parameters: {
      type: "object",
      properties: {
        recurrenceId: { type: "number" },
        scheduledDate: { type: "number" },
        todoItemId: nullableNumberSchema,
      },
      required: ["recurrenceId", "scheduledDate"],
      additionalProperties: false,
    },
    executor: async (args) => {
      const context = await resolveTodoContextFromArgs(
        args.recurrenceId as number,
        (args.todoItemId as number | null | undefined) ?? null,
      );
      const todoContext = context.todoItemId
        ? await getTodoContext(context.todoItemId)
        : null;
      await uncompleteRecurrence(
        args.recurrenceId as number,
        args.scheduledDate as number,
      );
      return toMutationResult({
        source: "todo-mcp",
        entityType: "recurrence",
        entityId: args.recurrenceId as number,
        groupId: context.groupId,
        relatedItemId: context.todoItemId,
        action: "uncomplete-occurrence",
        changedFields: ["completedAt"],
        data: buildTodoDisplayData(todoContext, context.todoItemId),
      });
    },
  },
  {
    name: "skip_todo_occurrence",
    description:
      "将周期任务在指定日期标记为跳过。适用于当天不执行但希望保留跳过记录的场景。",
    parameters: {
      type: "object",
      properties: {
        recurrenceId: { type: "number" },
        scheduledDate: { type: "number" },
        todoItemId: nullableNumberSchema,
      },
      required: ["recurrenceId", "scheduledDate"],
      additionalProperties: false,
    },
    executor: async (args) => {
      const context = await resolveTodoContextFromArgs(
        args.recurrenceId as number,
        (args.todoItemId as number | null | undefined) ?? null,
      );
      const todoContext = context.todoItemId
        ? await getTodoContext(context.todoItemId)
        : null;
      const data = await skipRecurrence(
        args.recurrenceId as number,
        args.scheduledDate as number,
      );
      return toMutationResult({
        source: "todo-mcp",
        entityType: "recurrence",
        entityId: args.recurrenceId as number,
        groupId: context.groupId,
        relatedItemId: context.todoItemId,
        action: "skip-occurrence",
        changedFields: ["skipped"],
        data: {
          ...buildTodoDisplayData(todoContext, context.todoItemId),
          completionId: data.id,
        },
      });
    },
  },
];
