import { Editor, Element, Range, Transforms, type Path } from "slate";
import { getCurrentTextNode } from "@tau/editor/api";
import { ReactEditor } from "slate-react";
import { v4 as getUuid } from "uuid";
export const wrapComment = (editor: Editor) => {
  const { selection } = editor;
  if (!selection || Range.isCollapsed(selection) || ReactEditor.isReadOnly(editor)) return;
  const node = getCurrentTextNode(editor)?.[0];
  if (node?.type === "formatted") {
    const text = Editor.string(editor, selection);
    editor.deleteBackward("character");
    Transforms.wrapNodes(
      editor,
      {
        type: "comment",
        comments: [],
        uuid: getUuid(),
        children: [{ type: "formatted", text }],
        openEdit: true,
      },
      {
        at: selection,
        split: true,
      }
    );
  }
};

export const unwrapComment = (editor: Editor, path?: Path) => {
  if (ReactEditor.isReadOnly(editor) || (!path && !editor.selection)) return;
  Transforms.unwrapNodes(editor, {
    match: n => Element.isElement(n) && n.type === "comment",
    at: path,
  });
};
