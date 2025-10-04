import { invoke } from "@/electron";
import { IGoalNoteLink } from "@/types/goal";

export const listGoalNotes = async (
  goalId: number,
): Promise<IGoalNoteLink[]> => {
  return invoke("goalNote:list", { goalId });
};

export const attachExistingGoalNote = async (params: {
  goalId: number;
  contentId: number;
  title?: string;
  type?: string;
}): Promise<IGoalNoteLink> => {
  return invoke("goalNote:attachExisting", params);
};

export const createAndAttachGoalNote = async (
  goalId: number,
  initialTitle?: string,
): Promise<{ link: IGoalNoteLink; contentId: number }> => {
  return invoke("goalNote:createAndAttach", {
    goalId,
    initialTitle,
  });
};

export const detachGoalNote = async (linkId: number): Promise<number> => {
  return invoke("goalNote:detach", { linkId });
};

export const reorderGoalNotes = async (
  goalId: number,
  orderedLinkIds: number[],
): Promise<number> => {
  return invoke("goalNote:reorder", {
    goalId,
    orderedLinkIds,
  });
};

export const updateGoalNoteTitle = async (
  linkId: number,
  title: string,
): Promise<number> => {
  return invoke("goalNote:updateTitleSnapshot", { linkId, title });
};

export const updateGoalNoteType = async (
  linkId: number,
  type: string,
): Promise<number> => {
  return invoke("goalNote:updateType", { linkId, type });
};
