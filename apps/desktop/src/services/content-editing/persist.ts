import { Descendant } from "slate";
import { replaceContent, updateContent } from "@/commands/content";
import { defaultContentEventBus } from "@/utils/event-bus/content-event-bus";
import { importFromMarkdownWithPositions } from "@/utils/markdown";
import { bindDatabaseCommands, type CommandScope } from "@/services/command-context";
import { getChatDatabase } from "@/services/chatDatabase";

/** 只读预览用：结果不带契约与节点身份，不能写回正文（写回用 `replaceContent`） */
export const markdownToContent = (markdown: string): Descendant[] => {
  const { content } = importFromMarkdownWithPositions(markdown);
  return content;
};

export const persistContentFromMarkdown = async (payload: {
  contentId: number;
  markdown: string;
  expectedRevision?: string;
  sourceUuid?: string;
  scope?: CommandScope;
}) => {
  const { contentId, markdown, sourceUuid = "content-edit-tools" } = payload;
  const updated = await bindDatabaseCommands({ replaceContent }, payload.scope).replaceContent(
    contentId,
    { markdown },
    payload.expectedRevision
  );

  if (!updated) {
    throw new Error(`TARGET_NOT_FOUND: 未找到 content ${contentId}`);
  }
  const content = updated.content;

  if (
    !payload.scope?.databaseName ||
    payload.scope.databaseName.replace(/\.db$/, "") === getChatDatabase()
  )
    defaultContentEventBus.publish("content:updated", {
      content: updated,
      sourceUuid,
    });

  return {
    updated,
    content,
  };
};

export const persistContentValue = async (payload: {
  contentId: number;
  content: Descendant[];
  expectedRevision?: string;
  sourceUuid?: string;
  scope?: CommandScope;
}) => {
  const { contentId, content, sourceUuid = "content-edit-tools" } = payload;
  const updated = await bindDatabaseCommands({ updateContent }, payload.scope).updateContent(
    contentId,
    content,
    payload.expectedRevision
  );

  if (!updated) {
    throw new Error(`TARGET_NOT_FOUND: 未找到 content ${contentId}`);
  }

  if (
    !payload.scope?.databaseName ||
    payload.scope.databaseName.replace(/\.db$/, "") === getChatDatabase()
  )
    defaultContentEventBus.publish("content:updated", {
      content: updated,
      sourceUuid,
    });

  return {
    updated,
    content,
  };
};
