import { bindDatabaseCommands, currentCommandScope } from "@/services/command-context";
import type { ContentContractDictionary } from "@tau/db-schema/content-contracts";
import { invoke } from "@/electron";
import { Descendant } from "slate";
import { IContent } from "@/types";
import { withModule } from "./module-init";
import type {
  AgentPermissionLevel,
  ContentAgentPermission,
  ContentQuestionRequest,
  ContentSuggestion,
  ContentSuggestionAcceptOptions,
  ContentSuggestionBatch,
  ContentSuggestionQuery,
} from "@/types/content-suggestion";
import type {
  ScopedContentBaseline,
  ScopedContentResult,
  ScopedContentSubmission,
} from "@tau/collaboration";

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

export interface ContentEditState {
  content: Descendant[];
  state: Uint8Array;
  identity: ScopedContentBaseline;
  revision: string;
}

export const readContentEditState = (contentId: number) =>
  contentAgentCommand<ContentEditState>("content:edit-snapshot", contentId);

export const applyScopedContentEdit = (contentId: number, request: ScopedContentSubmission) =>
  contentAgentCommand<ScopedContentResult>("content:apply-scoped-edit", contentId, request);

export interface ContentSuggestionOutcome {
  id: string;
  status: ContentSuggestion["status"];
  error?: string;
}

export const contentAgentCommand = <T>(channel: string, ...args: unknown[]) => {
  const commands = bindDatabaseCommands({ invoke }, currentCommandScope());
  return withModule("local-content", () => commands.invoke<T>(channel, ...args));
};

export const listContentSuggestions = (query: ContentSuggestionQuery) =>
  contentAgentCommand<ContentSuggestion[]>("content:suggestions", query);

export const createContentSuggestions = (contentId: number, batch: ContentSuggestionBatch) =>
  contentAgentCommand<ContentSuggestion[]>("content:suggestions-create", contentId, batch);

/** typing：直接改的条目在本机正文上逐段实时落地（有人在编辑那一块就让出） */
export const acceptContentSuggestions = (
  contentId: number,
  ids: string[],
  options?: ContentSuggestionAcceptOptions
) =>
  contentAgentCommand<ContentSuggestionOutcome[]>(
    "content:suggestions-accept",
    contentId,
    ids,
    options
  );

export const rejectContentSuggestions = (contentId: number, ids: string[], feedback?: string) =>
  contentAgentCommand<string[]>("content:suggestions-reject", contentId, ids, feedback);

export const supersedeContentSuggestions = (contentId: number, proposalId: string) =>
  contentAgentCommand<void>("content:suggestions-supersede", contentId, proposalId);

export const undoContentSuggestions = (contentId: number, ids: string[]) =>
  contentAgentCommand<ContentSuggestionOutcome[]>("content:suggestions-undo", contentId, ids);

export const createContentQuestion = (contentId: number, request: ContentQuestionRequest) =>
  contentAgentCommand<ContentSuggestion>("content:suggestions-question", contentId, request);

export const answerContentQuestion = (contentId: number, id: string, answer: string) =>
  contentAgentCommand<boolean>("content:suggestions-answer", contentId, id, answer);

export const listAgentPermissions = (contentId: number) =>
  contentAgentCommand<ContentAgentPermission[]>("content:agent-permissions", contentId);

export const getAgentPermission = (contentId: number, agent: string) =>
  contentAgentCommand<AgentPermissionLevel>("content:agent-permission", contentId, agent);

export const setAgentPermission = (contentId: number, agent: string, level: AgentPermissionLevel) =>
  contentAgentCommand<void>("content:agent-permission-set", contentId, agent, level);

export const deleteContent = async (contentId: number): Promise<number> => {
  return await invoke("content:delete", contentId);
};

export const incrementContentRefCount = async (contentId: number): Promise<void> => {
  return await invoke("content:increment-ref-count", contentId);
};

export const decrementContentRefCount = async (contentId: number): Promise<void> => {
  return await invoke("content:decrement-ref-count", contentId);
};
