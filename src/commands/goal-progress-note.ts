import { invoke } from "@/electron";
import { IGoalProgressNoteLink } from "@/types/goal";

export const listGoalProgressNotes = async (
  goalProgressEntryId: number,
): Promise<IGoalProgressNoteLink[]> => {
  return invoke("goalProgressNote:list", { goalProgressEntryId });
};

export const attachExistingGoalProgressNote = async (params: {
  goalProgressEntryId: number;
  contentId: number;
  title?: string;
  type?: string;
}): Promise<IGoalProgressNoteLink> => {
  return invoke("goalProgressNote:attachExisting", params);
};

export const createAndAttachGoalProgressNote = async (
  goalProgressEntryId: number,
  initialTitle?: string,
): Promise<{ link: IGoalProgressNoteLink; contentId: number }> => {
  return invoke("goalProgressNote:createAndAttach", {
    goalProgressEntryId,
    initialTitle,
  });
};

export const detachGoalProgressNote = async (
  linkId: number,
): Promise<number> => {
  return invoke("goalProgressNote:detach", { linkId });
};

export const reorderGoalProgressNotes = async (
  goalProgressEntryId: number,
  orderedLinkIds: number[],
): Promise<number> => {
  return invoke("goalProgressNote:reorder", {
    goalProgressEntryId,
    orderedLinkIds,
  });
};

export const updateGoalProgressNoteTitle = async (
  linkId: number,
  title: string,
): Promise<number> => {
  return invoke("goalProgressNote:updateTitleSnapshot", { linkId, title });
};

export const updateGoalProgressNoteType = async (
  linkId: number,
  type: string,
): Promise<number> => {
  return invoke("goalProgressNote:updateType", { linkId, type });
};
