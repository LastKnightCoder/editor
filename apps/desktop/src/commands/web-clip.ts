import { invoke } from "@/electron";
import { CreateWebClipPayload, UpdateWebClipPayload, WebClip } from "@/types";

export const createWebClip = async (payload: CreateWebClipPayload): Promise<WebClip> => {
  return await invoke("web-clip:create", payload);
};

export const updateWebClip = async (payload: UpdateWebClipPayload): Promise<WebClip> => {
  return await invoke("web-clip:update", payload);
};

export const getWebClipById = async (id: number): Promise<WebClip | null> => {
  if (!id) return null;
  return await invoke("web-clip:get", id);
};
