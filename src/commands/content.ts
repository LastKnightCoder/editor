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
