import { invoke } from "@/electron";
import {
  ContentLink,
  ContentLinkSourceType,
  ContentLinkTargetType,
  CreateContentLinkPayload,
  QueryContentLinkPayload,
} from "@/types";

export const createContentLink = async (
  payload: CreateContentLinkPayload,
): Promise<ContentLink> => {
  return await invoke("content-link:create", payload);
};

export const getContentLinkById = async (
  id: number,
): Promise<ContentLink | null> => {
  if (!id) return null;
  return await invoke("content-link:get", id);
};

export const queryContentLinkBySource = async (
  payload: QueryContentLinkPayload,
): Promise<ContentLink[]> => {
  return await invoke("content-link:query-by-source", payload);
};

export const queryContentLinkByTarget = async (
  targetId: number,
  targetType: ContentLinkTargetType,
): Promise<ContentLink[]> => {
  return await invoke("content-link:query-by-target", targetId, targetType);
};

export const deleteContentLink = async (id: number): Promise<number> => {
  return await invoke("content-link:delete", id);
};

export const deleteContentLinkBySource = async (
  sourceId: number,
  sourceType: ContentLinkSourceType,
): Promise<number> => {
  return await invoke("content-link:delete-by-source", sourceId, sourceType);
};
