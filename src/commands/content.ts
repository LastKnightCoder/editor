import { invoke } from "@/electron";
import { Descendant } from "slate";
import { IContent } from "@/types";

export const createContent = async (
  content: Descendant[],
  count: number,
): Promise<number | null> => {
  return await invoke("content:create", {
    content,
    count,
  });
};

export const updateContent = async (
  contentId: number,
  content: Descendant[],
): Promise<IContent | null> => {
  return await invoke("content:update", contentId, {
    content,
  });
};

export const getContentById = async (
  contentId: number,
): Promise<IContent | null> => {
  return await invoke("content:get-by-id", contentId);
};

export const deleteContent = async (contentId: number): Promise<number> => {
  return await invoke("content:delete", contentId);
};

export const incrementContentRefCount = async (
  contentId: number,
): Promise<void> => {
  return await invoke("content:increment-ref-count", contentId);
};
