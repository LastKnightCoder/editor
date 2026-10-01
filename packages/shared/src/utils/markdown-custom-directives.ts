import type { Descendant } from "slate";
import { v4 as uuid } from "uuid";

/**
 * 业务元素的 markdown directive 解析器：
 * 这些元素类型（文件附件、内容链接、时间戳）由各端动态扩展提供，
 * 编辑器内核的 markdownImport 不感知它们，经 importFromMarkdown 的
 * customDirectives 注入（container / leaf / text 三种 directive 均支持）。
 */

export const markdownCustomDirectives: Record<
  string,
  (attributes: Record<string, string | undefined>) => Descendant | null
> = {
  "file-attachment": attributes => {
    const element = {
      type: "file-attachment",
      fileName: attributes.fileName || "",
      filePath: attributes.filePath || "",
      localFilePath: attributes.localFilePath,
      isLocal: attributes.isLocal === "true",
      uuid: attributes.uuid || uuid(),
      children: [{ type: "formatted", text: "" }],
    };
    return element as unknown as Descendant;
  },
  "content-link": attributes => {
    const rawTitle = attributes.title || attributes.contentTitle || "";
    const contentTitle = typeof rawTitle === "string" ? rawTitle.replace(/&quot;/g, '"') : "";
    return {
      type: "content-link",
      refId: parseInt(attributes.refId || "0", 10),
      contentId: parseInt(attributes.contentId || "0", 10),
      contentType: attributes.contentType || "",
      contentTitle,
      children: [{ type: "formatted", text: "" }],
    } as unknown as Descendant;
  },
  time: attributes => {
    return {
      type: "summary-timestamp",
      start: parseInt(attributes.start || "0", 10),
      end: parseInt(attributes.end || "0", 10),
      children: [{ type: "formatted", text: "" }],
    } as unknown as Descendant;
  },
};
