import { Editor, Element, Node, type Path } from "slate";
import { ReactEditor } from "slate-react";
import type { EditorCommandContext } from "../api/command";

/** 写入命令必须命中仍在当前文档中的原元素，菜单保存的旧路径不能指向替代节点。 */
export function getCommandElementPath(editor: Editor, context: EditorCommandContext): Path | null {
  if (ReactEditor.isReadOnly(editor) || !context.element || !Element.isElement(context.element))
    return null;
  try {
    const hint = context.path;
    if (hint?.length && Node.has(editor, hint) && Node.get(editor, hint) === context.element)
      return hint;
    const path = ReactEditor.findPath(editor, context.element);
    return path.length && Node.get(editor, path) === context.element ? path : null;
  } catch {
    return null;
  }
}
