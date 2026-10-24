import type { Descendant } from "slate";
import { mobileImportFromMarkdown } from "../../services/editorMarkdown";
import { createEmptyEditorContent } from "../cards/editorContentUtils";

/** 与桌面端 Markdown 导入同口径：忽略 YAML 头；解析为空时给一个空段落，保证可渲染、可落库 */
export function parseIncomingMarkdown(markdown: string): Descendant[] {
  const content = mobileImportFromMarkdown(markdown, ["yaml"]);
  return content.length > 0 ? content : createEmptyEditorContent();
}
