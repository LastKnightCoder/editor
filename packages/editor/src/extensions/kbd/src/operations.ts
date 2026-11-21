import { Editor, Transforms } from "slate";
import { ReactEditor } from "slate-react";
import { wrapInlineText } from "@tau/editor/api";
export const unwrapKbd = (editor: Editor) => {
  if (!editor.selection || ReactEditor.isReadOnly(editor)) return;
  Transforms.unwrapNodes(editor, {
    match: n => n.type === "kbd",
  });
};

export const wrapKbd = (editor: Editor) => {
  if (ReactEditor.isReadOnly(editor)) return;
  wrapInlineText(editor, () => ({
    type: "kbd",
    children: [],
  }));
};
