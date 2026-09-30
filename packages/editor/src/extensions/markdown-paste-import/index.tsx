import type { Descendant } from "slate";

import { defineExtension } from "../../api";
import { createMarkdownPasteImportPlugin } from "../../plugins/withMarkdownPasteImport";
import type { ImportFromMarkdownOptions } from "../../plugins/withMarkdownPasteImport";

export type MarkdownImportFn = (
  markdown: string,
  ignoreTypes?: string[],
  options?: ImportFromMarkdownOptions
) => Descendant[];

/**
 * markdown 粘贴导入扩展（宿主 opt-in）：
 * 粘贴 markdown 文本时经宿主注入的 importFromMarkdown 解析为富文本结构。
 * 内核默认不启用，由宿主放进 kit 的 extensions；
 * 本扩展不对应任何元素类型，只贡献插件。
 */
export const createMarkdownPasteImportExtension = (importFromMarkdown: MarkdownImportFn) =>
  defineExtension({
    id: "tau.markdown-paste-import",
    plugins: [createMarkdownPasteImportPlugin(importFromMarkdown)],
  });
