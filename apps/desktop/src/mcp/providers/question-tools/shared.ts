import type { ToolJsonSchema, ToolParameterSchema } from "@/types";
import type { QuestionMutationAction, QuestionMutationEntityType } from "@/mcp/question/mutation";
import { emitQuestionMutation } from "@/mcp/question/mutation";

export const toJson = (payload: unknown, metadata?: Record<string, unknown>) => ({
  content: JSON.stringify(payload, null, 2),
  metadata,
});

export const buildRendererMetadata = (rendererKey: string, payload?: Record<string, unknown>) => ({
  render: {
    rendererKey,
    version: 1,
    payload: payload ?? null,
  },
});

export const nullableStringSchema: ToolParameterSchema = {
  type: "string",
  nullable: true,
};

export const questionQuerySchema: ToolJsonSchema = {
  type: "object",
  properties: {
    filter: {
      type: "object",
      properties: {
        questionIds: { type: "array", items: { type: "number" } },
        groupIds: { type: "array", items: { type: "number" } },
        groupTitles: {
          type: "array",
          items: { type: "string" },
          description: "按问题分组名称精确筛选。用户明确提到分组名时优先使用该字段。",
        },
        statuses: {
          type: "array",
          items: {
            type: "string",
            enum: ["not_started", "in_progress", "resolved"],
          },
        },
        hasAnswers: { type: "boolean" },
        keyword: {
          type: "string",
          description: "模糊搜索问题标题、描述和分组名称。",
        },
      },
      required: [],
      additionalProperties: false,
    },
    sort: {
      type: "string",
      enum: ["manual", "createTimeDesc", "updateTimeDesc", "resolvedTimeDesc"],
    },
    page: { type: "number" },
    pageSize: { type: "number" },
  },
  required: [],
  additionalProperties: false,
};

export const toQueryResult = (payload: unknown, renderPayload?: Record<string, unknown>) =>
  toJson(payload, buildRendererMetadata("question-query", renderPayload));

export const toFailureResult = (params: {
  entityType?: QuestionMutationEntityType;
  action?: string;
  message: string;
  data?: unknown;
}) =>
  toJson(
    {
      kind: "question-mutation-result",
      success: false,
      entityType: params.entityType,
      action: params.action,
      message: params.message,
      data: params.data ?? null,
    },
    buildRendererMetadata("question-mutation", {
      entityType: params.entityType,
      action: params.action,
      success: false,
    })
  );

export const toMutationResult = <T>(params: {
  source: string;
  entityType: QuestionMutationEntityType;
  entityId?: number;
  questionId?: number;
  groupId?: number | null;
  previousGroupId?: number | null;
  action: QuestionMutationAction;
  changedFields?: string[];
  data?: T;
  message?: string;
}) => {
  const event = emitQuestionMutation({
    source: params.source,
    entityType: params.entityType,
    entityId: params.entityId,
    questionId: params.questionId,
    groupId: params.groupId,
    previousGroupId: params.previousGroupId,
    action: params.action,
    changedFields: params.changedFields,
  });

  return toJson(
    {
      kind: "question-mutation-result",
      success: true,
      entityType: params.entityType,
      action: params.action,
      event,
      data: params.data ?? null,
      message: params.message ?? "",
    },
    buildRendererMetadata("question-mutation", {
      entityType: params.entityType,
      action: params.action,
      success: true,
    })
  );
};
