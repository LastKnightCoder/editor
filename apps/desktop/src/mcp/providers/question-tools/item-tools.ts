import type { Descendant } from "slate";
import type { ToolDefinition } from "@/types";
import {
  addAnswer,
  createAnswer,
  createQuestion,
  getQuestionById,
  deleteAnswer,
  deleteQuestion,
  moveQuestionToGroup,
  reorderQuestions,
  updateQuestion,
  updateQuestionStatus,
} from "@/commands/question";
import {
  getDefaultQuestionGroup,
  listQuestionGroups,
} from "@/commands/question-group";
import { QUESTION_MUTATION_ACTIONS } from "@/mcp/question/mutation";
import { importFromMarkdown } from "@/utils/markdown";
import { toFailureResult, toMutationResult } from "./shared";

const EMPTY_CONTENT: Descendant[] = [
  { type: "paragraph", children: [{ type: "formatted", text: "" }] },
];

const normalizeMarkdownContent = (markdown?: string | null) => {
  if (!markdown?.trim()) {
    return EMPTY_CONTENT;
  }
  return importFromMarkdown(markdown.trim());
};

const resolveGroupId = async (params: {
  groupId?: number;
  groupTitle?: string;
}) => {
  if (typeof params.groupId === "number") {
    return params.groupId;
  }

  if (params.groupTitle?.trim()) {
    const groups = await listQuestionGroups();
    const matched = groups.find(
      (group) =>
        group.title.trim().toLowerCase() ===
        params.groupTitle!.trim().toLowerCase(),
    );
    if (matched) {
      return matched.id;
    }
    throw new Error(`未找到分组：${params.groupTitle}`);
  }

  const defaultGroup = await getDefaultQuestionGroup();
  return defaultGroup.id;
};

