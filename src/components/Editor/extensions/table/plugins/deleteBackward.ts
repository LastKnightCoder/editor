import { Editor, Element as SlateElement, Range, Transforms } from "slate";
import { isAtParagraphStart, isParagraphAndEmpty, isParagraphElement, movePrevCol } from "@/components/Editor/utils";

export const deleteBackward = (editor: Editor) => {
  const { deleteBackward, delete: editorDelete } = editor;

  editor.deleteBackward = (unit) => {
    const { selection } = editor;
    if (selection && Range.isCollapsed(selection)) {
      const [cell] = Editor.nodes(editor, {
        match: n => n.type === 'table-cell',
      });
      if (cell) {
        const [text] = Editor.nodes(editor, {
          match: n => n.type === 'formatted',
        });
        if (text) {
          const [, path] = text;
          if (path[path.length - 1] === 0 && Editor.isStart(editor, selection.anchor, path)) {
            movePrevCol(editor);
            return;
          }
        }
      }
      if (isAtParagraphStart(editor)) {
        const [match] = Editor.nodes(editor, {
          match: n => SlateElement.isElement(n) && isParagraphElement(n),
        });
        const [, path] = match;
        const prevPath = Editor.before(editor, path);
        if (prevPath) {
          const [prevMatch] = Editor.nodes(editor, {
            at: prevPath,
            match: n => SlateElement.isElement(n) && n.type === 'table',
          });
          if (prevMatch) {
            if (isParagraphAndEmpty(editor)) {
              Transforms.removeNodes(editor, { at: path });
            }
            Transforms.move(editor, { distance: -1, unit: 'line' });
            return;
          }
        }
      }
    }

    deleteBackward(unit);
  }

  editor.delete = (unit) => {
    const { selection } = editor;
    const [match] = Editor.nodes(editor, {
      match: n => SlateElement.isElement(n) && n.type === 'table-cell',
    });
    const anchor = selection?.anchor;
    const focus = selection?.focus;
    if (match && anchor && focus) {
      const anchorPath = anchor.path;
      const focusPath = focus.path;
      if (anchorPath.some((v, i) => v !== focusPath[i])) {
        return;
      }
    }
    editorDelete(unit);
  }

  return editor;
}