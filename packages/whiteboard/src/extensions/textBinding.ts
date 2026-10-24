import type { Descendant } from "slate";
import type { WhiteboardAPI } from "./api";
import type { TextExtensionOptions } from "./text";
import { getContentLength } from "../utils/text";

/** 新正文只有成功关联到原元素才转移所有权，否则在原数据源释放。 */
export async function bindTextContent(
  api: WhiteboardAPI,
  elementId: string,
  binding: Pick<TextExtensionOptions, "create" | "update" | "release" | "countWords">,
  readContent: () => Descendant[]
): Promise<number | undefined> {
  const element = api.getElement(elementId);
  if (!element || element.type !== "richtext") return undefined;
  if (element.contentId) return element.contentId;
  if (!binding.create) return undefined;
  const valid = api.captureSubmission(elementId);
  if (!valid()) return undefined;
  const content = readContent();
  const id = await binding.create(content, (binding.countWords ?? getContentLength)(content));
  if (!id) throw new Error("创建正文失败");
  let committed = false;
  try {
    if (!valid()) return undefined;
    await binding.update?.(id, readContent());
    if (!valid()) return undefined;
    const current = api.getElement(elementId);
    if (current?.contentId) return current.contentId;
    committed = api.updateElement(elementId, { contentId: id, content: readContent() });
    return committed ? id : undefined;
  } finally {
    if (!committed) await binding.release?.(id);
  }
}
