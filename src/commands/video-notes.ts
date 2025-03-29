import { invoke } from "@/electron";
import { VideoNote } from "@/types";

export const createVideoNote = async (
  note: Omit<VideoNote, "id" | "createTime" | "updateTime">,
): Promise<VideoNote | null> => {
  try {
    const result = await invoke("create-video-note", note);
    return result;
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const updateVideoNote = async (
  note: Omit<VideoNote, "createTime" | "updateTime">,
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
