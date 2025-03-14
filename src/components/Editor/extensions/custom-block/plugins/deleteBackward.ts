import { Editor, Element as SlateElement, Range, Transforms } from "slate";
import {
  isAtParagraphStart,
  isParagraphAndEmpty,
} from "@/components/Editor/utils";

export const deleteBackward = (editor: Editor) => {
  const { deleteBackward } = editor;

  editor.deleteBackward = (unit) => {
    const { selection } = editor;
    if (selection && Range.isCollapsed(selection)) {
      const [match] = Editor.nodes(editor, {
        match: (n) => SlateElement.isElement(n) && editor.isBlock(n),
      });
      if (match) {
        const [, path] = match;
        if (isAtParagraphStart(editor)) {
          // 如果前一个是 custom-block，删除当前 paragraph，并聚焦到 custom-block
          const prevPath = Editor.before(editor, path);
          if (prevPath) {
            const [prevMatch] = Editor.nodes(editor, {
              at: prevPath,
              match: (n) =>
                SlateElement.isElement(n) && n.type === "custom-block",
            });
            if (prevMatch) {
              if (isParagraphAndEmpty(editor)) {
                Transforms.removeNodes(editor, { at: path });
              }

              const [element] = prevMatch;
              const focusEvent = new CustomEvent("preview-editor-focus", {
                detail: element,
              });
              document.dispatchEvent(focusEvent);

              return;
            }
          }
        }
      }
    }
    return deleteBackward(unit);
  };

  return editor;
};
