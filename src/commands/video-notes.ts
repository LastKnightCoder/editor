import { invoke } from "@/electron";
import { VideoNote } from "@/types";

export const createEmptyVideoNote = async (
  metaInfo: VideoNote["metaInfo"],
): Promise<VideoNote | null> => {
  try {
    const result = await invoke("create-empty-video-note", metaInfo);
    return result;
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const updateVideoNote = async (
  note: Omit<VideoNote, "createTime" | "updateTime" | "notes"> & {
    notes: Omit<VideoNote["notes"][number], "content" | "count">[];
  },
): Promise<VideoNote | null> => {
  try {
    const result = await invoke("update-video-note", note);
    return result;
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const deleteVideoNote = async (id: number): Promise<number | null> => {
  try {
    const result = await invoke("delete-video-note", id);
    return result;
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const getVideoNoteById = async (
  id: number,
): Promise<VideoNote | null> => {
  try {
    const result = await invoke("get-video-note-by-id", id);
    return result;
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const getAllVideoNotes = async (): Promise<VideoNote[]> => {
  try {
    const result = await invoke("get-all-video-notes");
    return result;
  } catch (error) {
    console.error(error);
    return [];
  }
};

export const addSubNote = async (
  videoNoteId: number,
  subNote: Omit<VideoNote["notes"][number], "contentId">,
): Promise<VideoNote["notes"][number] | null> => {
  try {
    const result = await invoke("add-sub-note", videoNoteId, subNote);
    return result;
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const deleteSubNote = async (
  videoNoteId: number,
  subNoteId: string,
): Promise<boolean> => {
  try {
    const result = await invoke("delete-sub-note", videoNoteId, subNoteId);
    return result;
  } catch (error) {
    console.error(error);
    return false;
  }
};

export const updateSubNote = async (
  subNote: VideoNote["notes"][number],
): Promise<VideoNote["notes"][number] | null> => {
  try {
    const result = await invoke("update-sub-note", subNote);
    return result;
  } catch (error) {
    console.error(error);
    return null;
  }
};
