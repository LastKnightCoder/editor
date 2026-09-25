import { emitQuestionMutationEvent } from "./events";

export type QuestionMutationEntityType = "question-group" | "question" | "question-answer";

export const QUESTION_MUTATION_ACTIONS = {
  CREATE_GROUP: "create-group",
  UPDATE_GROUP: "update-group",
  DELETE_GROUP: "delete-group",
  REORDER_GROUPS: "reorder-groups",
  CREATE_QUESTION: "create-question",
  UPDATE_QUESTION: "update-question",
  DELETE_QUESTION: "delete-question",
  REORDER_QUESTIONS: "reorder-questions",
  MOVE_QUESTION: "move-question",
  UPDATE_QUESTION_STATUS: "update-question-status",
  CREATE_ANSWER: "create-answer",
  ATTACH_ANSWER: "attach-answer",
  DETACH_ANSWER: "detach-answer",
  ADD_NOTE: "add-note",
} as const;

export type QuestionMutationAction =
  (typeof QUESTION_MUTATION_ACTIONS)[keyof typeof QUESTION_MUTATION_ACTIONS];

export interface QuestionMutationEvent {
  source: string;
  entityType: QuestionMutationEntityType;
  entityId?: number;
  questionId?: number;
  groupId?: number | null;
  previousGroupId?: number | null;
  action: QuestionMutationAction;
  changedFields?: string[];
  clientId?: string;
  timestamp: number;
}

export const createQuestionMutationPayload = (params: {
  source: string;
  entityType: QuestionMutationEntityType;
  entityId?: number;
  questionId?: number;
  groupId?: number | null;
  previousGroupId?: number | null;
  action: QuestionMutationAction;
  changedFields?: string[];
  clientId?: string;
}) => params;

export const emitQuestionMutation = (params: {
  source: string;
  entityType: QuestionMutationEntityType;
  entityId?: number;
  questionId?: number;
  groupId?: number | null;
  previousGroupId?: number | null;
  action: QuestionMutationAction;
  changedFields?: string[];
  clientId?: string;
}) => emitQuestionMutationEvent(createQuestionMutationPayload(params));

const getEventQuestionId = (event: QuestionMutationEvent) =>
  event.entityType === "question" ? event.entityId : event.questionId;

const getNestedField = (source: Record<string, unknown> | null | undefined, key: string) => {
  if (!source || typeof source !== "object") {
    return undefined;
  }
  return source[key];
};

export const shouldRefreshQuestionResult = (params: {
  event: QuestionMutationEvent;
  toolName: string;
  parsedInput: Record<string, unknown> | null | undefined;
  payloadKind?: string;
  payloadEntityType?: string;
  payloadId?: number | null;
}) => {
  const { event, toolName, parsedInput, payloadKind, payloadEntityType, payloadId } = params;

  if (toolName === "get_question_dashboard") {
    return true;
  }

  if (toolName === "query_question_groups") {
    return true;
  }

  if (toolName === "get_question_group_detail") {
    return (
      (payloadEntityType === "question-group" && event.entityId === payloadId) ||
      event.groupId === payloadId ||
      event.previousGroupId === payloadId ||
      event.action === QUESTION_MUTATION_ACTIONS.REORDER_GROUPS ||
      event.action === QUESTION_MUTATION_ACTIONS.REORDER_QUESTIONS
    );
  }

  if (toolName === "get_question_detail" || toolName === "get_question_answers") {
    return getEventQuestionId(event) === payloadId;
  }

  if (toolName === "query_questions" || payloadKind === "question-query-result") {
    const filter =
      (getNestedField(parsedInput, "filter") as Record<string, unknown> | undefined) ?? null;
    const questionIds = Array.isArray(filter?.questionIds) ? (filter?.questionIds as number[]) : [];
    const groupIds = Array.isArray(filter?.groupIds) ? (filter?.groupIds as number[]) : [];

    const eventQuestionId = getEventQuestionId(event);
    if (questionIds.length > 0) {
      return Boolean(eventQuestionId && questionIds.includes(eventQuestionId));
    }

    if (groupIds.length > 0) {
      return Boolean(
        (event.groupId != null && groupIds.includes(event.groupId)) ||
        (event.previousGroupId != null && groupIds.includes(event.previousGroupId))
      );
    }

    return true;
  }

  return true;
};
