import { invoke } from "@/electron";
import { IQuestion, ICreateAnswer, IAnswer } from "@/types";
import { Descendant } from "slate";
import {
  emitQuestionMutation,
  QUESTION_MUTATION_ACTIONS,
} from "@/mcp/question/mutation";

interface QuestionMutationOptions {
  suppressMutationEvent?: boolean;
  mutationSource?: string;
}

export async function createQuestion(
  question: string,
  groupId: number,
  description: Descendant[],
  options?: QuestionMutationOptions,
): Promise<IQuestion> {
  const created = await invoke(
    "question:create",
    question,
    groupId,
    description,
  );
  if (!options?.suppressMutationEvent) {
    emitQuestionMutation({
      source: options?.mutationSource || "question-command",
      entityType: "question",
      entityId: created.id,
      questionId: created.id,
      groupId: created.groupId,
      action: QUESTION_MUTATION_ACTIONS.CREATE_QUESTION,
      changedFields: ["questionContent", "description", "groupId"],
    });
  }
  return created;
}

export async function updateQuestion(
  questionId: number,
  question: string,
  description?: Descendant[],
  options?: QuestionMutationOptions,
): Promise<IQuestion> {
  const updated = await invoke(
    "question:update",
    questionId,
    question,
    description,
  );
  if (!options?.suppressMutationEvent) {
    emitQuestionMutation({
      source: options?.mutationSource || "question-command",
      entityType: "question",
      entityId: updated.id,
      questionId: updated.id,
      groupId: updated.groupId,
      action: QUESTION_MUTATION_ACTIONS.UPDATE_QUESTION,
      changedFields: ["questionContent", "description"],
    });
  }
  return updated;
}

export async function deleteQuestion(
  id: number,
  options?: QuestionMutationOptions,
): Promise<number> {
  const current = await getQuestionById(id);
  const result = await invoke("question:delete", id);
  if (!options?.suppressMutationEvent) {
    emitQuestionMutation({
      source: options?.mutationSource || "question-command",
      entityType: "question",
      entityId: id,
      questionId: id,
      groupId: current?.groupId,
      action: QUESTION_MUTATION_ACTIONS.DELETE_QUESTION,
    });
  }
  return result;
}

export async function getQuestionById(id: number): Promise<IQuestion | null> {
  return invoke("question:get-question-by-id", id);
}

export async function getQuestionsByIds(ids: number[]): Promise<IQuestion[]> {
  return invoke("question:get-questions-by-ids", ids);
}

export async function getAllQuestions(): Promise<IQuestion[]> {
  return invoke("question:get-all-questions");
}

export async function createAnswer(content: Descendant[]): Promise<IAnswer> {
  return invoke("question:create-answer", content);
}

export async function addAnswer(
  questionId: number,
  answer: ICreateAnswer,
  incRefCount = false,
  options?: QuestionMutationOptions,
): Promise<IQuestion> {
  const updated = await invoke(
    "question:add-answer",
    questionId,
    answer,
    incRefCount,
  );
  if (!options?.suppressMutationEvent) {
    emitQuestionMutation({
      source: options?.mutationSource || "question-command",
      entityType: "question-answer",
      entityId: answer.contentId,
      questionId: updated.id,
      groupId: updated.groupId,
      action: incRefCount
        ? QUESTION_MUTATION_ACTIONS.ATTACH_ANSWER
        : QUESTION_MUTATION_ACTIONS.CREATE_ANSWER,
      changedFields: ["answers", "resolvedTime", "status"],
    });
  }
  return updated;
}

export async function updateAnswer(
  questionId: number,
  answers: number[],
  options?: QuestionMutationOptions,
): Promise<IQuestion> {
  const updated = await invoke("question:update-answer", questionId, answers);
  if (!options?.suppressMutationEvent) {
    emitQuestionMutation({
      source: options?.mutationSource || "question-command",
      entityType: "question-answer",
      questionId: updated.id,
      groupId: updated.groupId,
      action: QUESTION_MUTATION_ACTIONS.ATTACH_ANSWER,
      changedFields: ["answers", "resolvedTime", "status"],
    });
  }
  return updated;
}

export async function deleteAnswer(
  questionId: number,
  answerId: number,
  options?: QuestionMutationOptions,
): Promise<IQuestion> {
  const updated = await invoke("question:delete-answer", questionId, answerId);
  if (!options?.suppressMutationEvent) {
    emitQuestionMutation({
      source: options?.mutationSource || "question-command",
      entityType: "question-answer",
      entityId: answerId,
      questionId: updated.id,
      groupId: updated.groupId,
      action: QUESTION_MUTATION_ACTIONS.DETACH_ANSWER,
      changedFields: ["answers", "resolvedTime", "status"],
    });
  }
  return updated;
}

export async function getQuestionAnswers(
  questionId: number,
): Promise<IAnswer[]> {
  return invoke("question:get-question-answers", questionId);
}

export async function getNoAnswerQuestions(): Promise<IQuestion[]> {
  return invoke("question:get-no-answer-questions");
}

export async function listQuestionsByGroup(params: {
  groupId: number;
  filter?:
    | "all"
    | "answered"
    | "unanswered"
    | "not_started"
    | "in_progress"
    | "resolved";
  search?: string;
}): Promise<IQuestion[]> {
  return invoke(
    "question:list-by-group",
    params.groupId,
    params.filter ?? "all",
    params.search ?? "",
  );
}

export async function reorderQuestions(
  orderedIds: number[],
  options?: QuestionMutationOptions,
): Promise<number> {
  const firstQuestion =
    orderedIds.length > 0 ? await getQuestionById(orderedIds[0]) : null;
  const result = await invoke("question:reorder", { orderedIds });
  if (!options?.suppressMutationEvent) {
    emitQuestionMutation({
      source: options?.mutationSource || "question-command",
      entityType: "question",
      groupId: firstQuestion?.groupId,
      action: QUESTION_MUTATION_ACTIONS.REORDER_QUESTIONS,
      changedFields: ["sortIndex"],
    });
  }
  return result;
}

export async function moveQuestionToGroup(
  id: number,
  toGroupId: number,
  options?: QuestionMutationOptions,
): Promise<IQuestion> {
  const current = await getQuestionById(id);
  const moved = await invoke("question:move-to-group", { id, toGroupId });
  if (!options?.suppressMutationEvent) {
    emitQuestionMutation({
      source: options?.mutationSource || "question-command",
      entityType: "question",
      entityId: moved.id,
      questionId: moved.id,
      groupId: moved.groupId,
      previousGroupId: current?.groupId,
      action: QUESTION_MUTATION_ACTIONS.MOVE_QUESTION,
      changedFields: ["groupId"],
    });
  }
  return moved;
}

export async function updateQuestionStatus(
  questionId: number,
  status: "not_started" | "in_progress" | "resolved",
  options?: QuestionMutationOptions,
): Promise<IQuestion> {
  const updated = await invoke("question:update-status", questionId, status);
  if (!options?.suppressMutationEvent) {
    emitQuestionMutation({
      source: options?.mutationSource || "question-command",
      entityType: "question",
      entityId: updated.id,
      questionId: updated.id,
      groupId: updated.groupId,
      action: QUESTION_MUTATION_ACTIONS.UPDATE_QUESTION_STATUS,
      changedFields: ["status"],
    });
  }
  return updated;
}
