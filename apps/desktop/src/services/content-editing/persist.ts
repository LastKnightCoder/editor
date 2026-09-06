import { Descendant } from "slate";
import { updateContent } from "@/commands/content";
import { defaultContentEventBus } from "@/utils/event-bus/content-event-bus";
import { importFromMarkdownWithPositions } from "@/utils/markdown";

export const markdownToContent = (markdown: string): Descendant[] => {
  const { content } = importFromMarkdownWithPositions(markdown);
  return content;
};

export const persistContentFromMarkdown = async (payload: {
  contentId: number;
  markdown: string;
  expectedRevision?: string;
  sourceUuid?: string;
}) => {
  const { contentId, markdown, sourceUuid = "content-edit-tools" } = payload;
  const content = markdownToContent(markdown);
  const updated = await updateContent(contentId, content, payload.expectedRevision);

  if (!updated) {
    throw new Error(`TARGET_NOT_FOUND: 未找到 content ${contentId}`);
  }

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
}) => {
  const { contentId, content, sourceUuid = "content-edit-tools" } = payload;
  const updated = await updateContent(contentId, content, payload.expectedRevision);

  if (!updated) {
    throw new Error(`TARGET_NOT_FOUND: 未找到 content ${contentId}`);
  }

  defaultContentEventBus.publish("content:updated", {
    content: updated,
    sourceUuid,
  });

  return {
    updated,
    content,
  };
};
