import { Editor, Element, Node, Range, type NodeEntry } from "slate";
import type { FormattedText } from "../types/text";

/** 空格触发的段落快捷语法只读取段落首个文本节点，语法判断由扩展负责。 */
export function getParagraphShortcutEntry(
  editor: Editor,
  text: string
): NodeEntry<FormattedText> | undefined {
  if (!text.endsWith(" ") || !editor.selection || !Range.isCollapsed(editor.selection)) return;
  const [paragraph] = Editor.nodes(editor, {
    match: node => Element.isElement(node) && node.type === "paragraph",
  });
  if (!paragraph || paragraph[0].type !== "paragraph") return;
  const [entry] = Editor.nodes(editor, {
    match: node => Node.isNode(node) && node.type === "formatted",
  });
  if (entry?.[0].type === "formatted" && paragraph[0].children[0] === entry[0]) {
    return entry as NodeEntry<FormattedText>;
  }
}
