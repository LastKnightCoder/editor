import { invoke } from "@/electron";

export interface QuestionGroupDTO {
  id: number;
  title: string;
  color?: string;
  sortIndex: number;
  isDefault: boolean;
  createTime: number;
  updateTime: number;
}

export async function listQuestionGroups(): Promise<QuestionGroupDTO[]> {
  return invoke("question-group:list");
}

export async function getDefaultQuestionGroup(): Promise<QuestionGroupDTO> {
  return invoke("question-group:get-default");
}

export async function createQuestionGroup(params: {
  title: string;
  color?: string;
}): Promise<QuestionGroupDTO | null> {
  return invoke("question-group:create", params);
}

export async function updateQuestionGroup(params: {
  id: number;
  title?: string;
  color?: string;
  sortIndex?: number;
}): Promise<QuestionGroupDTO> {
  return invoke("question-group:update", params);
}

export async function deleteQuestionGroup(id: number): Promise<number> {
  return invoke("question-group:delete", id);
}

export async function reorderQuestionGroups(
  orderedIds: number[],
): Promise<number> {
  return invoke("question-group:reorder", { orderedIds });
}

export async function getQuestionGroupStats(): Promise<
  { groupId: number; total: number; answered: number; unanswered: number }[]
> {
  return invoke("question-group:get-stats");
}
