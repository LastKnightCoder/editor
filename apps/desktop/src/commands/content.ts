import { bindDatabaseCommands, currentCommandScope } from "@/services/command-context";
import type { ContentContractDictionary } from "@tau/db-schema/content-contracts";
import { invoke } from "@/electron";
import { Descendant } from "slate";
import { IContent } from "@/types";

export const createContent = async (
  content: Descendant[],
  count: number,
  contracts?: ContentContractDictionary
): Promise<number | null> => {
  const command = bindDatabaseCommands({ invoke }, currentCommandScope());
  return await command.invoke("content:create", {
    ...(await (await import("@/services/editorKit")).prepareNewContent(content, contracts)),
    count,
  });
};

/** 以待回收状态创建正文（ref_count 0），首次保存进表时由差集 retain */
export const createPendingContent = async (
  content: Descendant[],
  count?: number,
  contracts?: ContentContractDictionary
): Promise<number | null> => {
  const command = bindDatabaseCommands({ invoke }, currentCommandScope());
  return await command.invoke("content:create-pending", {
    ...(await (await import("@/services/editorKit")).prepareNewContent(content, contracts)),
    count,
  });
};

export const updateContent = async (
  contentId: number,
  content: Descendant[],
  expectedRevision?: string,
  contracts?: ContentContractDictionary
): Promise<IContent | null> => {
  return await invoke("content:update", contentId, {
    content,
    expectedRevision,
    contracts,
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
