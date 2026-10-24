import type { TextExtensionOptions } from "../extensions/text";
import { Descendant } from "slate";

import { getContentLength } from "./text";
import { isContentEmpty } from "@tau/db-schema/content-metrics";

export const createEmptyRichTextContent = (): Descendant[] => [
  { type: "paragraph", children: [{ type: "formatted", text: "" }] } as unknown as Descendant,
];

export const isRichTextContentEmpty = (content: Descendant[] | undefined) =>
  isContentEmpty(content);

/** 结构化的提交守门宿主：Board 与扩展 WhiteboardAPI 都满足 */
interface SubmissionHost {
  readonly readonly: boolean;
  readonly isDestroyed: boolean;
  captureSubmission?(): () => boolean;
}

/**
 * 新建富文本前先建好 content：ContentEditor 以 contentId 为 key，
 * 元素落位后再补 contentId 会重挂编辑器、丢掉刚拿到的焦点。
 * 建不出来时返回 undefined，元素仍可插入，聚焦时由 RichText 兜底补建。
 */
export const createRichTextContentId = async (
  content: Descendant[],
  board: SubmissionHost,
  binding: Pick<TextExtensionOptions, "create" | "release" | "countWords"> = {}
): Promise<number | undefined> => {
  const canSubmit = board.captureSubmission?.() ?? (() => !board.readonly && !board.isDestroyed);
  try {
    const contentId = await binding.create?.(
      content,
      (binding.countWords ?? getContentLength)(content)
    );
    if (contentId && !canSubmit()) {
      await binding.release?.(contentId);
      return undefined;
    }
    return contentId ?? undefined;
  } catch (error) {
    console.error("Failed to create rich text content:", error);
    return undefined;
  }
};
