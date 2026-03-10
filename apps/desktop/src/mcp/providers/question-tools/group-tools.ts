import type { ToolDefinition } from "@/types";
import {
  createQuestionGroup,
  deleteQuestionGroup,
  reorderQuestionGroups,
  updateQuestionGroup,
} from "@/commands/question-group";
import { QUESTION_MUTATION_ACTIONS } from "@/mcp/question/mutation";
import {
  nullableStringSchema,
  toFailureResult,
  toMutationResult,
} from "./shared";

export const buildQuestionGroupTools = (): ToolDefinition[] => [
  {
    name: "create_question_group",
    description:
      "创建问题分组。适用于用户明确要求新建一个分组来归类问题，例如“新建一个面试题分组”。",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        color: { type: "string" },
      },
      required: ["title"],
      additionalProperties: false,
    },
    executor: async (args) => {
      const group = await createQuestionGroup(
        {
          title: String(args.title ?? "").trim(),
          color: (args.color as string | undefined)?.trim(),
        },
        { suppressMutationEvent: true },
      );
      if (!group) {
        return toFailureResult({
          entityType: "question-group",
          action: QUESTION_MUTATION_ACTIONS.CREATE_GROUP,
          message: "创建问题分组失败。",
        });
      }
      return toMutationResult({
        source: "question-mcp",
        entityType: "question-group",
        entityId: group.id,
        groupId: group.id,
        action: QUESTION_MUTATION_ACTIONS.CREATE_GROUP,
        changedFields: ["title", "color"],
        data: group,
      });
    },
  },
  {
    name: "update_question_group",
    description:
      "更新问题分组信息。可修改分组标题、颜色和排序索引，适合重命名分组或调整视觉标识。",
    parameters: {
      type: "object",
      properties: {
        id: { type: "number" },
        title: { type: "string" },
        color: nullableStringSchema,
        sortIndex: { type: "number" },
      },
      required: ["id"],
      additionalProperties: false,
    },
    executor: async (args) => {
      try {
        const group = await updateQuestionGroup(
          {
            id: args.id as number,
            title: args.title as string | undefined,
            color: args.color as string | undefined,
            sortIndex: args.sortIndex as number | undefined,
          },
          { suppressMutationEvent: true },
        );
        return toMutationResult({
          source: "question-mcp",
          entityType: "question-group",
          entityId: group.id,
          groupId: group.id,
          action: QUESTION_MUTATION_ACTIONS.UPDATE_GROUP,
          changedFields: ["title", "color", "sortIndex"],
          data: group,
        });
      } catch (error) {
        return toFailureResult({
          entityType: "question-group",
          action: QUESTION_MUTATION_ACTIONS.UPDATE_GROUP,
          message: (error as Error).message,
        });
      }
    },
  },
  {
    name: "delete_question_group",
    description:
      "删除问题分组。默认分组不可删除；删除普通分组时，其下问题会迁移到默认分组。",
    parameters: {
      type: "object",
      properties: {
        id: { type: "number" },
      },
      required: ["id"],
      additionalProperties: false,
    },
    executor: async (args) => {
      try {
        const id = args.id as number;
        await deleteQuestionGroup(id, { suppressMutationEvent: true });
        return toMutationResult({
          source: "question-mcp",
          entityType: "question-group",
          entityId: id,
          groupId: id,
          action: QUESTION_MUTATION_ACTIONS.DELETE_GROUP,
          data: { id },
        });
      } catch (error) {
        return toFailureResult({
          entityType: "question-group",
          action: QUESTION_MUTATION_ACTIONS.DELETE_GROUP,
          message: (error as Error).message,
        });
      }
    },
  },
  {
    name: "reorder_question_groups",
    description:
      "按给定顺序重排问题分组。适用于用户明确要求调整分组的展示顺序。",
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
      await reorderQuestionGroups(orderedIds, { suppressMutationEvent: true });
      return toMutationResult({
        source: "question-mcp",
        entityType: "question-group",
        action: QUESTION_MUTATION_ACTIONS.REORDER_GROUPS,
        changedFields: ["sortIndex"],
        data: { orderedIds },
      });
    },
  },
];
