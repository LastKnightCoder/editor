import type { ToolDefinition } from "@/types";
import {
  archiveTodoGroup,
  createTodoGroup,
  reorderTodoGroups,
  updateTodoGroup,
} from "@/commands/todo";
import type { UpdateTodoGroup } from "@/types";
import { nullableStringSchema, toMutationResult } from "./shared";

export const buildTodoGroupTools = (): ToolDefinition[] => [
  {
    name: "create_todo_group",
    description:
      "创建任务分组。适用于用户明确要求新建一个组来组织任务，例如“新建一个工作组”或“创建一个旅行清单分组”。",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "分组标题" },
        color: { type: "string", description: "可选颜色值" },
      },
      required: ["title"],
      additionalProperties: false,
    },
    executor: async (args) => {
      const group = await createTodoGroup({
        title: String(args.title ?? "").trim(),
        color: (args.color as string | undefined)?.trim(),
      });
      return toMutationResult({
        source: "todo-mcp",
        entityType: "group",
        entityId: group.id,
        groupId: group.id,
        action: "create-group",
        changedFields: ["title", "color"],
        data: group,
      });
    },
  },
  {
    name: "update_todo_group",
    description:
      "更新任务分组信息。可修改分组标题、颜色、排序索引或归档状态，适合重命名分组、调整显示顺序或修改视觉标识。",
    parameters: {
      type: "object",
      properties: {
        id: { type: "number" },
        title: { type: "string" },
        color: nullableStringSchema,
        sortIndex: { type: "number" },
        isArchived: { type: "boolean" },
      },
      required: ["id"],
      additionalProperties: false,
    },
    executor: async (args) => {
      const group = await updateTodoGroup(args as unknown as UpdateTodoGroup);
      return toMutationResult({
        source: "todo-mcp",
        entityType: "group",
        entityId: group.id,
        groupId: group.id,
        action: "update-group",
        changedFields: ["title", "color", "sortIndex", "isArchived"],
        data: group,
      });
    },
  },
  {
    name: "archive_todo_group",
    description:
      "归档或取消归档任务分组。归档后该分组通常不再出现在常规列表中，适合处理临时项目结束后的分组整理。",
    parameters: {
      type: "object",
      properties: {
        id: { type: "number" },
        isArchived: { type: "boolean" },
      },
      required: ["id", "isArchived"],
      additionalProperties: false,
    },
    executor: async (args) => {
      const id = args.id as number;
      const isArchived = args.isArchived as boolean;
      await archiveTodoGroup(id, isArchived);
      return toMutationResult({
        source: "todo-mcp",
        entityType: "group",
        entityId: id,
        groupId: id,
        action: isArchived ? "archive-group" : "unarchive-group",
        changedFields: ["isArchived"],
      });
    },
  },
  {
    name: "reorder_todo_groups",
    description:
      "按给定顺序重排任务分组。适用于用户明确要求把某个分组前置、后移，或整体调整分组排列顺序。",
    parameters: {
      type: "object",
      properties: {
        orderedIds: { type: "array", items: { type: "number" } },
      },
      required: ["orderedIds"],
      additionalProperties: false,
    },
    executor: async (args) => {
      const orderedIds = args.orderedIds as number[];
      await reorderTodoGroups(orderedIds);
      return toMutationResult({
        source: "todo-mcp",
        entityType: "group",
        action: "reorder-groups",
        changedFields: ["sortIndex"],
        data: { orderedIds },
      });
    },
  },
];
