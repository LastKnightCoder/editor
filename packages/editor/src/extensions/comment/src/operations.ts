import { Editor, Element, Transforms, type Path } from "slate";
import { wrapInlineText } from "@tau/editor/api";
import { ReactEditor } from "slate-react";
import { v4 as getUuid } from "uuid";
export const wrapComment = (editor: Editor) => {
  if (ReactEditor.isReadOnly(editor)) return;
  wrapInlineText(editor, () => ({
    type: "comment",
    comments: [],
    uuid: getUuid(),
    children: [],
    openEdit: true,
  }));
};

export const unwrapComment = (editor: Editor, path?: Path) => {
  if (ReactEditor.isReadOnly(editor) || (!path && !editor.selection)) return;
  Transforms.unwrapNodes(editor, {
    match: n => Element.isElement(n) && n.type === "comment",
    at: path,
  });
};
