import { invoke } from "@/electron";
import {
  emitQuestionMutation,
  QUESTION_MUTATION_ACTIONS,
} from "@/mcp/question/mutation";

interface QuestionGroupMutationOptions {
  suppressMutationEvent?: boolean;
  mutationSource?: string;
}

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

export async function createQuestionGroup(
  params: {
    title: string;
    color?: string;
  },
  options?: QuestionGroupMutationOptions,
): Promise<QuestionGroupDTO | null> {
  const created = await invoke("question-group:create", params);
  if (created && !options?.suppressMutationEvent) {
    emitQuestionMutation({
      source: options?.mutationSource || "question-group-command",
      entityType: "question-group",
      entityId: created.id,
      groupId: created.id,
      action: QUESTION_MUTATION_ACTIONS.CREATE_GROUP,
      changedFields: ["title", "color"],
    });
  }
  return created;
}

export async function updateQuestionGroup(
  params: {
    id: number;
    title?: string;
    color?: string;
    sortIndex?: number;
  },
  options?: QuestionGroupMutationOptions,
): Promise<QuestionGroupDTO> {
  const updated = await invoke("question-group:update", params);
  if (!options?.suppressMutationEvent) {
    emitQuestionMutation({
      source: options?.mutationSource || "question-group-command",
      entityType: "question-group",
      entityId: updated.id,
      groupId: updated.id,
      action: QUESTION_MUTATION_ACTIONS.UPDATE_GROUP,
      changedFields: ["title", "color", "sortIndex"],
    });
  }
  return updated;
}

export async function deleteQuestionGroup(
  id: number,
  options?: QuestionGroupMutationOptions,
): Promise<number> {
  const result = await invoke("question-group:delete", id);
  if (!options?.suppressMutationEvent) {
    emitQuestionMutation({
      source: options?.mutationSource || "question-group-command",
      entityType: "question-group",
      entityId: id,
      groupId: id,
      action: QUESTION_MUTATION_ACTIONS.DELETE_GROUP,
    });
  }
  return result;
}

export async function reorderQuestionGroups(
  orderedIds: number[],
  options?: QuestionGroupMutationOptions,
): Promise<number> {
  const result = await invoke("question-group:reorder", { orderedIds });
  if (!options?.suppressMutationEvent) {
    emitQuestionMutation({
      source: options?.mutationSource || "question-group-command",
      entityType: "question-group",
      action: QUESTION_MUTATION_ACTIONS.REORDER_GROUPS,
      changedFields: ["sortIndex"],
    });
  }
  return result;
}

export async function getQuestionGroupStats(): Promise<
  { groupId: number; total: number; answered: number; unanswered: number }[]
> {
  return invoke("question-group:get-stats");
}
