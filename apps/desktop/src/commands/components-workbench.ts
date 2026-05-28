import { invoke } from "@/electron";
import type {
  WorkbenchExpiringCardsResponse,
  WorkbenchPageRequest,
  WorkbenchQuestionPreviewRequest,
  WorkbenchQuestionPreviewResponse,
  WorkbenchTodoPreviewRequest,
  WorkbenchTodoPreviewResponse,
} from "@/types";

export const listExpiringTemporaryCards = async (
  payload: WorkbenchPageRequest = {},
): Promise<WorkbenchExpiringCardsResponse> => {
  return invoke("workbench:list-expiring-temporary-cards", payload);
};

export const listTodoPreview = async (
  payload: WorkbenchTodoPreviewRequest = {},
): Promise<WorkbenchTodoPreviewResponse> => {
  return invoke("workbench:list-todo-preview", payload);
};

export const listQuestionPreview = async (
  payload: WorkbenchQuestionPreviewRequest = {},
): Promise<WorkbenchQuestionPreviewResponse> => {
  return invoke("workbench:list-question-preview", payload);
};
