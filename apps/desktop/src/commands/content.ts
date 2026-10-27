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

/**
 * 整篇替换已有正文：Markdown 按契约解析（还原无损载荷），节点绑定契约与身份，合并原文档契约后写入。
 * 不传 expectedRevision 时以写入前读到的修订为准；已有正文的写回一律走这里，不要用裸节点调 updateContent。
 */
export const replaceContent = async (
  contentId: number,
  input: { markdown: string; ignoreTypes?: string[] } | { nodes: Descendant[] },
  expectedRevision?: string
): Promise<IContent | null> => {
  const scope = currentCommandScope();
  const current = await bindDatabaseCommands({ getContentById }, scope).getContentById(contentId);
  if (!current) return null;
  const { prepareContentContracts, prepareContentMarkdown } = await import("@/services/editorKit");
  const parsed =
    "markdown" in input
      ? await (await prepareContentMarkdown({})).importDocument(input.markdown, input.ignoreTypes)
      : { content: input.nodes, contracts: {} };
  const catalog = await prepareContentContracts();
  const document = await catalog.createDocument(parsed.content, {
    ...current.contracts,
    ...parsed.contracts,
  });
  return bindDatabaseCommands({ updateContent }, scope).updateContent(
    contentId,
    document.content,
    expectedRevision ?? current.revision,
    { ...current.contracts, ...document.contracts }
  );
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
