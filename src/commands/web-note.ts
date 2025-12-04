import { invoke } from "@/electron";
import { WebNote, CreateWebNotePayload, UpdateWebNotePayload } from "@/types";

export const createWebNote = async (
  payload: CreateWebNotePayload,
): Promise<WebNote> => {
  return await invoke("web-note:create", payload);
};

export const updateWebNote = async (
  payload: UpdateWebNotePayload,
): Promise<WebNote> => {
  return await invoke("web-note:update", payload);
};

export const deleteWebNote = async (id: number): Promise<number> => {
  return await invoke("web-note:delete", id);
};

export const getWebNoteById = async (id: number): Promise<WebNote | null> => {
  return await invoke("web-note:get", id);
};

export const listWebNotesByProjectItemId = async (
  projectItemId: number,
): Promise<WebNote[]> => {
  return await invoke("web-note:list-by-project-item", projectItemId);
};
