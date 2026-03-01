import { invoke } from "@/electron";
import {
  VideoNoteItem,
  CreateVideoNoteItemPayload,
  UpdateVideoNoteItemPayload,
} from "@/types";

export const createVideoNoteItem = async (
  payload: CreateVideoNoteItemPayload,
): Promise<VideoNoteItem> => {
  return await invoke("video-note-item:create", payload);
};

export const updateVideoNoteItem = async (
  payload: UpdateVideoNoteItemPayload,
): Promise<VideoNoteItem> => {
  return await invoke("video-note-item:update", payload);
};

export const deleteVideoNoteItem = async (id: number): Promise<number> => {
  return await invoke("video-note-item:delete", id);
};

export const getVideoNoteItemById = async (
  id: number,
): Promise<VideoNoteItem | null> => {
  return await invoke("video-note-item:get", id);
};

export const getVideoNoteItemByVideoNoteId = async (
  videoNoteId: number,
): Promise<VideoNoteItem | null> => {
  return await invoke("video-note-item:get-by-video-note-id", videoNoteId);
};

export const getVideoNoteItemsByVideoNoteId = async (
  videoNoteId: number,
): Promise<VideoNoteItem[]> => {
  return await invoke("video-note-item:list-by-video-note-id", videoNoteId);
};
