import { invoke } from "@/electron";
import { CreateWebClipPayload, UpdateWebClipPayload, WebClip } from "@/types";

export const createWebClip = async (
  payload: CreateWebClipPayload,
): Promise<WebClip> => {
  return await invoke("web-clip:create", payload);
};

export const updateWebClip = async (
  payload: UpdateWebClipPayload,
): Promise<WebClip> => {
  return await invoke("web-clip:update", payload);
};

export const getWebClipById = async (id: number): Promise<WebClip | null> => {
  if (!id) return null;
  return await invoke("web-clip:get", id);
};

export const getWebClipByContentId = async (
  contentId: number,
): Promise<WebClip | null> => {
  if (!contentId) return null;
  return await invoke("web-clip:get-by-content-id", contentId);
};

export const getWebClipsByIds = async (ids: number[]): Promise<WebClip[]> => {
  if (!ids.length) return [];
  return await invoke("web-clip:list-by-ids", ids);
};

export const deleteWebClip = async (id: number): Promise<number> => {
  return await invoke("web-clip:delete", id);
};
