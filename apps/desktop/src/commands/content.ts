import { invoke } from "@/electron";
import { Descendant } from "slate";
import { IContent } from "@/types";

export const createContent = async (
  content: Descendant[],
  count: number
): Promise<number | null> => {
  return await invoke("content:create", {
    content,
    count,
  });
};

/** 以待回收状态创建正文（ref_count 0），首次保存进表时由差集 retain */
export const createPendingContent = async (
  content: Descendant[],
  count?: number
): Promise<number | null> => {
  return await invoke("content:create-pending", {
    content,
    count,
  });
};

export const updateContent = async (
  contentId: number,
  content: Descendant[],
  expectedRevision?: string
): Promise<IContent | null> => {
  return await invoke("content:update", contentId, {
    content,
    expectedRevision,
  });
};

export const getContentById = async (contentId: number): Promise<IContent | null> => {
  return await invoke("content:get-by-id", contentId);
};

export const deleteContent = async (contentId: number): Promise<number> => {
  return await invoke("content:delete", contentId);
};

export const incrementContentRefCount = async (contentId: number): Promise<void> => {
  return await invoke("content:increment-ref-count", contentId);
};

export const decrementContentRefCount = async (contentId: number): Promise<void> => {
  return await invoke("content:decrement-ref-count", contentId);
};
