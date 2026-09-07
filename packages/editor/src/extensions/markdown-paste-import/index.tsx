import type { Descendant } from "slate";
import type { RenderElementProps } from "slate-react";

import Base from "../base";
import IExtension from "../types";
import { createMarkdownPasteImportPlugin } from "../../plugins/withMarkdownPasteImport";
import type { ImportFromMarkdownOptions } from "../../utils/markdownImport";

export type MarkdownImportFn = (
  markdown: string,
  ignoreTypes?: string[],
  options?: ImportFromMarkdownOptions
) => Descendant[];

/**
 * markdown 粘贴导入扩展（宿主 opt-in）：
 * 粘贴 markdown 文本时经宿主注入的 importFromMarkdown 解析为富文本结构。
 * 内核默认不启用，由宿主通过 EditorProvider 注入；
 * 本扩展不对应任何元素类型，render 不会被调用。
 */
export const createMarkdownPasteImportExtension = (
  importFromMarkdown: MarkdownImportFn
): IExtension => {
  class MarkdownPasteImportExtension extends Base implements IExtension {
    type = "markdown-paste-import";

    render(props: RenderElementProps) {
      return <>{props.children}</>;
    }
  }

  const extension = new MarkdownPasteImportExtension();
  extension.getPlugins = () => [createMarkdownPasteImportPlugin(importFromMarkdown)];
  return extension;
};
