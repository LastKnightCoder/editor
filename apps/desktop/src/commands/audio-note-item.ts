import { invoke } from "@/electron";
import { AudioNoteItem } from "@/types";

export interface CreateAudioNoteItemPayload {
  audioNoteId: number;
  contentId: number;
  title?: string;
}

export interface UpdateAudioNoteItemPayload {
  id: number;
  title?: string;
}

export const createAudioNoteItem = async (
  payload: CreateAudioNoteItemPayload,
): Promise<AudioNoteItem> => {
  return await invoke("audio-note-item:create", payload);
};

export const updateAudioNoteItem = async (
  payload: UpdateAudioNoteItemPayload,
): Promise<AudioNoteItem> => {
  return await invoke("audio-note-item:update", payload);
};

export const deleteAudioNoteItem = async (id: number): Promise<number> => {
  return await invoke("audio-note-item:delete", id);
};

export const getAudioNoteItemById = async (
  id: number,
): Promise<AudioNoteItem | null> => {
  return await invoke("audio-note-item:get", id);
};

export const getAudioNoteItemByAudioNoteId = async (
  audioNoteId: number,
): Promise<AudioNoteItem | null> => {
  return await invoke("audio-note-item:get-by-audio-note-id", audioNoteId);
};

export const getAudioNoteItemsByAudioNoteId = async (
  audioNoteId: number,
): Promise<AudioNoteItem[]> => {
  return await invoke("audio-note-item:list-by-audio-note-id", audioNoteId);
};
