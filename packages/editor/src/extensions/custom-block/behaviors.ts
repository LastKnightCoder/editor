import { Editor, Element as SlateElement, Transforms } from "slate";

import type { ElementBehaviors } from "../../api";
import type { ParagraphElement } from "../../types";
import { isAtParagraphStart, isParagraphAndEmpty } from "../../utils";

/**
 * 段首退格且前一块是 custom-block：删掉当前空段落并聚焦该块的预览编辑器
 * （知识属于 custom-block，挂在 paragraph 的行为上）。
 */
const deleteBackward: ElementBehaviors<ParagraphElement>["deleteBackward"] = (editor, [, path]) => {
  // isAtParagraphStart 内部已含「选区 collapsed 且在该段落开头」
  if (!isAtParagraphStart(editor)) return false;

  const prevPath = Editor.before(editor, path);
  if (!prevPath) return false;
  const [prevMatch] = Editor.nodes(editor, {
    at: prevPath,
    match: n => SlateElement.isElement(n) && n.type === "custom-block",
  });
  if (!prevMatch) return false;

  if (isParagraphAndEmpty(editor)) {
    Transforms.removeNodes(editor, { at: path });
  }

  const [element] = prevMatch;
  document.dispatchEvent(
    new CustomEvent("preview-editor-focus", {
      detail: element,
    })
  );
  return true;
};

export const customBlockForParagraph: ElementBehaviors<ParagraphElement> = {
  deleteBackward,
};
