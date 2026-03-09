import type { ToolDefinition } from "@/types";
import {
  archiveTodoItem,
  createTodoItem,
  createTodoItemRelative,
  deleteTodoItem,
  deleteTodoItemCascade,
  moveAndReorderTodoItem,
  toggleCompleteCascade,
  updateTodoItem,
} from "@/commands/todo";
import type {
  CreateTodoItem,
  CreateTodoItemRelative,
  MoveAndReorderPayload,
  TodoQueryItem,
  UpdateTodoItem,
} from "@/types";
import { TODO_MUTATION_ACTIONS } from "@/mcp/todo/mutation";
import { executeTodoQuery } from "@/mcp/todo/query";
import { nullableNumberSchema, toMutationResult } from "./shared";

const getTodoContext = async (
  todoId: number,
): Promise<TodoQueryItem | null> => {
  const detail = await executeTodoQuery({
    filter: { todoIds: [todoId] },
    groupBy: "none",
    page: 1,
    pageSize: 1,
  });
  return detail.items[0] ?? null;
};

const buildTodoDisplayData = (context: TodoQueryItem | null, id: number) => ({
  id,
  title: context?.title,
  groupTitle: context?.group?.title,
});

export const buildTodoItemTools = (): ToolDefinition[] => [
  {
    name: "create_todo",
    description:
      "创建任务。支持普通任务、截止任务、计划任务和周期任务，适用于用户直接新增一条待办，并可同时设置描述、开始时间、截止时间或提醒时间。",
    parameters: {
      type: "object",
      properties: {
        groupId: { type: "number" },
        parentId: nullableNumberSchema,
        title: { type: "string" },
        type: {
          type: "string",
          enum: ["normal", "deadline", "planned", "recurring"],
        },
        description: { type: "string" },
        startAt: nullableNumberSchema,
        dueAt: nullableNumberSchema,
        remindBefore: nullableNumberSchema,
      },
      required: ["groupId", "title"],
      additionalProperties: false,
    },
    executor: async (args) => {
      const item = await createTodoItem(args as unknown as CreateTodoItem);
      return toMutationResult({
        source: "todo-mcp",
        entityType: "item",
        entityId: item.id,
        groupId: item.groupId,
        action: "create-item",
        changedFields: [
          "title",
          "type",
          "description",
          "startAt",
          "dueAt",
          "remindBefore",
        ],
        data: item,
      });
    },
  },
  {
    name: "create_todo_relative",
    description:
      "在指定任务的上方、下方或子级创建任务。适用于用户说“在这条任务下面加一条”“给它加个子任务”这类带相对位置的新增需求。",
    parameters: {
      type: "object",
      properties: {
        refId: { type: "number" },
        position: {
          type: "string",
          enum: ["child", "above", "below"],
        },
        title: { type: "string" },
        type: {
          type: "string",
          enum: ["normal", "deadline", "planned", "recurring"],
        },
        description: { type: "string" },
        startAt: nullableNumberSchema,
        dueAt: nullableNumberSchema,
        remindBefore: nullableNumberSchema,
      },
      required: ["refId", "position", "title"],
      additionalProperties: false,
    },
    executor: async (args) => {
      const item = await createTodoItemRelative(
        args as unknown as CreateTodoItemRelative,
      );
      return toMutationResult({
        source: "todo-mcp",
        entityType: "item",
        entityId: item.id,
        groupId: item.groupId,
        action:
          args.position === "above"
            ? TODO_MUTATION_ACTIONS.CREATE_ITEM_ABOVE
            : args.position === "below"
              ? TODO_MUTATION_ACTIONS.CREATE_ITEM_BELOW
              : TODO_MUTATION_ACTIONS.CREATE_ITEM_CHILD,
        changedFields: [
          "title",
          "type",
          "description",
          "startAt",
          "dueAt",
          "remindBefore",
        ],
        data: item,
      });
    },
  },
  {
    name: "update_todo",
    description:
      "更新任务基础信息。可修改标题、类型、描述引用、开始时间、截止时间和提醒时间，适用于任务内容本身的常规编辑。",
    parameters: {
      type: "object",
      properties: {
        id: { type: "number" },
        title: { type: "string" },
        type: {
          type: "string",
          enum: ["normal", "deadline", "planned", "recurring"],
        },
        descriptionContentId: nullableNumberSchema,
        startAt: nullableNumberSchema,
        dueAt: nullableNumberSchema,
        remindBefore: nullableNumberSchema,
      },
      required: ["id"],
      additionalProperties: false,
    },
    executor: async (args) => {
      const item = await updateTodoItem(args as unknown as UpdateTodoItem);
      return toMutationResult({
        source: "todo-mcp",
        entityType: "item",
        entityId: item.id,
        groupId: item.groupId,
        action: "update-item",
        changedFields: [
          "title",
          "type",
          "descriptionContentId",
          "startAt",
          "dueAt",
          "remindBefore",
        ],
        data: item,
      });
    },
  },
  {
    name: "toggle_todo_complete",
    description:
      "切换任务完成状态。会同时作用于该任务及其子任务，适用于用户要求“标记完成”“取消完成”这类状态切换操作。",
    parameters: {
      type: "object",
      properties: {
        id: { type: "number" },
        isCompleted: { type: "boolean" },
        groupId: nullableNumberSchema,
      },
      required: ["id", "isCompleted"],
      additionalProperties: false,
    },
    executor: async (args) => {
      const todoId = args.id as number;
      await toggleCompleteCascade(todoId, args.isCompleted as boolean);
      const context = await getTodoContext(todoId);
      return toMutationResult({
        source: "todo-mcp",
        entityType: "item",
        entityId: todoId,
        groupId:
          context?.groupId ??
          (args.groupId as number | null | undefined) ??
          null,
        action: (args.isCompleted as boolean)
          ? "complete-item"
          : "uncomplete-item",
        changedFields: ["isCompleted", "completedAt"],
        data: buildTodoDisplayData(context, todoId),
      });
    },
  },
  {
    name: "move_todo",
    description:
      "移动任务。可把任务移动到指定分组、指定父任务之下，或插入到某条任务前后，适用于调整任务所属位置与层级结构。",
    parameters: {
      type: "object",
      properties: {
        id: { type: "number" },
        toGroupId: { type: "number" },
        toParentId: nullableNumberSchema,
        beforeId: { type: "number" },
        afterId: { type: "number" },
      },
      required: ["id", "toGroupId"],
      additionalProperties: false,
    },
    executor: async (args) => {
      const item = await moveAndReorderTodoItem(
        args as unknown as MoveAndReorderPayload,
      );
      return toMutationResult({
        source: "todo-mcp",
        entityType: "item",
        entityId: item.id,
        groupId: item.groupId,
        action: "move-item",
        changedFields: ["groupId", "parentId", "sortIndex"],
        data: item,
      });
    },
  },
  {
    name: "archive_todo",
    description:
      "归档或取消归档任务。适用于不想删除但希望从日常任务列表中暂时移除的事项。",
    parameters: {
      type: "object",
      properties: {
        id: { type: "number" },
        isArchived: { type: "boolean" },
        groupId: nullableNumberSchema,
      },
      required: ["id", "isArchived"],
      additionalProperties: false,
    },
    executor: async (args) => {
      const todoId = args.id as number;
      await archiveTodoItem(todoId, args.isArchived as boolean);
      const context = await getTodoContext(todoId);
      return toMutationResult({
        source: "todo-mcp",
        entityType: "item",
        entityId: todoId,
        groupId:
          context?.groupId ??
          (args.groupId as number | null | undefined) ??
          null,
        action: (args.isArchived as boolean)
          ? "archive-item"
          : "unarchive-item",
        changedFields: ["isArchived"],
        data: buildTodoDisplayData(context, todoId),
      });
    },
  },
  {
    name: "delete_todo",
    description:
      "删除单个任务，但不递归处理其子任务。仅适用于明确只删除当前任务本身、而不是整个子树的场景。",
    parameters: {
      type: "object",
      properties: {
        id: { type: "number" },
        groupId: nullableNumberSchema,
      },
      required: ["id"],
      additionalProperties: false,
    },
    executor: async (args) => {
      const todoId = args.id as number;
      const context = await getTodoContext(todoId);
      await deleteTodoItem(todoId);
      return toMutationResult({
        source: "todo-mcp",
        entityType: "item",
        entityId: todoId,
        groupId:
          context?.groupId ??
          (args.groupId as number | null | undefined) ??
          null,
        action: "delete-item",
        data: buildTodoDisplayData(context, todoId),
      });
    },
  },
  {
    name: "delete_todo_cascade",
    description:
      "递归删除任务及其所有子任务。适用于用户明确要求删除整条任务树，属于破坏性操作。",
    parameters: {
      type: "object",
      properties: {
        id: { type: "number" },
        groupId: nullableNumberSchema,
      },
      required: ["id"],
      additionalProperties: false,
    },
    executor: async (args) => {
      const todoId = args.id as number;
      const context = await getTodoContext(todoId);
      await deleteTodoItemCascade(todoId);
      return toMutationResult({
        source: "todo-mcp",
        entityType: "item",
        entityId: todoId,
        groupId:
          context?.groupId ??
          (args.groupId as number | null | undefined) ??
          null,
        action: "delete-item-cascade",
        data: buildTodoDisplayData(context, todoId),
      });
    },
  },
];
