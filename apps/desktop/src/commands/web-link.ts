import { invoke } from "@/electron";
import { CreateWebLinkPayload, UpdateWebLinkPayload, WebLink } from "@/types";

export const createWebLink = async (payload: CreateWebLinkPayload): Promise<WebLink> => {
  return await invoke("web-link:create", payload);
};

export const updateWebLink = async (payload: UpdateWebLinkPayload): Promise<WebLink> => {
  return await invoke("web-link:update", payload);
};

export const getWebLinkById = async (id: number): Promise<WebLink | null> => {
  if (!id) return null;
  return await invoke("web-link:get", id);
};
