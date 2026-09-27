import { Descendant } from "slate";

import { createContent, deleteContent } from "@/commands/content";
import { getContentLength } from "@/utils";

export const createEmptyRichTextContent = (): Descendant[] => [
  { type: "paragraph", children: [{ type: "formatted", text: "" }] } as unknown as Descendant,
];

export const isRichTextContentEmpty = (content: Descendant[] | undefined) =>
  !content || getContentLength(content) === 0;

/**
 * 新建富文本前先建好 content：ContentEditor 以 contentId 为 key，
 * 元素落位后再补 contentId 会重挂编辑器、丢掉刚拿到的焦点。
 * 建不出来时返回 undefined，元素仍可插入，聚焦时由 RichText 兜底补建。
 */
export const createRichTextContentId = async (
  content: Descendant[]
): Promise<number | undefined> => {
  try {
    const contentId = await createContent(content, getContentLength(content));
    return contentId ?? undefined;
  } catch (error) {
    console.error("Failed to create rich text content:", error);
    return undefined;
  }
};

/** 删除空白富文本时顺手回收它的 content，避免留下孤立行 */
export const deleteRichTextContent = async (contentId: number | undefined) => {
  if (!contentId) return;
  try {
    await deleteContent(contentId);
  } catch (error) {
    console.error("Failed to delete rich text content:", error);
  }
};