export const buildQuestionItemTools = (): ToolDefinition[] => [
  {
    name: "create_question",
    description:
      "创建问题。若未指定分组，则自动放入默认分组；描述使用 Markdown 输入，内部会转换为编辑器富文本结构。",
    parameters: {
      type: "object",
      properties: {
        questionContent: { type: "string" },
        groupId: { type: "number" },
        groupTitle: { type: "string" },
        descriptionMarkdown: { type: "string" },
      },
      required: ["questionContent"],
      additionalProperties: false,
    },
    executor: async (args) => {
      try {
        const questionContent = String(args.questionContent ?? "").trim();
        if (!questionContent) {
          throw new Error("问题内容不能为空");
        }
        const groupId = await resolveGroupId({
          groupId: args.groupId as number | undefined,
          groupTitle: args.groupTitle as string | undefined,
        });
        const question = await createQuestion(
          questionContent,
          groupId,
          normalizeMarkdownContent(
            args.descriptionMarkdown as string | undefined,
          ),
          { suppressMutationEvent: true },
        );
        return toMutationResult({
          source: "question-mcp",
          entityType: "question",
          entityId: question.id,
          questionId: question.id,
          groupId: question.groupId,
          action: QUESTION_MUTATION_ACTIONS.CREATE_QUESTION,
          changedFields: ["questionContent", "description", "groupId"],
          data: question,
        });
      } catch (error) {
        return toFailureResult({
          entityType: "question",
          action: QUESTION_MUTATION_ACTIONS.CREATE_QUESTION,
          message: (error as Error).message,
        });
      }
    },
  },
  {
    name: "update_question",
    description:
      "更新问题标题或描述。描述使用 Markdown 输入，内部会转换为编辑器富文本结构。",
    parameters: {
      type: "object",
      properties: {
        id: { type: "number" },
        questionContent: { type: "string" },
        descriptionMarkdown: { type: "string" },
      },
      required: ["id"],
      additionalProperties: false,
    },
    executor: async (args) => {
      try {
        const current = await getQuestionById(args.id as number);
        if (!current) {
          throw new Error("未找到对应问题");
        }
        const nextQuestionContent =
          typeof args.questionContent === "string"
            ? args.questionContent.trim()
            : current.questionContent;
        if (!nextQuestionContent) {
          throw new Error("问题内容不能为空");
        }
        const question = await updateQuestion(
          args.id as number,
          nextQuestionContent,
          typeof args.descriptionMarkdown === "string"
            ? normalizeMarkdownContent(args.descriptionMarkdown)
            : current.description || EMPTY_CONTENT,
          { suppressMutationEvent: true },
        );
        return toMutationResult({
          source: "question-mcp",
          entityType: "question",
          entityId: question.id,
          questionId: question.id,
          groupId: question.groupId,
          action: QUESTION_MUTATION_ACTIONS.UPDATE_QUESTION,
          changedFields: ["questionContent", "description"],
          data: question,
        });
      } catch (error) {
        return toFailureResult({
          entityType: "question",
          action: QUESTION_MUTATION_ACTIONS.UPDATE_QUESTION,
          message: (error as Error).message,
        });
      }
    },
  },
  {
    name: "delete_question",
    description: "删除问题及其私有答案内容。",
    parameters: {
      type: "object",
      properties: {
        id: { type: "number" },
      },
      required: ["id"],
      additionalProperties: false,
    },
    executor: async (args) => {
      const id = args.id as number;
      await deleteQuestion(id, { suppressMutationEvent: true });
      return toMutationResult({
        source: "question-mcp",
        entityType: "question",
        entityId: id,
        questionId: id,
        action: QUESTION_MUTATION_ACTIONS.DELETE_QUESTION,
        data: { id },
      });
    },
  },
  {
    name: "reorder_questions",
    description:
      "按给定顺序重排问题。适用于用户明确要求调整同一分组内问题的展示顺序。",
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
      await reorderQuestions(orderedIds, { suppressMutationEvent: true });
      return toMutationResult({
        source: "question-mcp",
        entityType: "question",
        action: QUESTION_MUTATION_ACTIONS.REORDER_QUESTIONS,
        changedFields: ["sortIndex"],
        data: { orderedIds },
      });
    },
  },
  {
    name: "move_question_to_group",
    description:
      "将问题移动到另一个分组。可通过目标分组 ID 或分组标题指定目标。",
    parameters: {
      type: "object",
      properties: {
        id: { type: "number" },
        toGroupId: { type: "number" },
        toGroupTitle: { type: "string" },
      },
      required: ["id"],
      additionalProperties: false,
    },
    executor: async (args) => {
      try {
        const toGroupId = await resolveGroupId({
          groupId: args.toGroupId as number | undefined,
          groupTitle: args.toGroupTitle as string | undefined,
        });
        const question = await moveQuestionToGroup(
          args.id as number,
          toGroupId,
          {
            suppressMutationEvent: true,
          },
        );
        return toMutationResult({
          source: "question-mcp",
          entityType: "question",
          entityId: question.id,
          questionId: question.id,
          groupId: question.groupId,
          action: QUESTION_MUTATION_ACTIONS.MOVE_QUESTION,
          changedFields: ["groupId"],
          data: question,
        });
      } catch (error) {
        return toFailureResult({
          entityType: "question",
          action: QUESTION_MUTATION_ACTIONS.MOVE_QUESTION,
          message: (error as Error).message,
        });
      }
    },
  },
  {
    name: "update_question_status",
    description:
      "更新问题状态，仅支持 not_started、in_progress、resolved。没有答案时不能标记为 resolved。",
    parameters: {
      type: "object",
      properties: {
        id: { type: "number" },
        status: {
          type: "string",
          enum: ["not_started", "in_progress", "resolved"],
        },
      },
      required: ["id", "status"],
      additionalProperties: false,
    },
    executor: async (args) => {
      try {
        const question = await updateQuestionStatus(
          args.id as number,
          args.status as "not_started" | "in_progress" | "resolved",
          { suppressMutationEvent: true },
        );
        return toMutationResult({
          source: "question-mcp",
          entityType: "question",
          entityId: question.id,
          questionId: question.id,
          groupId: question.groupId,
          action: QUESTION_MUTATION_ACTIONS.UPDATE_QUESTION_STATUS,
          changedFields: ["status"],
          data: question,
        });
      } catch (error) {
        return toFailureResult({
          entityType: "question",
          action: QUESTION_MUTATION_ACTIONS.UPDATE_QUESTION_STATUS,
          message: (error as Error).message,
        });
      }
    },
  },
  {
    name: "create_question_answer_from_markdown",
    description:
      "为问题创建一个新的 Markdown 答案并自动关联。内部会把 Markdown 转换为编辑器富文本结构后保存。",
    parameters: {
      type: "object",
      properties: {
        questionId: { type: "number" },
        markdown: { type: "string" },
      },
      required: ["questionId", "markdown"],
      additionalProperties: false,
    },
    executor: async (args) => {
      try {
        const content = normalizeMarkdownContent(args.markdown as string);
        const answer = await createAnswer(content);
        const question = await addAnswer(
          args.questionId as number,
          {
            contentId: answer.id,
            content: answer.content,
          },
          false,
          { suppressMutationEvent: true },
        );
        return toMutationResult({
          source: "question-mcp",
          entityType: "question-answer",
          entityId: answer.id,
          questionId: question.id,
          groupId: question.groupId,
          action: QUESTION_MUTATION_ACTIONS.CREATE_ANSWER,
          changedFields: ["answers", "resolvedTime", "status"],
          data: {
            question,
            answerId: answer.id,
          },
        });
      } catch (error) {
        return toFailureResult({
          entityType: "question-answer",
          action: QUESTION_MUTATION_ACTIONS.CREATE_ANSWER,
          message: (error as Error).message,
        });
      }
    },
  },
  {
    name: "attach_question_answer",
    description:
      "将已有内容作为答案关联到问题。适用于用户明确指出 contentId 或已有卡片内容作为答案来源。",
    parameters: {
      type: "object",
      properties: {
        questionId: { type: "number" },
        contentId: { type: "number" },
      },
      required: ["questionId", "contentId"],
      additionalProperties: false,
    },
    executor: async (args) => {
      try {
        const question = await addAnswer(
          args.questionId as number,
          {
            contentId: args.contentId as number,
            content: [],
          },
          true,
          { suppressMutationEvent: true },
        );
        return toMutationResult({
          source: "question-mcp",
          entityType: "question-answer",
          entityId: args.contentId as number,
          questionId: question.id,
          groupId: question.groupId,
          action: QUESTION_MUTATION_ACTIONS.ATTACH_ANSWER,
          changedFields: ["answers", "resolvedTime", "status"],
          data: {
            question,
            answerId: args.contentId as number,
          },
        });
      } catch (error) {
        return toFailureResult({
          entityType: "question-answer",
          action: QUESTION_MUTATION_ACTIONS.ATTACH_ANSWER,
          message: (error as Error).message,
        });
      }
    },
  },
  {
    name: "detach_question_answer",
    description: "删除问题与答案的关联，并按现有语义删除该答案内容。",
    parameters: {
      type: "object",
      properties: {
        questionId: { type: "number" },
        answerId: { type: "number" },
      },
      required: ["questionId", "answerId"],
      additionalProperties: false,
    },
    executor: async (args) => {
      try {
        const question = await deleteAnswer(
          args.questionId as number,
          args.answerId as number,
          { suppressMutationEvent: true },
        );
        return toMutationResult({
          source: "question-mcp",
          entityType: "question-answer",
          entityId: args.answerId as number,
          questionId: question.id,
          groupId: question.groupId,
          action: QUESTION_MUTATION_ACTIONS.DETACH_ANSWER,
          changedFields: ["answers", "resolvedTime", "status"],
          data: {
            question,
            answerId: args.answerId as number,
          },
        });
      } catch (error) {
        return toFailureResult({
          entityType: "question-answer",
          action: QUESTION_MUTATION_ACTIONS.DETACH_ANSWER,
          message: (error as Error).message,
        });
      }
    },
  },
];
