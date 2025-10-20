import { invoke } from "@/electron";
import { IQuestion, ICreateAnswer, IAnswer } from "@/types";
import { Descendant } from "slate";

export async function createQuestion(
  question: string,
  groupId: number,
): Promise<IQuestion> {
  return invoke("question:create", question, groupId);
}

export async function updateQuestion(
  questionId: number,
  question: string,
): Promise<IQuestion> {
  return invoke("question:update", questionId, question);
}

export async function deleteQuestion(id: number): Promise<number> {
  return invoke("question:delete", id);
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
): Promise<IQuestion> {
  return invoke("question:add-answer", questionId, answer, incRefCount);
}

export async function updateAnswer(
  questionId: number,
  answers: number[],
): Promise<IQuestion> {
  return invoke("question:update-answer", questionId, answers);
}

export async function deleteAnswer(
  questionId: number,
  answerId: number,
): Promise<IQuestion> {
  return invoke("question:delete-answer", questionId, answerId);
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
  filter?: "all" | "answered" | "unanswered";
  search?: string;
}): Promise<IQuestion[]> {
  return invoke(
    "question:list-by-group",
    params.groupId,
    params.filter ?? "all",
    params.search ?? "",
  );
}

export async function reorderQuestions(orderedIds: number[]): Promise<number> {
  return invoke("question:reorder", { orderedIds });
}

export async function moveQuestionToGroup(
  id: number,
  toGroupId: number,
): Promise<IQuestion> {
  return invoke("question:move-to-group", { id, toGroupId });
}
